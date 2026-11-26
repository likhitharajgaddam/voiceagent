# End-to-End Business Workflow — Student Admission Enquiry

This document traces the complete 10-step workflow for a prospective student enquiring about the **Python Full Stack Development** course at **VoxLead Career & Tech Academy**.

1. **Student Initiates Enquiry**: A final-year B.Tech student opens the **AI Voice Assistant** view and asks (by voice or text): *"Hi, I want to know about your Python Full Stack Development course."*
2. **Speech Processing & Language Detection**: If spoken, `st.audio_input` sends WAV audio bytes to Groq Whisper (`whisper-large-v3-turbo`), which transcribes the query and detects the language (`en`, `hi`, or `te`).
3. **RAG Knowledge Grounding**: `ai_agent.py` encodes the query using Sentence Transformers (`all-MiniLM-L6-v2`) and uses NumPy cosine similarity against `knowledge_base.txt` to retrieve the exact **Python Full Stack Development** section (6 months / 24 weeks, INR 36,000 or INR 32,000 one-time / 3 EMIs of INR 12,000, Morning/Evening/Weekend batches, 5-module syllabus, placement assistance).
4. **Grounded Reply & Discovery Questions**: Groq LLM (`llama-3.3-70b-versatile`) responds concisely in the student's language, quotes verified course facts, and asks about the student's coding background and preferred schedule.
5. **Voice Playback**: `gTTS` synthesizes the reply as MP3 audio for playback in Streamlit.
6. **Multi-Turn Clarification & Returning Student Memory**: The student shares their background (*"I am a B.Tech fresher, prefer the evening batch, my name is Aarav, email aarav@example.com"*) and asks about syllabus and placement support. SQLite checks `get_lead_by_contact` for prior records and maintains context across turns.
7. **Interest Level & Sentiment Analysis**: On every turn, `analyze_and_extract_turn` classifies **Interest Level** (`High` / `Medium` / `Low`) and **Sentiment** (`Positive` / `Neutral` / `Negative`), plus key discussion points and next steps.
8. **Autonomous Counselling Booking**: When Aarav says *"Can we schedule a counselling session tomorrow at 2:00 PM?"*, `database.book_appointment_safe()` validates the YYYY-MM-DD date and allowed slot (`2:00 PM`), checks SQLite to prevent duplicate bookings, and saves the appointment with status `Scheduled`.
9. **Call Summary & CRM Persistence**: `database.py` persists the student record in `leads`, the full transcript, summary, key discussion points, and next steps in `conversations`, and the confirmed booking in `appointments`.
10. **Staff Review & Status Updates**: Admissions staff inspect the **Dashboard** (Pandas metrics), **Leads** (update interest level if needed), **Appointments** (mark counselling session `Completed` or `Cancelled`), and **Call History** before speaking with the student.
