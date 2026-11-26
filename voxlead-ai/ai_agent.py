"""
ai_agent.py — Coaching Institute AI Admission Counsellor Pipeline for VoxLead AI

Committed Stack:
- Groq Whisper (whisper-large-v3-turbo) for Multilingual Speech-to-Text
- Sentence Transformers (all-MiniLM-L6-v2) + NumPy Cosine Similarity for RAG
- Groq LLM (llama-3.3-70b-versatile) for Grounded Multilingual Counselling & CRM Extraction
- gTTS for Turn-Based Text-to-Speech Playback
"""

from datetime import date, timedelta
import io
import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from groq import APIConnectionError, AuthenticationError, Groq, RateLimitError
from gtts import gTTS
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except ImportError:  # Graceful message if not yet installed
    SentenceTransformer = None  # type: ignore[assignment]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
load_dotenv()

KNOWLEDGE_BASE_PATH = os.path.join(BASE_DIR, "knowledge_base.txt")
GROQ_LLM_MODEL = "llama-3.3-70b-versatile"
GROQ_WHISPER_MODEL = "whisper-large-v3-turbo"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

GTTS_SUPPORTED_LANGS = {"en", "hi", "te", "ta", "es", "fr", "de"}

_embedder: Any = None
_cached_kb_text: Optional[str] = None
_cached_chunks: List[Dict[str, str]] = []
_cached_embeddings: Optional[np.ndarray] = None


def _get_groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "gsk_your_actual_groq_api_key_here":
        raise ValueError(
            "GROQ_API_KEY is missing or still set to the placeholder. Add your real Groq API key in .env."
        )
    return Groq(api_key=api_key)


def load_knowledge_base() -> str:
    if not os.path.exists(KNOWLEDGE_BASE_PATH):
        return ""
    with open(KNOWLEDGE_BASE_PATH, "r", encoding="utf-8") as file:
        return file.read().strip()


def save_knowledge_base(content: str) -> Tuple[bool, str]:
    cleaned = content.strip()
    if len(cleaned) < 40:
        return False, "Knowledge base content is too short. Please include course details."
    with open(KNOWLEDGE_BASE_PATH, "w", encoding="utf-8") as file:
        file.write(cleaned + "\n")
    # Invalidate embedding cache so updated course info takes effect immediately
    global _cached_kb_text, _cached_chunks, _cached_embeddings
    _cached_kb_text = None
    _cached_chunks = []
    _cached_embeddings = None
    return True, "Knowledge base saved and RAG index refreshed."


def _split_chunks(raw: str) -> List[Dict[str, str]]:
    if not raw:
        return []
    sections = re.split(r"\n(?=## )", raw)
    chunks: List[Dict[str, str]] = []
    for section in sections:
        cleaned = section.strip()
        if not cleaned:
            continue
        title = cleaned.splitlines()[0].replace("##", "").strip()
        chunks.append({"title": title, "content": cleaned})
    return chunks


def _get_embedder():
    global _embedder
    if _embedder is None and SentenceTransformer is not None:
        _embedder = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _embedder


def _lexical_score(query: str, text: str) -> float:
    q_terms = set(re.findall(r"[a-z0-9]{2,}", query.lower()))
    c_terms = re.findall(r"[a-z0-9]{2,}", text.lower())
    if not q_terms or not c_terms:
        return 0.0
    hits = sum(1 for t in c_terms if t in q_terms)
    return hits / float(np.sqrt(len(c_terms) * len(q_terms)))


def retrieve_relevant_chunks(query: str, top_k: int = 3) -> Tuple[List[Dict[str, Any]], str]:
    """
    Retrieve top-k relevant course sections using Sentence Transformers + NumPy cosine similarity.
    Falls back to keyword overlap if SentenceTransformer model weights cannot be loaded offline.
    """
    global _cached_kb_text, _cached_chunks, _cached_embeddings

    raw = load_knowledge_base()
    if not raw:
        return [], "empty"

    if raw != _cached_kb_text:
        _cached_kb_text = raw
        _cached_chunks = _split_chunks(raw)
        _cached_embeddings = None

    if not _cached_chunks:
        return [], "empty"

    mode = "sentence_transformers_numpy"
    scores: np.ndarray

    try:
        embedder = _get_embedder()
        if embedder is None:
            raise RuntimeError("sentence-transformers not installed")

        if _cached_embeddings is None:
            texts = [c["content"] for c in _cached_chunks]
            _cached_embeddings = np.asarray(embedder.encode(texts, normalize_embeddings=True))

        query_vec = np.asarray(embedder.encode([query], normalize_embeddings=True))[0]
        scores = np.dot(_cached_embeddings, query_vec)
    except Exception:
        mode = "lexical_fallback"
        scores = np.array([_lexical_score(query, c["content"]) for c in _cached_chunks])

    top_indices = np.argsort(scores)[::-1][:top_k]
    selected: List[Dict[str, Any]] = []
    for idx in top_indices:
        chunk = _cached_chunks[int(idx)]
        selected.append(
            {
                "title": chunk["title"],
                "content": chunk["content"],
                "score": round(float(scores[int(idx)]), 4),
            }
        )

    # Always include Strict Admission Accuracy & Opt-Out Policies
    selected_titles = {c["title"] for c in selected}
    for chunk in _cached_chunks:
        if "Strict Admission" in chunk["title"] and chunk["title"] not in selected_titles:
            selected.append({"title": chunk["title"], "content": chunk["content"], "score": 1.0})
            break

    return selected, mode


def _normalize_language_code(raw_lang: Optional[str]) -> str:
    val = (raw_lang or "en").strip().lower()
    mapping = {
        "english": "en",
        "en": "en",
        "hindi": "hi",
        "hi": "hi",
        "telugu": "te",
        "te": "te",
        "tamil": "ta",
        "ta": "ta",
    }
    return mapping.get(val, val[:2] if len(val) >= 2 else "en")


def transcribe_audio(audio_bytes: bytes) -> Tuple[Optional[str], str, Optional[str]]:
    """Speech-to-Text via Groq Whisper API (`whisper-large-v3-turbo`)."""
    if not audio_bytes:
        return None, "en", "No audio recorded. Please speak or type your question below."

    try:
        client = _get_groq_client()
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "student_query.wav"

        transcription = client.audio.transcriptions.create(
            file=audio_file,
            model=GROQ_WHISPER_MODEL,
            response_format="verbose_json",
        )
        text = (getattr(transcription, "text", "") or "").strip()
        raw_lang = getattr(transcription, "language", "en")
        lang_code = _normalize_language_code(raw_lang)

        if not text:
            return None, lang_code, "No speech detected in the recording. Please try again."
        return text, lang_code, None
    except ValueError as exc:
        return None, "en", str(exc)
    except AuthenticationError:
        return None, "en", "Invalid GROQ_API_KEY. Please verify your key in .env."
    except RateLimitError:
        return None, "en", "Groq Whisper rate limit reached. Please retry in a few seconds."
    except APIConnectionError:
        return None, "en", "Network error connecting to Groq Whisper API."
    except Exception as exc:
        return None, "en", f"Groq Whisper transcription failed: {exc}"


def generate_counsellor_reply(
    chat_history: List[Dict[str, str]],
    user_message: str,
    detected_language: str = "en",
    prior_student_context: Optional[Dict[str, Any]] = None,
    current_crm: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[str], List[Dict[str, Any]], str, Optional[str]]:
    """Generate a grounded multilingual admission counselling response via Groq LLM."""
    if not user_message or not user_message.strip():
        return None, [], "empty", "Message cannot be empty."

    try:
        client = _get_groq_client()
        recent_user = " ".join(m["content"] for m in chat_history[-2:] if m["role"] == "user")
        retrieved_chunks, rag_mode = retrieve_relevant_chunks(f"{recent_user} {user_message}", top_k=3)
        rag_context = "\n\n".join(c["content"] for c in retrieved_chunks)

        memory_block = "No returning student profile loaded yet."
        if prior_student_context:
            appt = prior_student_context.get("upcoming_appointment")
            appt_str = (
                f"{appt['demo_date']} at {appt['demo_time']} ({appt['course_topic']})"
                if appt
                else "None"
            )
            memory_block = (
                f"Returning Student Found in SQLite CRM:\n"
                f"- Name: {prior_student_context.get('name') or 'Unknown'}\n"
                f"- Email: {prior_student_context.get('email') or 'Unknown'}\n"
                f"- Course Interest: {prior_student_context.get('course_requirement') or 'Unknown'}\n"
                f"- Previous Interest Level: {prior_student_context.get('interest_level')}\n"
                f"- Last Call Summary: {prior_student_context.get('last_summary') or 'None'}\n"
                f"- Upcoming Counselling Slot: {appt_str}"
            )

        known_name = (current_crm or {}).get("student_name") or (prior_student_context or {}).get("name") or ""
        known_email = (current_crm or {}).get("email") or (prior_student_context or {}).get("email") or ""
        known_phone = (current_crm or {}).get("phone") or (prior_student_context or {}).get("phone") or ""
        known_bg = (current_crm or {}).get("background") or (prior_student_context or {}).get("background") or ""
        known_course = (current_crm or {}).get("course_requirement") or (prior_student_context or {}).get("course_requirement") or ""

        missing_fields: List[str] = []
        if not known_name:
            missing_fields.append("Full Name")
        if not known_email and not known_phone:
            missing_fields.append("Phone Number or Email")
        if not known_bg:
            missing_fields.append("Current Education/Work Background")
        if not known_course:
            missing_fields.append("Course Interest")

        intake_status = (
            f"Missing Student Intake Details: {', '.join(missing_fields)}."
            if missing_fields
            else "All basic student intake details collected."
        )

        today_str = date.today().isoformat()
        tomorrow_str = (date.today() + timedelta(days=1)).isoformat()

        system_prompt = f"""
You are VoxLead AI, an empathetic, knowledgeable AI Admission Counsellor for VoxLead Career & Tech Academy.
Today's date is {today_str} (tomorrow is {tomorrow_str}).

STRICT GROUNDING & COUNSELLING RULES:
1. INTAKE FIRST: Look at the Missing Student Intake Details below. If Full Name or Phone Number/Email is still missing, briefly answer any immediate question the student asked (using the RAG Knowledge Base) and politely ask for their missing name and phone/email right away before moving forward. Never re-ask details already collected.
2. RAG ACCURACY: Answer student questions ONLY using the Retrieved Course Knowledge Base below. NEVER invent fees, custom discounts, fake job guarantees, or unpublished course durations.
3. MULTILINGUAL: Reply in the SAME language the student uses (English, Hindi, or Telugu; detected hint: '{detected_language}').
4. VOICE-FRIENDLY: Keep responses clear and natural for voice playback (2 to 4 concise sentences).
5. DISCOVERY & BOOKING: Ask about the student's background/experience, course interests, and preferred batch schedule. If the student wants a 1-on-1 counselling session, confirm a date and time from the available slots (10:00 AM, 11:30 AM, 2:00 PM, 4:00 PM, 5:30 PM) and collect any missing name/email.

--- STUDENT INTAKE STATUS ---
{intake_status}
Collected: Name={known_name or 'Missing'}, Email={known_email or 'Missing'}, Phone={known_phone or 'Missing'}, Background={known_bg or 'Missing'}, Course={known_course or 'Missing'}
--- END INTAKE STATUS ---

--- RETURNING STUDENT CONTEXTUAL MEMORY ---
{memory_block}
--- END MEMORY ---

--- COURSE KNOWLEDGE BASE (RAG) ---
{rag_context}
--- END KNOWLEDGE BASE ---
""".strip()

        messages = [{"role": "system", "content": system_prompt}]
        for turn in chat_history:
            messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append({"role": "user", "content": user_message.strip()})

        completion = client.chat.completions.create(
            model=GROQ_LLM_MODEL,
            messages=messages,
            temperature=0.3,
            max_tokens=340,
        )
        reply = (completion.choices[0].message.content or "").strip()
        if not reply:
            return None, retrieved_chunks, rag_mode, "Groq LLM returned an empty response."
        return reply, retrieved_chunks, rag_mode, None
    except ValueError as exc:
        return None, [], "none", str(exc)
    except AuthenticationError:
        return None, [], "none", "Invalid GROQ_API_KEY. Please verify your key in .env."
    except RateLimitError:
        return None, [], "none", "Groq API rate limit reached. Please wait a moment and retry."
    except APIConnectionError:
        return None, [], "none", "Network error connecting to Groq API."
    except Exception as exc:
        return None, [], "none", f"AI response error: {exc}"


def analyze_and_extract_turn(chat_history: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Autonomous CRM Intelligence Engine:
    Extracts student contact info, course requirement, interest level, sentiment,
    key discussion points, next steps, summary, and auto-booking intent.
    """
    today = date.today()
    tomorrow = (today + timedelta(days=1)).isoformat()

    fallback: Dict[str, Any] = {
        "student_name": "",
        "email": "",
        "phone": "",
        "background": "",
        "course_requirement": "",
        "preferred_schedule": "",
        "interest_level": "Medium",
        "sentiment": "Neutral",
        "language": "en",
        "follow_up_recommendation": "Share Python Full Stack syllabus brochure and follow up.",
        "key_discussion_points": "Initial course enquiry",
        "next_steps": "Confirm preferred batch and book counselling session.",
        "call_summary": "Admission enquiry in progress.",
        "should_book_appointment": False,
        "demo_date": tomorrow,
        "demo_time": "10:00 AM",
        "course_topic": "Python Full Stack Counselling",
        "opted_out": False,
        "error": None,
    }

    if not chat_history:
        return fallback

    transcript = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in chat_history)

    try:
        client = _get_groq_client()
        prompt = f"""
Analyze this coaching institute admission enquiry conversation and return ONLY a valid JSON object.
Today's date is {today.isoformat()} (tomorrow is {tomorrow}).

Required JSON keys:
- "student_name": string (student's name if stated, else "")
- "email": string (student's email if stated, else "")
- "phone": string (student's phone number if stated, else "")
- "background": string (e.g. "B.Tech CSE Fresher", "Working Professional", else "")
- "course_requirement": string (e.g. "Python Full Stack Development", "Data Science & GenAI", else "")
- "preferred_schedule": string (e.g. "Evening Batch", "Weekend Batch", else "")
- "interest_level": strictly one of "High", "Medium", or "Low"
- "sentiment": strictly one of "Positive", "Neutral", or "Negative"
- "language": 2-letter ISO code of the student's primary language ("en", "hi", "te", etc.)
- "follow_up_recommendation": concise 1-sentence counsellor recommendation
- "key_discussion_points": short comma-separated topics discussed (e.g. "Course Fees, Syllabus, Evening Batch, Placement Support")
- "next_steps": concrete next step (e.g. "Attend counselling session on {tomorrow} at 2:00 PM")
- "call_summary": concise 2-sentence summary of student goals, questions, and outcome
- "should_book_appointment": boolean (true ONLY if the student explicitly agreed to or requested booking a counselling session with a time/date)
- "demo_date": YYYY-MM-DD (resolve "tomorrow" to {tomorrow}; default {tomorrow})
- "demo_time": strictly one of "10:00 AM", "11:30 AM", "2:00 PM", "4:00 PM", or "5:30 PM"
- "course_topic": concise counselling topic (e.g. "Python Full Stack Counselling")
- "opted_out": boolean (true ONLY if student asked not to be contacted again)

TRANSCRIPT:
{transcript}
""".strip()

        completion = client.chat.completions.create(
            model=GROQ_LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=420,
            response_format={"type": "json_object"},
        )
        parsed = json.loads((completion.choices[0].message.content or "{}").strip())

        interest = parsed.get("interest_level", "Medium")
        if interest not in {"High", "Medium", "Low"}:
            interest = "Medium"

        sentiment = parsed.get("sentiment", "Neutral")
        if sentiment not in {"Positive", "Neutral", "Negative"}:
            sentiment = "Neutral"

        demo_time = str(parsed.get("demo_time", "10:00 AM")).strip()
        if demo_time not in {"10:00 AM", "11:30 AM", "2:00 PM", "4:00 PM", "5:30 PM"}:
            demo_time = "10:00 AM"

        return {
            "student_name": str(parsed.get("student_name", "")).strip(),
            "email": str(parsed.get("email", "")).strip(),
            "phone": str(parsed.get("phone", "")).strip(),
            "background": str(parsed.get("background", "")).strip(),
            "course_requirement": str(parsed.get("course_requirement", "")).strip(),
            "preferred_schedule": str(parsed.get("preferred_schedule", "")).strip(),
            "interest_level": interest,
            "sentiment": sentiment,
            "language": _normalize_language_code(parsed.get("language", "en")),
            "follow_up_recommendation": str(
                parsed.get("follow_up_recommendation", fallback["follow_up_recommendation"])
            ).strip(),
            "key_discussion_points": str(
                parsed.get("key_discussion_points", "Course Enquiry")
            ).strip(),
            "next_steps": str(parsed.get("next_steps", fallback["next_steps"])).strip(),
            "call_summary": str(parsed.get("call_summary", fallback["call_summary"])).strip(),
            "should_book_appointment": bool(parsed.get("should_book_appointment", False)),
            "demo_date": str(parsed.get("demo_date", tomorrow)).strip() or tomorrow,
            "demo_time": demo_time,
            "course_topic": str(
                parsed.get("course_topic", "Python Full Stack Counselling")
            ).strip(),
            "opted_out": bool(parsed.get("opted_out", False)),
            "error": None,
        }
    except Exception as exc:
        fallback["error"] = str(exc)
        fallback["call_summary"] = f"Active enquiry ({len(chat_history)} messages). Extraction note: {exc}"
        return fallback


def text_to_speech(text: str, language: str = "en") -> Tuple[Optional[bytes], Optional[str]]:
    """Convert AI response text into MP3 audio bytes using gTTS."""
    if not text or not text.strip():
        return None, "Cannot synthesize an empty message."

    tts_lang = language if language in GTTS_SUPPORTED_LANGS else "en"
    try:
        tts = gTTS(text=text.strip(), lang=tts_lang, slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        return audio_buffer.read(), None
    except Exception as exc:
        return None, f"Text-to-Speech unavailable (check internet connection): {exc}"
