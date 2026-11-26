# VoxLead AI — Autonomous AI Admission Counsellor & Lead Management System

**Domain:** Coaching Institutes & Training Centres (`VoxLead Career & Tech Academy`)

VoxLead AI handles prospective student enquiries, answers course-related questions grounded in the institute's brochure (`knowledge_base.txt`), detects student interest level and sentiment, books 1-on-1 counselling appointments automatically without double-booking, and persists all CRM records in SQLite.

---

## Committed Technology Stack

| Layer | Technology |
| --- | --- |
| Programming Language | Python 3.10+ |
| Frontend & Dashboard | Streamlit |
| LLM & Conversational AI | Groq API (`llama-3.3-70b-versatile`) |
| Speech-to-Text (STT) | Groq Whisper (`whisper-large-v3-turbo`) |
| Text-to-Speech (TTS) | `gTTS` |
| RAG Embeddings & Similarity | `sentence-transformers` (`all-MiniLM-L6-v2`) + `numpy` |
| Analytics & Data Handling | `pandas` |
| Database | SQLite (`voxlead.db`) |
| Environment Config | `python-dotenv` |

---

## Project Files

- `app.py` — 6-section Streamlit interface (`Dashboard`, `AI Voice Assistant`, `Leads`, `Appointments`, `Call History`, `Knowledge Base`)
- `ai_agent.py` — Groq Whisper STT, Sentence-Transformers + NumPy RAG, Groq LLM with SQLite contextual memory, and gTTS playback
- `database.py` — SQLite schema, returning-student lookup, slot validation, conflict-safe auto-booking, staff status updates, and Pandas analytics
- `knowledge_base.txt` — Course catalog (Python Full Stack Development, Data Science & GenAI, Java Full Stack, counselling policy)
- `ARCHITECTURE.md` — System architecture diagram and component flow
- `BUSINESS_WORKFLOW.md` — End-to-end Python Full Stack Development student enquiry scenario
- `SCALABILITY.md` — Strategy for scaling up to 100,000 users
- `SECURITY.md` — Data protection, `.env` safety, input validation, and API failure handling
- `COST_ESTIMATION.md` — Commercial pricing model and estimated operational costs

---

## Setup & Execution (macOS / Linux)

```bash
cd voxlead-ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your real GROQ_API_KEY from https://console.groq.com/keys
streamlit run app.py
```

---

## Important Note on Voice Mode

The Streamlit Python application implements **turn-based voice interaction**: the student records an audio clip via `st.audio_input`, Groq Whisper transcribes the audio, Groq LLM generates a RAG-grounded response, and `gTTS` plays back the MP3 reply. It is **not** continuous full-duplex WebRTC telephony with real-time barge-in (which requires dedicated real-time media streaming infrastructure such as the companion WebSocket browser studio).
