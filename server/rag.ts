import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { extractText } from "unpdf";
import { db } from "./db";

const DEFAULT_KB_PATH = path.join(process.cwd(), "voxlead-ai", "knowledge_base.txt");

export interface RetrievedChunk {
  id: number;
  filename: string;
  title: string;
  content: string;
  score: number;
}

function getAiClientOrNull(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

function chunkText(rawText: string, filename: string): Array<{ title: string; content: string }> {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Split by markdown headings first; if large, split further with overlap
  const rawSections = normalized.split(/\n(?=## )/);
  const chunks: Array<{ title: string; content: string }> = [];

  for (const sec of rawSections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;
    const firstLine = trimmed.split("\n")[0] ?? filename;
    const title = firstLine.startsWith("##")
      ? firstLine.replace(/^##\s*/, "").trim()
      : `${filename} — Section ${chunks.length + 1}`;

    if (trimmed.length <= 900) {
      chunks.push({ title, content: trimmed });
    } else {
      let start = 0;
      let part = 1;
      while (start < trimmed.length) {
        const end = Math.min(start + 800, trimmed.length);
        chunks.push({
          title: `${title} (Part ${part})`,
          content: trimmed.slice(start, end).trim(),
        });
        if (end >= trimmed.length) break;
        start = Math.max(0, end - 120);
        part += 1;
      }
    }
  }
  return chunks;
}

async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const ai = getAiClientOrNull();
  if (!ai || texts.length === 0) return null;

  try {
    const embeddings: number[][] = [];
    for (const text of texts) {
      const result = await ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: text,
      });
      const values = result.embeddings?.[0]?.values;
      if (!values || values.length === 0) return null;
      embeddings.push(values);
    }
    return embeddings;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function keywordOverlapScore(query: string, content: string): number {
  const qTerms = new Set(query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
  const cTerms = content.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  if (qTerms.size === 0 || cTerms.length === 0) return 0;
  let hits = 0;
  for (const term of cTerms) {
    if (qTerms.has(term)) hits += 1;
  }
  return hits / Math.sqrt(cTerms.length * qTerms.size);
}

export async function indexDocumentContent(
  filename: string,
  fileType: "txt" | "pdf",
  rawText: string
): Promise<{ docId: number; chunkCount: number; hasEmbeddings: boolean }> {
  const chunks = chunkText(rawText, filename);
  if (chunks.length === 0) {
    throw new Error("Document contained no extractable text.");
  }

  const embeddings = await embedTexts(chunks.map((c) => c.content));
  const hasEmbeddings = Boolean(embeddings && embeddings.length === chunks.length);

  // Replace existing document with the same filename to prevent duplicates
  const existing = db
    .prepare("SELECT id FROM documents WHERE filename = ? LIMIT 1")
    .get(filename) as { id: number } | undefined;
  if (existing) {
    db.prepare("DELETE FROM documents WHERE id = ?").run(existing.id);
  }

  const docRes = db
    .prepare(
      `INSERT INTO documents (filename, file_type, char_count, chunk_count, has_embeddings)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(filename, fileType, rawText.length, chunks.length, hasEmbeddings ? 1 : 0);

  const docId = Number(docRes.lastInsertRowid);
  const insertChunk = db.prepare(
    `INSERT INTO document_chunks (doc_id, chunk_index, title, content, embedding_json)
     VALUES (?, ?, ?, ?, ?)`
  );

  chunks.forEach((chunk, index) => {
    const embJson = hasEmbeddings && embeddings ? JSON.stringify(embeddings[index]) : "";
    insertChunk.run(docId, index, chunk.title, chunk.content, embJson);
  });

  return { docId, chunkCount: chunks.length, hasEmbeddings };
}

export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const { text } = await extractText(uint8, { mergePages: true });
  const extracted: unknown = text;
  return typeof extracted === "string"
    ? extracted
    : Array.isArray(extracted)
    ? extracted.map((page) => String(page)).join("\n")
    : "";
}

export async function ensureDefaultKnowledgeIndexed(): Promise<void> {
  if (!fs.existsSync(DEFAULT_KB_PATH)) return;
  const content = fs.readFileSync(DEFAULT_KB_PATH, "utf-8");
  const existing = db
    .prepare("SELECT id, char_count FROM documents WHERE filename = 'knowledge_base.txt' LIMIT 1")
    .get() as { id: number; char_count: number } | undefined;

  if (!existing || existing.char_count !== content.length) {
    await indexDocumentContent("knowledge_base.txt", "txt", content);
  }
}

export async function searchKnowledgeBase(
  query: string,
  topK = 4
): Promise<{ chunks: RetrievedChunk[]; mode: "vector_embedding" | "lexical_fallback" }> {
  await ensureDefaultKnowledgeIndexed();

  const rows = db
    .prepare(
      `SELECT dc.id, d.filename, dc.title, dc.content, dc.embedding_json
       FROM document_chunks dc
       JOIN documents d ON dc.doc_id = d.id`
    )
    .all() as Array<{
    id: number;
    filename: string;
    title: string;
    content: string;
    embedding_json: string;
  }>;

  if (rows.length === 0) {
    return { chunks: [], mode: "lexical_fallback" };
  }

  const queryEmbeddings = await embedTexts([query]);
  const queryVec = queryEmbeddings?.[0] ?? null;

  let usedVector = false;
  const scored: RetrievedChunk[] = rows.map((row) => {
    let score = 0;
    if (queryVec && row.embedding_json) {
      try {
        const chunkVec = JSON.parse(row.embedding_json) as number[];
        score = cosineSimilarity(queryVec, chunkVec);
        usedVector = true;
      } catch {
        score = keywordOverlapScore(query, row.content);
      }
    } else {
      score = keywordOverlapScore(query, row.content);
    }

    return {
      id: row.id,
      filename: row.filename,
      title: row.title,
      content: row.content,
      score: Number(score.toFixed(4)),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    chunks: scored.slice(0, topK),
    mode: usedVector ? "vector_embedding" : "lexical_fallback",
  };
}

export function listIndexedDocuments() {
  return db
    .prepare("SELECT * FROM documents ORDER BY id DESC")
    .all();
}

export function deleteIndexedDocument(docId: number): boolean {
  const res = db.prepare("DELETE FROM documents WHERE id = ?").run(docId);
  return Number(res.changes) > 0;
}
