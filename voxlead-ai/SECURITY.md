# Security & Data Protection — VoxLead AI

## 1. API Key & Secret Management

- All external credentials (`GROQ_API_KEY`) are loaded via `python-dotenv` from `.env`.
- `.env` and `voxlead.db` are listed in `.gitignore` and never committed to version control.
- `.env.example` documents required variable names without real secrets.

## 2. Input Validation & Safe Database Access

- All SQL queries in `database.py` use parameterized `?` placeholders via `sqlite3`, preventing SQL injection.
- Appointment dates are validated strictly against `YYYY-MM-DD`, and appointment times are restricted to the approved slot allow-list (`10:00 AM`, `11:30 AM`, `2:00 PM`, `4:00 PM`, `5:30 PM`).
- Knowledge base edits in Streamlit enforce minimum content checks before overwriting `knowledge_base.txt`.

## 3. API Error Handling & Fallbacks

- `ai_agent.py` explicitly catches `ValueError` (missing/placeholder API key), `AuthenticationError`, `RateLimitError`, and `APIConnectionError` from the Groq SDK and surfaces actionable messages in the UI without crashing.
- If `sentence-transformers` weights cannot load offline, RAG safely falls back to lexical overlap scoring.

## 4. Student Data, Transcripts & Production Access Control

- Student names, emails, phone numbers, transcripts, and call summaries are stored locally in `voxlead.db` during prototype evaluation.
- For production multi-staff deployment:
  - Enforce HTTPS/TLS for all client-server traffic.
  - Add staff authentication and role-based access control (Admin vs. Admission Counsellor) before exposing CRM leads, transcripts, and knowledge base editing.
  - Encrypt database storage at rest and define a student data retention/deletion policy (including opt-out honoring via `opted_out`).
