import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import dotenv from "dotenv";
import {
  db,
  getAnalyticsDashboard,
  getAvailableSlotsForDate,
  initDatabase,
  normalizeQualification,
} from "./server/db";
import { attachLiveVoiceWebSocket } from "./server/liveVoice";
import { ensureDefaultKnowledgeIndexed } from "./server/rag";

dotenv.config();

const PORT = 3000;
const ROOT_DIR = process.cwd();
const PYTHON_PROJECT_DIR = path.join(ROOT_DIR, "voxlead-ai");

async function startServer() {
  initDatabase();
  await ensureDefaultKnowledgeIndexed();

  const app = express();
  app.use(express.json({ limit: "20mb" }));

  // 1. Analytics, CRM, Calls, Appointments & Summaries Dashboard
  app.get("/api/dashboard", (_req, res) => {
    try {
      const payload = getAnalyticsDashboard();
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to load dashboard analytics.",
      });
    }
  });

  // 2. Appointment Slots & Staff Status Update Endpoints (Autonomous booking only; no manual booking endpoint)
  app.get("/api/appointments/slots", (req, res) => {
    const demoDate = String(req.query.date ?? new Date().toISOString().split("T")[0]);
    res.json({
      date: demoDate,
      availableSlots: getAvailableSlotsForDate(demoDate),
    });
  });

  app.patch("/api/appointments/:id", (req, res) => {
    const id = Number(req.params.id);
    const status = String((req.body as { status?: string })?.status ?? "").trim();
    if (!Number.isInteger(id) || !["Scheduled", "Completed", "Cancelled"].includes(status)) {
      res.status(400).json({ error: "Invalid appointment ID or status." });
      return;
    }
    db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(status, id);
    res.json({ ok: true });
  });

  // 4. CRM Lead Update & Opt-Out Management
  app.patch("/api/leads/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid lead ID." });
      return;
    }

    const body = req.body as {
      qualification?: string;
      nextRecommendedAction?: string;
      optedOut?: boolean;
      notes?: string;
    };

    const existing = db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }

    const qual = body.qualification
      ? normalizeQualification(body.qualification)
      : String(existing.qualification);

    db.prepare(
      `UPDATE leads SET
        status = ?,
        qualification = ?,
        next_recommended_action = ?,
        opted_out = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).run(
      qual,
      qual,
      body.nextRecommendedAction ?? String(existing.next_recommended_action ?? ""),
      typeof body.optedOut === "boolean" ? (body.optedOut ? 1 : 0) : Number(existing.opted_out ?? 0),
      body.notes ?? String(existing.notes ?? ""),
      id
    );

    res.json({ ok: true });
  });

  // 5. Python / Streamlit Backend Deliverables Explorer
  app.get("/api/python-files", (_req, res) => {
    try {
      const manifest = [
        { name: "app.py", language: "python", role: "Streamlit frontend & 6-section admission enquiry dashboard" },
        { name: "ai_agent.py", language: "python", role: "Groq Whisper STT, Groq LLM, gTTS TTS & Sentence-Transformers + NumPy RAG" },
        { name: "database.py", language: "python", role: "SQLite student CRM, contextual lookup, duplicate-safe booking & Pandas insights" },
        { name: "knowledge_base.txt", language: "text", role: "Coaching institute course brochure (Python Full Stack, fees, syllabus, eligibility)" },
        { name: "requirements.txt", language: "text", role: "Python dependencies (Streamlit, Groq, gTTS, Sentence-Transformers, NumPy, Pandas)" },
        { name: ".env.example", language: "bash", role: "Environment variables template (GROQ_API_KEY)" },
        { name: "README.md", language: "markdown", role: "Project overview and local setup guide" },
        { name: "PROJECT_REPORT.md", language: "markdown", role: "One-page GitHub project report (problem, stack, implemented vs future scope)" },
        { name: "ARCHITECTURE.md", language: "markdown", role: "Mermaid system architecture diagram and explanation" },
        { name: "BUSINESS_WORKFLOW.md", language: "markdown", role: "End-to-end Python Full Stack student enquiry workflow" },
        { name: "SCALABILITY.md", language: "markdown", role: "Strategy for scaling up to 100,000 registered users" },
        { name: "SECURITY.md", language: "markdown", role: "Student data protection, API key handling & deployment security" },
        { name: "COST_ESTIMATION.md", language: "markdown", role: "Commercial feasibility and estimated operational costs" },
      ];

      const files = manifest
        .map((item) => {
          const filePath = path.join(PYTHON_PROJECT_DIR, item.name);
          if (!fs.existsSync(filePath)) return null;
          return {
            ...item,
            content: fs.readFileSync(filePath, "utf-8"),
          };
        })
        .filter(Boolean);

      res.json({ files });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to read Python deliverables.",
      });
    }
  });

  // Frontend Vite middleware or static build
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(ROOT_DIR, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = http.createServer(app);
  attachLiveVoiceWebSocket(httpServer);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`VoxLead AI Calling Platform running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start VoxLead AI server:", err);
  process.exit(1);
});
