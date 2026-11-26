# System Architecture — VoxLead AI

## Overview

VoxLead AI follows a modular Python architecture separating presentation (`app.py`), AI & speech processing (`ai_agent.py`), course knowledge (`knowledge_base.txt`), and persistence/analytics (`database.py`).

## Architecture Diagram

```mermaid
flowchart TD
    A[Prospective Student] -->|Voice Clip or Text| B[Streamlit UI - app.py]
    B -->|Audio Bytes| C[Groq Whisper STT - whisper-large-v3-turbo]
    C -->|Transcribed Query + Language| D[Python AI Agent - ai_agent.py]
    B -->|Lookup Email or Phone| E[(SQLite Database - voxlead.db)]
    E -->|Prior Student Context| D
    D -->|Embed Query| F[RAG Knowledge Retrieval - Sentence Transformers + NumPy]
    G[Course Brochure - knowledge_base.txt] -->|Section Chunks| F
    F -->|Top-K Grounded Course Facts| D
    D -->|Prompt + Memory + RAG Context| H[Groq LLM - llama-3.3-70b-versatile]
    H -->|Counselling Reply| I[gTTS Audio Synthesis]
    I -->|MP3 Playback| B
    H -->|Structured JSON Extraction| D
    D -->|Upsert Lead, Summary, Sentiment & Auto-Book Slot| E
    E -->|Pandas DataFrames & Metrics| J[Staff CRM & Analytics Dashboard]
```

## Component Responsibilities

1. **Streamlit Interface (`app.py`)**: Provides 6 dedicated views: Dashboard, AI Voice Assistant, Leads, Appointments, Call History, and Knowledge Base.
2. **Groq Whisper STT (`ai_agent.py`)**: Transcribes student voice recordings and detects language (`en`, `hi`, `te`).
3. **Sentence Transformers + NumPy RAG (`ai_agent.py`)**: Embeds sections of `knowledge_base.txt` with `all-MiniLM-L6-v2` and ranks top matches via NumPy cosine similarity so fees, duration, and syllabus are never fabricated.
4. **Contextual Memory (`database.py`)**: Looks up returning students by email or phone in SQLite and injects previous course interest, call summaries, and upcoming counselling bookings into the LLM system prompt.
5. **SQLite + Pandas (`database.py`)**: Enforces valid dates/slots, prevents duplicate counselling bookings, stores transcripts and summaries, and aggregates distribution metrics via Pandas.
