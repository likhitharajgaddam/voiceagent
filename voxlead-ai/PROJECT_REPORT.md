# VoxLead AI — One-Page Project Report

**Project Name:** VoxLead AI — Autonomous AI Admission Counsellor & Lead Management System  
**Domain:** Coaching Institutes & Training Centres (*VoxLead Career & Tech Academy*)  

---

## 1. Problem Statement & Objective
Coaching institutes receive high volumes of student enquiries across phone and web channels, leading to delayed responses, repetitive course explanations (fees, syllabus, batch timings, placement support), and missed counselling bookings. VoxLead AI automates first-response student admission counselling, captures student details upfront, qualifies lead interest and sentiment, books 1-on-1 counselling sessions automatically, and saves call insights for admissions staff.

---

## 2. System Architecture & Technology Stack
- **Python / Streamlit Application (`voxlead-ai/`)**:
  - **Frontend & Dashboard:** Streamlit (6 views: *Dashboard, AI Voice Assistant, Leads, Appointments, Call History, Knowledge Base*)
  - **Speech Processing (Turn-Based):** `st.audio_input` -> Groq Whisper (`whisper-large-v3-turbo`) STT -> `gTTS` MP3 audio playback
  - **RAG Grounding:** Sentence Transformers (`all-MiniLM-L6-v2`) + NumPy cosine similarity over `knowledge_base.txt`
  - **LLM & Intelligence:** Groq API (`llama-3.3-70b-versatile`) with returning-student SQLite contextual memory
  - **Persistence & Analytics:** SQLite (`voxlead.db`) + Pandas DataFrames
- **Companion Real-Time Browser Console (`src/`, `server/`)**:
  - React + TypeScript + Express WebSocket (`/live`) bridged to Gemini Live API for full-duplex 16kHz/24kHz PCM voice calling with interruption handling and SQLite persistence.

---

## 3. Implemented Features vs. Future Enhancements

| Implemented (Current Build) | Future Enhancements (Production Roadmap) |
| --- | --- |
| Proactive opening intake (collects name, phone/email, course interest first) | Role-based staff authentication & multi-branch permissions |
| Multilingual support across English, Hindi, and Telugu | Migration from SQLite to managed PostgreSQL + `pgvector` for 100k users |
| Course-grounded RAG answers (prevents fabricated fees or guarantees) | Automated WhatsApp/SMS/email counselling reminders |
| Returning-student contextual lookup via email/phone in SQLite | Commercial low-latency cloud TTS & horizontal worker queues |
| Autonomous interest (`High`/`Medium`/`Low`), sentiment & call summaries | CRM export webhooks (HubSpot/Zoho) and automated daily digest reports |
| Conflict-safe AI counselling slot booking + staff status updates | Dedicated observability dashboards & automated SLA alerts |

---

## 4. Security, Scalability & Commercial Feasibility
- **Security:** API keys (`GROQ_API_KEY`, `GEMINI_API_KEY`) stay in `.env` (excluded via `.gitignore`), SQLite queries use parameterized placeholders, and appointment dates/slots are strictly validated before insertion.
- **Scalability:** Clear separation between 100,000 registered student records (handled via PostgreSQL migration, indexes, and precomputed embeddings) vs. high-concurrency voice streaming clusters.
- **Feasibility:** Estimated monthly infrastructure cost of ~$32–$106 for ~1,000 student enquiries supports affordable institute SaaS plans (~INR 4,999–12,999/month).

---

## 5. Quick Start (Python / Streamlit)
```bash
cd voxlead-ai
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Add GROQ_API_KEY
streamlit run app.py
```
