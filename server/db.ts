import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_PATH = path.join(process.cwd(), "voxlead_preview.db");

export const db = new DatabaseSync(DB_PATH);

export const AVAILABLE_SLOTS = [
  "10:00 AM",
  "11:30 AM",
  "2:00 PM",
  "4:00 PM",
  "5:30 PM",
] as const;

export type LeadQualification = "High" | "Medium" | "Low";
export type LeadSentiment = "Positive" | "Neutral" | "Negative";
export type CallStatus =
  | "Connecting"
  | "Listening"
  | "Thinking"
  | "Speaking"
  | "Completed"
  | "Failed";

export function normalizeQualification(raw?: string | null): LeadQualification {
  if (!raw) return "Medium";
  const val = raw.trim().toLowerCase();
  if (val === "high" || val === "interested") return "High";
  if (val === "low" || val === "not interested") return "Low";
  return "Medium";
}

export function normalizeSentiment(raw?: string | null): LeadSentiment {
  if (!raw) return "Neutral";
  const val = raw.trim().toLowerCase();
  if (val === "positive") return "Positive";
  if (val === "negative") return "Negative";
  return "Neutral";
}

export function initDatabase(): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE,
      name TEXT NOT NULL DEFAULT 'Prospect',
      email TEXT DEFAULT '',
      company TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Medium',
      qualification TEXT NOT NULL DEFAULT 'Medium',
      sentiment TEXT NOT NULL DEFAULT 'Neutral',
      language TEXT DEFAULT 'en',
      requirement TEXT DEFAULT '',
      budget TEXT DEFAULT '',
      buying_timeline TEXT DEFAULT '',
      objections TEXT DEFAULT '',
      purchase_intent TEXT DEFAULT '',
      next_recommended_action TEXT DEFAULT '',
      opted_out INTEGER NOT NULL DEFAULT 0,
      consent_recorded INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      lead_id INTEGER,
      call_mode TEXT NOT NULL DEFAULT 'browser',
      direction TEXT NOT NULL DEFAULT 'inbound',
      phone_number TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Connecting',
      duration_sec INTEGER NOT NULL DEFAULT 0,
      language TEXT DEFAULT 'en',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP,
      error_message TEXT DEFAULT '',
      FOREIGN KEY (lead_id) REFERENCES leads (id)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      lead_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT DEFAULT '',
      demo_date TEXT NOT NULL,
      demo_time TEXT NOT NULL,
      topic TEXT DEFAULT 'VoxLead AI / FORTIVEX Demo',
      status TEXT DEFAULT 'Scheduled',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads (id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE,
      lead_id INTEGER,
      customer_name TEXT NOT NULL DEFAULT 'Prospect',
      transcript TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      lead_status TEXT NOT NULL DEFAULT 'Medium',
      sentiment TEXT NOT NULL DEFAULT 'Neutral',
      language TEXT DEFAULT 'en',
      key_topic TEXT DEFAULT 'General Inquiry',
      objections TEXT DEFAULT '',
      purchase_intent TEXT DEFAULT '',
      next_action TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lead_id) REFERENCES leads (id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      char_count INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      has_embeddings INTEGER NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT DEFAULT '',
      FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE
    );
  `);

  // Safe column migrations for any pre-existing preview database
  const migrateCols = (table: string, cols: Array<[string, string]>) => {
    const existing = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        (r) => r.name
      )
    );
    for (const [col, def] of cols) {
      if (!existing.has(col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      }
    }
  };

  migrateCols("leads", [
    ["session_id", "TEXT"],
    ["qualification", "TEXT NOT NULL DEFAULT 'Medium'"],
    ["sentiment", "TEXT NOT NULL DEFAULT 'Neutral'"],
    ["language", "TEXT DEFAULT 'en'"],
    ["requirement", "TEXT DEFAULT ''"],
    ["budget", "TEXT DEFAULT ''"],
    ["buying_timeline", "TEXT DEFAULT ''"],
    ["objections", "TEXT DEFAULT ''"],
    ["purchase_intent", "TEXT DEFAULT ''"],
    ["next_recommended_action", "TEXT DEFAULT ''"],
    ["opted_out", "INTEGER NOT NULL DEFAULT 0"],
    ["consent_recorded", "INTEGER NOT NULL DEFAULT 1"],
    ["updated_at", "TIMESTAMP"],
  ]);

  migrateCols("appointments", [["session_id", "TEXT"]]);

  migrateCols("conversations", [
    ["session_id", "TEXT"],
    ["sentiment", "TEXT NOT NULL DEFAULT 'Neutral'"],
    ["language", "TEXT DEFAULT 'en'"],
    ["key_topic", "TEXT DEFAULT 'General Inquiry'"],
    ["objections", "TEXT DEFAULT ''"],
    ["purchase_intent", "TEXT DEFAULT ''"],
    ["next_action", "TEXT DEFAULT ''"],
    ["updated_at", "TIMESTAMP"],
  ]);

  // Remove legacy CHECK(status IN ('Interested', ...)) constraint from older preview DBs
  const leadsDdl = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leads'")
    .get() as { sql?: string } | undefined;

  if (leadsDdl?.sql && leadsDdl.sql.includes("Needs Follow-up")) {
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE leads_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        name TEXT NOT NULL DEFAULT 'Prospect',
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        company TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Medium',
        qualification TEXT NOT NULL DEFAULT 'Medium',
        sentiment TEXT NOT NULL DEFAULT 'Neutral',
        language TEXT DEFAULT 'en',
        requirement TEXT DEFAULT '',
        budget TEXT DEFAULT '',
        buying_timeline TEXT DEFAULT '',
        objections TEXT DEFAULT '',
        purchase_intent TEXT DEFAULT '',
        next_recommended_action TEXT DEFAULT '',
        opted_out INTEGER NOT NULL DEFAULT 0,
        consent_recorded INTEGER NOT NULL DEFAULT 1,
        notes TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO leads_migrated (
        id, session_id, name, email, phone, company, status, qualification,
        sentiment, language, requirement, budget, buying_timeline, objections,
        purchase_intent, next_recommended_action, opted_out, consent_recorded,
        notes, created_at, updated_at
      )
      SELECT
        id, session_id, name, email, phone, company,
        CASE
          WHEN status = 'Interested' THEN 'High'
          WHEN status = 'Not Interested' THEN 'Low'
          WHEN status = 'Needs Follow-up' THEN 'Medium'
          ELSE COALESCE(qualification, 'Medium')
        END,
        CASE
          WHEN status = 'Interested' THEN 'High'
          WHEN status = 'Not Interested' THEN 'Low'
          WHEN status = 'Needs Follow-up' THEN 'Medium'
          ELSE COALESCE(qualification, 'Medium')
        END,
        COALESCE(sentiment, 'Neutral'),
        COALESCE(language, 'en'),
        COALESCE(requirement, ''),
        COALESCE(budget, ''),
        COALESCE(buying_timeline, ''),
        COALESCE(objections, ''),
        COALESCE(purchase_intent, ''),
        COALESCE(next_recommended_action, ''),
        COALESCE(opted_out, 0),
        COALESCE(consent_recorded, 1),
        COALESCE(notes, ''),
        created_at,
        COALESCE(updated_at, created_at)
      FROM leads;
      DROP TABLE leads;
      ALTER TABLE leads_migrated RENAME TO leads;
      COMMIT;
    `);
    db.exec("PRAGMA foreign_keys = ON;");
  }

  // Normalize legacy status values ('Interested' -> 'High', etc.) cleanly
  db.exec(`
    UPDATE leads SET qualification = 'High', status = 'High' WHERE status = 'Interested';
    UPDATE leads SET qualification = 'Low', status = 'Low' WHERE status = 'Not Interested';
    UPDATE leads SET qualification = 'Medium', status = 'Medium' WHERE status = 'Needs Follow-up';
    UPDATE conversations SET lead_status = 'High' WHERE lead_status = 'Interested';
    UPDATE conversations SET lead_status = 'Low' WHERE lead_status = 'Not Interested';
    UPDATE conversations SET lead_status = 'Medium' WHERE lead_status = 'Needs Follow-up';
  `);
}

export interface UpsertLeadInput {
  sessionId: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  qualification?: string;
  sentiment?: string;
  language?: string;
  requirement?: string;
  budget?: string;
  buyingTimeline?: string;
  objections?: string;
  purchaseIntent?: string;
  nextRecommendedAction?: string;
  optedOut?: boolean;
  consentRecorded?: boolean;
  notes?: string;
}

/**
 * Duplicate-safe CRM lead upsert:
 * Matches existing lead by normalized email, phone, or session_id before inserting.
 */
export function upsertLead(input: UpsertLeadInput): number {
  const email = (input.email ?? "").trim().toLowerCase();
  const phone = (input.phone ?? "").trim();
  const name = (input.name ?? "").trim();

  let existing: Record<string, unknown> | undefined;

  if (email) {
    existing = db
      .prepare("SELECT * FROM leads WHERE LOWER(email) = ? LIMIT 1")
      .get(email) as Record<string, unknown> | undefined;
  }
  if (!existing && phone) {
    existing = db
      .prepare("SELECT * FROM leads WHERE phone = ? AND phone != '' LIMIT 1")
      .get(phone) as Record<string, unknown> | undefined;
  }
  if (!existing && input.sessionId) {
    existing = db
      .prepare("SELECT * FROM leads WHERE session_id = ? LIMIT 1")
      .get(input.sessionId) as Record<string, unknown> | undefined;
  }

  const qual = normalizeQualification(
    input.qualification ?? (existing?.qualification as string | undefined)
  );
  const sentiment = normalizeSentiment(
    input.sentiment ?? (existing?.sentiment as string | undefined)
  );

  if (existing) {
    const id = Number(existing.id);
    const mergedName =
      name && name !== "Anonymous Prospect" && name !== "Prospect"
        ? name
        : String(existing.name || "Prospect");

    db.prepare(
      `UPDATE leads SET
        session_id = COALESCE(?, session_id),
        name = ?,
        email = ?,
        phone = ?,
        company = ?,
        status = ?,
        qualification = ?,
        sentiment = ?,
        language = ?,
        requirement = ?,
        budget = ?,
        buying_timeline = ?,
        objections = ?,
        purchase_intent = ?,
        next_recommended_action = ?,
        opted_out = ?,
        consent_recorded = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).run(
      input.sessionId || null,
      mergedName,
      email || String(existing.email || ""),
      phone || String(existing.phone || ""),
      (input.company ?? "").trim() || String(existing.company || ""),
      qual,
      qual,
      sentiment,
      (input.language ?? "").trim() || String(existing.language || "en"),
      (input.requirement ?? "").trim() || String(existing.requirement || ""),
      (input.budget ?? "").trim() || String(existing.budget || ""),
      (input.buyingTimeline ?? "").trim() || String(existing.buying_timeline || ""),
      (input.objections ?? "").trim() || String(existing.objections || ""),
      (input.purchaseIntent ?? "").trim() || String(existing.purchase_intent || ""),
      (input.nextRecommendedAction ?? "").trim() || String(existing.next_recommended_action || ""),
      input.optedOut ? 1 : Number(existing.opted_out || 0),
      input.consentRecorded === false ? 0 : Number(existing.consent_recorded ?? 1),
      (input.notes ?? "").trim() || String(existing.notes || ""),
      id
    );
    return id;
  }

  const result = db
    .prepare(
      `INSERT INTO leads (
        session_id, name, email, phone, company, status, qualification, sentiment,
        language, requirement, budget, buying_timeline, objections, purchase_intent,
        next_recommended_action, opted_out, consent_recorded, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.sessionId,
      name || "Prospect",
      email,
      phone,
      (input.company ?? "").trim(),
      qual,
      qual,
      sentiment,
      (input.language ?? "en").trim() || "en",
      (input.requirement ?? "").trim(),
      (input.budget ?? "").trim(),
      (input.buyingTimeline ?? "").trim(),
      (input.objections ?? "").trim(),
      (input.purchaseIntent ?? "").trim(),
      (input.nextRecommendedAction ?? "").trim(),
      input.optedOut ? 1 : 0,
      input.consentRecorded === false ? 0 : 1,
      (input.notes ?? "").trim()
    );

  return Number(result.lastInsertRowid);
}

export function createOrUpdateCall(params: {
  sessionId: string;
  leadId?: number | null;
  callMode: "browser" | "inbound_phone" | "outbound_phone";
  direction: "inbound" | "outbound";
  phoneNumber?: string;
  status: CallStatus;
  durationSec?: number;
  language?: string;
  errorMessage?: string;
  ended?: boolean;
}): void {
  const existing = db
    .prepare("SELECT id FROM calls WHERE session_id = ?")
    .get(params.sessionId) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE calls SET
        lead_id = COALESCE(?, lead_id),
        status = ?,
        duration_sec = COALESCE(?, duration_sec),
        language = COALESCE(?, language),
        error_message = COALESCE(?, error_message),
        ended_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE ended_at END
      WHERE session_id = ?`
    ).run(
      params.leadId ?? null,
      params.status,
      params.durationSec ?? null,
      params.language ?? null,
      params.errorMessage ?? null,
      params.ended ? 1 : 0,
      params.sessionId
    );
  } else {
    db.prepare(
      `INSERT INTO calls (session_id, lead_id, call_mode, direction, phone_number, status, duration_sec, language, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.sessionId,
      params.leadId ?? null,
      params.callMode,
      params.direction,
      params.phoneNumber ?? "",
      params.status,
      params.durationSec ?? 0,
      params.language ?? "en",
      params.errorMessage ?? ""
    );
  }
}

export function getAvailableSlotsForDate(demoDate: string): string[] {
  const booked = db
    .prepare(
      "SELECT demo_time FROM appointments WHERE demo_date = ? AND status = 'Scheduled'"
    )
    .all(demoDate) as Array<{ demo_time: string }>;
  const taken = new Set(booked.map((b) => b.demo_time));
  return AVAILABLE_SLOTS.filter((slot) => !taken.has(slot));
}

export function bookAppointmentSafe(params: {
  sessionId: string;
  leadId: number | null;
  customerName: string;
  customerEmail?: string;
  demoDate: string;
  demoTime: string;
  topic?: string;
}): { ok: boolean; appointmentId?: number; error?: string; availableSlots?: string[] } {
  const cleanDate = params.demoDate.trim();
  const cleanTime = params.demoTime.trim();
  const cleanName = params.customerName.trim() || "Prospect";

  // Check if slot is already booked by a different session
  const conflict = db
    .prepare(
      `SELECT id, session_id FROM appointments
       WHERE demo_date = ? AND demo_time = ? AND status = 'Scheduled' LIMIT 1`
    )
    .get(cleanDate, cleanTime) as { id: number; session_id: string | null } | undefined;

  if (conflict && conflict.session_id !== params.sessionId) {
    return {
      ok: false,
      error: `Slot ${cleanDate} at ${cleanTime} is already booked.`,
      availableSlots: getAvailableSlotsForDate(cleanDate),
    };
  }

  if (conflict && conflict.session_id === params.sessionId) {
    return { ok: true, appointmentId: conflict.id };
  }

  // Update existing booking for same session or insert new
  const sameSession = db
    .prepare("SELECT id FROM appointments WHERE session_id = ? LIMIT 1")
    .get(params.sessionId) as { id: number } | undefined;

  if (sameSession) {
    db.prepare(
      `UPDATE appointments
       SET lead_id = ?, customer_name = ?, customer_email = ?, demo_date = ?, demo_time = ?, topic = ?
       WHERE id = ?`
    ).run(
      params.leadId,
      cleanName,
      (params.customerEmail ?? "").trim(),
      cleanDate,
      cleanTime,
      (params.topic ?? "Product Demonstration").trim(),
      sameSession.id
    );
    return { ok: true, appointmentId: sameSession.id };
  }

  const res = db
    .prepare(
      `INSERT INTO appointments (session_id, lead_id, customer_name, customer_email, demo_date, demo_time, topic)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.sessionId,
      params.leadId,
      cleanName,
      (params.customerEmail ?? "").trim(),
      cleanDate,
      cleanTime,
      (params.topic ?? "Product Demonstration").trim()
    );

  return { ok: true, appointmentId: Number(res.lastInsertRowid) };
}

export function upsertConversationSummary(params: {
  sessionId: string;
  leadId: number | null;
  customerName: string;
  transcript: string;
  summary: string;
  qualification: string;
  sentiment: string;
  language: string;
  keyTopic: string;
  objections?: string;
  purchaseIntent?: string;
  nextAction?: string;
}): void {
  const existing = db
    .prepare("SELECT id FROM conversations WHERE session_id = ? LIMIT 1")
    .get(params.sessionId) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE conversations SET
        lead_id = ?, customer_name = ?, transcript = ?, summary = ?,
        lead_status = ?, sentiment = ?, language = ?, key_topic = ?,
        objections = ?, purchase_intent = ?, next_action = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).run(
      params.leadId,
      params.customerName || "Prospect",
      params.transcript,
      params.summary,
      normalizeQualification(params.qualification),
      normalizeSentiment(params.sentiment),
      params.language || "en",
      params.keyTopic || "General Inquiry",
      params.objections ?? "",
      params.purchaseIntent ?? "",
      params.nextAction ?? "",
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO conversations (
        session_id, lead_id, customer_name, transcript, summary, lead_status,
        sentiment, language, key_topic, objections, purchase_intent, next_action
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.sessionId,
      params.leadId,
      params.customerName || "Prospect",
      params.transcript,
      params.summary,
      normalizeQualification(params.qualification),
      normalizeSentiment(params.sentiment),
      params.language || "en",
      params.keyTopic || "General Inquiry",
      params.objections ?? "",
      params.purchaseIntent ?? "",
      params.nextAction ?? ""
    );
  }
}

export function getAnalyticsDashboard() {
  const totalCalls = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM calls").get() as { c: number }).c
  );
  const completedCalls = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM calls WHERE status = 'Completed'").get() as { c: number })
      .c
  );
  const failedCalls = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM calls WHERE status = 'Failed'").get() as { c: number }).c
  );
  const avgDurationRow = db
    .prepare("SELECT COALESCE(AVG(duration_sec), 0) AS avg_dur FROM calls WHERE status = 'Completed'")
    .get() as { avg_dur: number };
  const avgDurationSec = Math.round(Number(avgDurationRow?.avg_dur ?? 0));

  const totalLeads = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM leads").get() as { c: number }).c
  );
  const highLeads = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM leads WHERE qualification = 'High'").get() as { c: number }).c
  );
  const mediumLeads = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM leads WHERE qualification = 'Medium'").get() as { c: number }).c
  );
  const lowLeads = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM leads WHERE qualification = 'Low'").get() as { c: number }).c
  );

  const positiveSentiment = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM leads WHERE sentiment = 'Positive'").get() as { c: number }).c
  );
  const neutralSentiment = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM leads WHERE sentiment = 'Neutral'").get() as { c: number }).c
  );
  const negativeSentiment = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM leads WHERE sentiment = 'Negative'").get() as { c: number }).c
  );

  const totalAppointments = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM appointments WHERE status = 'Scheduled'").get() as { c: number })
      .c
  );
  const appointmentConversionRate =
    totalLeads > 0 ? Number(((totalAppointments / totalLeads) * 100).toFixed(1)) : 0;

  const dailyActivity = db
    .prepare(
      `SELECT DATE(started_at) AS day,
              COUNT(*) AS calls,
              SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed
       FROM calls
       WHERE started_at >= DATE('now', '-14 days')
       GROUP BY DATE(started_at)
       ORDER BY day ASC`
    )
    .all() as Array<{ day: string; calls: number; completed: number }>;

  const weeklyTrend = db
    .prepare(
      `SELECT strftime('%Y-W%W', created_at) AS week,
              COUNT(*) AS total_leads,
              SUM(CASE WHEN qualification = 'High' THEN 1 ELSE 0 END) AS high_leads
       FROM leads
       GROUP BY week
       ORDER BY week ASC
       LIMIT 8`
    )
    .all() as Array<{ week: string; total_leads: number; high_leads: number }>;

  const followUps = db
    .prepare(
      `SELECT id, name, company, email, phone, qualification, sentiment, next_recommended_action, updated_at
       FROM leads
       WHERE opted_out = 0 AND next_recommended_action != ''
       ORDER BY CASE qualification WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, id DESC
       LIMIT 10`
    )
    .all();

  const leads = db.prepare("SELECT * FROM leads ORDER BY id DESC LIMIT 100").all();
  const calls = db
    .prepare(
      `SELECT c.*, l.name AS lead_name, l.qualification, l.sentiment
       FROM calls c
       LEFT JOIN leads l ON c.lead_id = l.id
       ORDER BY c.id DESC LIMIT 50`
    )
    .all();
  const appointments = db.prepare("SELECT * FROM appointments ORDER BY demo_date ASC, id DESC LIMIT 100").all();
  const conversations = db.prepare("SELECT * FROM conversations ORDER BY id DESC LIMIT 30").all();

  return {
    metrics: {
      totalCalls,
      completedCalls,
      failedCalls,
      avgDurationSec,
      totalLeads,
      highLeads,
      mediumLeads,
      lowLeads,
      positiveSentiment,
      neutralSentiment,
      negativeSentiment,
      totalAppointments,
      appointmentConversionRate,
    },
    charts: {
      dailyActivity,
      weeklyTrend,
    },
    followUps,
    leads,
    calls,
    appointments,
    conversations,
  };
}
