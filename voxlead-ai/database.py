"""
database.py — SQLite Persistence & Pandas Analytics Layer for VoxLead AI
(Coaching Institute & Training Centre Admission Enquiry System)
"""

from datetime import datetime
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "voxlead.db")
AVAILABLE_SLOTS = ["10:00 AM", "11:30 AM", "2:00 PM", "4:00 PM", "5:30 PM"]
VALID_APPOINTMENT_STATUSES = {"Scheduled", "Completed", "Cancelled"}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _normalize_interest(raw: Optional[str]) -> str:
    val = (raw or "Medium").strip().lower()
    if val in {"high", "interested"}:
        return "High"
    if val in {"low", "not interested"}:
        return "Low"
    return "Medium"


def _normalize_sentiment(raw: Optional[str]) -> str:
    val = (raw or "Neutral").strip().lower()
    if val == "positive":
        return "Positive"
    if val == "negative":
        return "Negative"
    return "Neutral"


def _ensure_column(cur: sqlite3.Cursor, table: str, column: str, definition: str) -> None:
    cols = {row["name"] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE,
            name TEXT NOT NULL DEFAULT 'Prospective Student',
            email TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            background TEXT DEFAULT '',
            course_requirement TEXT DEFAULT '',
            interest_level TEXT NOT NULL DEFAULT 'Medium',
            sentiment TEXT NOT NULL DEFAULT 'Neutral',
            language TEXT DEFAULT 'en',
            preferred_schedule TEXT DEFAULT '',
            follow_up_recommendation TEXT DEFAULT '',
            opted_out INTEGER NOT NULL DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            lead_id INTEGER,
            student_name TEXT NOT NULL,
            student_email TEXT DEFAULT '',
            demo_date TEXT NOT NULL,
            demo_time TEXT NOT NULL,
            course_topic TEXT DEFAULT 'Python Full Stack Counselling',
            status TEXT NOT NULL DEFAULT 'Scheduled',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id)
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE,
            lead_id INTEGER,
            student_name TEXT NOT NULL DEFAULT 'Prospective Student',
            transcript TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            interest_level TEXT NOT NULL DEFAULT 'Medium',
            sentiment TEXT NOT NULL DEFAULT 'Neutral',
            language TEXT DEFAULT 'en',
            key_discussion_points TEXT DEFAULT '',
            next_steps TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lead_id) REFERENCES leads (id)
        );

        CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
        CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone);
        CREATE INDEX IF NOT EXISTS idx_appts_date_time ON appointments (demo_date, demo_time);
        CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations (session_id);
        """
    )

    # Safe backward-compatible column migration for pre-existing voxlead.db files
    _ensure_column(cur, "leads", "background", "TEXT DEFAULT ''")
    _ensure_column(cur, "leads", "course_requirement", "TEXT DEFAULT ''")
    _ensure_column(cur, "leads", "interest_level", "TEXT NOT NULL DEFAULT 'Medium'")
    _ensure_column(cur, "leads", "preferred_schedule", "TEXT DEFAULT ''")
    _ensure_column(cur, "leads", "follow_up_recommendation", "TEXT DEFAULT ''")
    _ensure_column(cur, "conversations", "key_discussion_points", "TEXT DEFAULT ''")
    _ensure_column(cur, "conversations", "next_steps", "TEXT DEFAULT ''")

    conn.commit()
    conn.close()


def get_lead_by_contact(email: str = "", phone: str = "") -> Optional[Dict[str, Any]]:
    """
    Contextual Memory Lookup:
    Fetch an existing student's prior lead details, last call summary, and upcoming appointments
    by matching email or phone in SQLite.
    """
    clean_email = email.strip().lower()
    clean_phone = phone.strip()
    if not clean_email and not clean_phone:
        return None

    conn = get_connection()
    cur = conn.cursor()

    lead = None
    if clean_email:
        lead = cur.execute(
            "SELECT * FROM leads WHERE LOWER(email) = ? AND email != '' LIMIT 1",
            (clean_email,),
        ).fetchone()
    if not lead and clean_phone:
        lead = cur.execute(
            "SELECT * FROM leads WHERE phone = ? AND phone != '' LIMIT 1",
            (clean_phone,),
        ).fetchone()

    if not lead:
        conn.close()
        return None

    lead_dict = dict(lead)
    last_conv = cur.execute(
        "SELECT summary, key_discussion_points, next_steps, updated_at FROM conversations WHERE lead_id = ? ORDER BY id DESC LIMIT 1",
        (lead_dict["id"],),
    ).fetchone()
    upcoming_appt = cur.execute(
        "SELECT demo_date, demo_time, course_topic, status FROM appointments WHERE lead_id = ? AND status = 'Scheduled' ORDER BY demo_date ASC LIMIT 1",
        (lead_dict["id"],),
    ).fetchone()
    conn.close()

    lead_dict["last_summary"] = last_conv["summary"] if last_conv else ""
    lead_dict["last_discussion_points"] = last_conv["key_discussion_points"] if last_conv else ""
    lead_dict["upcoming_appointment"] = dict(upcoming_appt) if upcoming_appt else None
    return lead_dict


def upsert_lead(
    session_id: str,
    name: str = "",
    email: str = "",
    phone: str = "",
    background: str = "",
    course_requirement: str = "",
    interest_level: str = "Medium",
    sentiment: str = "Neutral",
    language: str = "en",
    preferred_schedule: str = "",
    follow_up_recommendation: str = "",
    opted_out: bool = False,
    notes: str = "",
) -> int:
    clean_email = email.strip().lower()
    clean_phone = phone.strip()
    clean_name = name.strip()
    interest = _normalize_interest(interest_level)
    sent = _normalize_sentiment(sentiment)

    conn = get_connection()
    cur = conn.cursor()

    existing = None
    if clean_email:
        existing = cur.execute(
            "SELECT * FROM leads WHERE LOWER(email) = ? AND email != '' LIMIT 1", (clean_email,)
        ).fetchone()
    if not existing and clean_phone:
        existing = cur.execute(
            "SELECT * FROM leads WHERE phone = ? AND phone != '' LIMIT 1", (clean_phone,)
        ).fetchone()
    if not existing and session_id:
        existing = cur.execute(
            "SELECT * FROM leads WHERE session_id = ? LIMIT 1", (session_id,)
        ).fetchone()

    if existing:
        lead_id = int(existing["id"])
        merged_name = (
            clean_name
            if clean_name and clean_name not in {"Prospect", "Prospective Student"}
            else existing["name"]
        )
        cur.execute(
            """
            UPDATE leads SET
                session_id = COALESCE(?, session_id),
                name = ?, email = ?, phone = ?, background = ?,
                course_requirement = ?, interest_level = ?, sentiment = ?, language = ?,
                preferred_schedule = ?, follow_up_recommendation = ?,
                opted_out = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                session_id or None,
                merged_name,
                clean_email or existing["email"],
                clean_phone or existing["phone"],
                background.strip() or existing["background"],
                course_requirement.strip() or existing["course_requirement"],
                interest,
                sent,
                language.strip() or existing["language"],
                preferred_schedule.strip() or existing["preferred_schedule"],
                follow_up_recommendation.strip() or existing["follow_up_recommendation"],
                1 if opted_out else existing["opted_out"],
                notes.strip() or existing["notes"],
                lead_id,
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO leads (
                session_id, name, email, phone, background, course_requirement,
                interest_level, sentiment, language, preferred_schedule,
                follow_up_recommendation, opted_out, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                clean_name or "Prospective Student",
                clean_email,
                clean_phone,
                background.strip(),
                course_requirement.strip(),
                interest,
                sent,
                language.strip() or "en",
                preferred_schedule.strip(),
                follow_up_recommendation.strip(),
                1 if opted_out else 0,
                notes.strip(),
            ),
        )
        lead_id = int(cur.lastrowid)

    conn.commit()
    conn.close()
    return lead_id


def upsert_conversation(
    session_id: str,
    lead_id: Optional[int],
    student_name: str,
    transcript: str,
    summary: str,
    interest_level: str,
    sentiment: str,
    language: str,
    key_discussion_points: str,
    next_steps: str,
) -> int:
    conn = get_connection()
    cur = conn.cursor()
    existing = cur.execute(
        "SELECT id FROM conversations WHERE session_id = ?", (session_id,)
    ).fetchone()
    interest = _normalize_interest(interest_level)
    sent = _normalize_sentiment(sentiment)

    if existing:
        cur.execute(
            """
            UPDATE conversations SET
                lead_id = ?, student_name = ?, transcript = ?, summary = ?,
                interest_level = ?, sentiment = ?, language = ?,
                key_discussion_points = ?, next_steps = ?, updated_at = CURRENT_TIMESTAMP
            WHERE session_id = ?
            """,
            (
                lead_id,
                student_name or "Prospective Student",
                transcript,
                summary,
                interest,
                sent,
                language,
                key_discussion_points,
                next_steps,
                session_id,
            ),
        )
        cid = int(existing["id"])
    else:
        cur.execute(
            """
            INSERT INTO conversations (
                session_id, lead_id, student_name, transcript, summary,
                interest_level, sentiment, language, key_discussion_points, next_steps
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                lead_id,
                student_name or "Prospective Student",
                transcript,
                summary,
                interest,
                sent,
                language,
                key_discussion_points,
                next_steps,
            ),
        )
        cid = int(cur.lastrowid)

    conn.commit()
    conn.close()
    return cid


def validate_date_time(demo_date: str, demo_time: str) -> Tuple[bool, str]:
    clean_date = demo_date.strip()
    clean_time = demo_time.strip()
    try:
        datetime.strptime(clean_date, "%Y-%m-%d")
    except ValueError:
        return False, f"Invalid date '{demo_date}'. Expected YYYY-MM-DD."

    if clean_time not in AVAILABLE_SLOTS:
        return False, f"Invalid slot '{demo_time}'. Allowed slots: {', '.join(AVAILABLE_SLOTS)}."

    return True, ""


def get_available_slots(demo_date: str) -> List[str]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT demo_time FROM appointments WHERE demo_date = ? AND status = 'Scheduled'",
        (demo_date.strip(),),
    ).fetchall()
    conn.close()
    taken = {r["demo_time"] for r in rows}
    return [slot for slot in AVAILABLE_SLOTS if slot not in taken]


def book_appointment_safe(
    session_id: str,
    lead_id: Optional[int],
    student_name: str,
    student_email: str,
    demo_date: str,
    demo_time: str,
    course_topic: str = "Python Full Stack Counselling",
) -> Tuple[bool, str]:
    valid, err_msg = validate_date_time(demo_date, demo_time)
    if not valid:
        return False, err_msg

    clean_date = demo_date.strip()
    clean_time = demo_time.strip()

    conn = get_connection()
    cur = conn.cursor()
    conflict = cur.execute(
        "SELECT id, session_id FROM appointments WHERE demo_date = ? AND demo_time = ? AND status = 'Scheduled' LIMIT 1",
        (clean_date, clean_time),
    ).fetchone()

    if conflict and conflict["session_id"] != session_id:
        conn.close()
        open_slots = get_available_slots(clean_date)
        return (
            False,
            f"Slot {clean_date} at {clean_time} is already booked. Available slots: {', '.join(open_slots) or 'None'}.",
        )

    if conflict and conflict["session_id"] == session_id:
        conn.close()
        return True, f"Counselling appointment already confirmed for {clean_date} at {clean_time}."

    cur.execute(
        """
        INSERT INTO appointments (session_id, lead_id, student_name, student_email, demo_date, demo_time, course_topic, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Scheduled')
        """,
        (
            session_id,
            lead_id,
            student_name.strip() or "Prospective Student",
            student_email.strip().lower(),
            clean_date,
            clean_time,
            course_topic.strip() or "Course Counselling",
        ),
    )
    conn.commit()
    conn.close()
    return True, f"Counselling appointment booked for {student_name or 'Student'} on {clean_date} at {clean_time}."


def update_lead_status(lead_id: int, interest_level: str) -> bool:
    interest = _normalize_interest(interest_level)
    conn = get_connection()
    cur = conn.cursor()
    res = cur.execute(
        "UPDATE leads SET interest_level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (interest, lead_id),
    )
    conn.commit()
    changed = res.rowcount > 0
    conn.close()
    return changed


def update_appointment_status(appt_id: int, status: str) -> bool:
    clean_status = status.strip()
    if clean_status not in VALID_APPOINTMENT_STATUSES:
        return False
    conn = get_connection()
    cur = conn.cursor()
    res = cur.execute(
        "UPDATE appointments SET status = ? WHERE id = ?",
        (clean_status, appt_id),
    )
    conn.commit()
    changed = res.rowcount > 0
    conn.close()
    return changed


def get_all_leads() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM leads ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_appointments() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM appointments ORDER BY demo_date ASC, demo_time ASC, id DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_recent_conversations(limit: int = 20) -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM conversations ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_analytics_summary() -> Dict[str, Any]:
    """Use Pandas to compute admission pipeline metrics and distributions."""
    conn = get_connection()
    leads_df = pd.read_sql_query("SELECT * FROM leads", conn)
    appts_df = pd.read_sql_query("SELECT * FROM appointments", conn)
    convs_df = pd.read_sql_query("SELECT * FROM conversations", conn)
    conn.close()

    total_leads = int(len(leads_df))
    total_calls = int(len(convs_df))
    qualified_leads = (
        int((leads_df["interest_level"] == "High").sum()) if not leads_df.empty else 0
    )
    scheduled_appts = (
        int((appts_df["status"] == "Scheduled").sum()) if not appts_df.empty else 0
    )
    total_appts = int(len(appts_df))
    conversion_rate = round((total_appts / total_leads) * 100, 1) if total_leads > 0 else 0.0

    if not leads_df.empty:
        interest_df = (
            leads_df["interest_level"]
            .value_counts()
            .rename_axis("Interest Level")
            .reset_index(name="Students")
        )
        sentiment_df = (
            leads_df["sentiment"]
            .value_counts()
            .rename_axis("Sentiment")
            .reset_index(name="Students")
        )
    else:
        interest_df = pd.DataFrame(columns=["Interest Level", "Students"])
        sentiment_df = pd.DataFrame(columns=["Sentiment", "Students"])

    return {
        "total_leads": total_leads,
        "total_calls": total_calls,
        "qualified_leads": qualified_leads,
        "scheduled_appointments": scheduled_appts,
        "total_appointments": total_appts,
        "conversion_rate": conversion_rate,
        "interest_distribution": interest_df,
        "sentiment_distribution": sentiment_df,
    }
