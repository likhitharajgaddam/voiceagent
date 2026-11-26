"""
app.py — Streamlit Coaching Institute Admission Enquiry & Lead Management UI

6 Sections:
1. Dashboard — Total leads, calls, qualified leads, appointments & Pandas charts
2. AI Voice Assistant — Turn-based voice (Groq Whisper + gTTS) & text counselling
3. Leads — Student enquiry pipeline & staff interest status management
4. Appointments — AI-booked counselling sessions & staff status management
5. Call History — Summaries, transcripts, sentiment, discussion points & next steps
6. Knowledge Base — View and update course details in knowledge_base.txt
"""

import uuid
import streamlit as st

from ai_agent import (
    analyze_and_extract_turn,
    generate_counsellor_reply,
    load_knowledge_base,
    save_knowledge_base,
    text_to_speech,
    transcribe_audio,
)
from database import (
    book_appointment_safe,
    get_all_appointments,
    get_all_leads,
    get_analytics_summary,
    get_available_slots,
    get_lead_by_contact,
    get_recent_conversations,
    init_db,
    update_appointment_status,
    update_lead_status,
    upsert_conversation,
    upsert_lead,
)

st.set_page_config(
    page_title="VoxLead AI — Admission Enquiry & Lead Management",
    page_icon="🎓",
    layout="wide",
)
init_db()


def _reset_session() -> None:
    st.session_state.session_id = str(uuid.uuid4())
    st.session_state.messages = [
        {
            "role": "assistant",
            "content": (
                "Hello! Welcome to VoxLead Career & Tech Academy. I am your AI Admission Counsellor "
                "(English, Hindi, and Telugu). Before we begin, may I have your full name, phone number "
                "or email, and which course you are looking for?"
            ),
        }
    ]
    st.session_state.latest_audio = None
    st.session_state.last_audio_hash = None
    st.session_state.error_message = None
    st.session_state.tts_warning = None
    st.session_state.live_crm = None
    st.session_state.auto_booked_msg = None
    st.session_state.prior_student = None
    st.session_state.retrieved_chunks = []
    st.session_state.rag_mode = ""


if "session_id" not in st.session_state:
    _reset_session()


def process_turn(user_text: str, detected_lang: str, enable_tts: bool) -> None:
    st.session_state.error_message = None
    st.session_state.tts_warning = None

    with st.spinner("Searching course brochure (RAG) & generating counselling reply..."):
        reply, chunks, rag_mode, ai_error = generate_counsellor_reply(
            st.session_state.messages,
            user_text,
            detected_language=detected_lang,
            prior_student_context=st.session_state.prior_student,
            current_crm=st.session_state.live_crm,
        )

    if ai_error or not reply:
        st.session_state.error_message = ai_error or "Could not generate an AI response."
        return

    st.session_state.retrieved_chunks = chunks
    st.session_state.rag_mode = rag_mode
    st.session_state.messages.append({"role": "user", "content": user_text})
    st.session_state.messages.append({"role": "assistant", "content": reply})

    with st.spinner("Updating SQLite CRM, interest level, summary & booking intent..."):
        intel = analyze_and_extract_turn(st.session_state.messages)
        st.session_state.live_crm = intel

        # Check returning student context if email or phone was just shared
        if not st.session_state.prior_student and (intel["email"] or intel["phone"]):
            found = get_lead_by_contact(email=intel["email"], phone=intel["phone"])
            if found:
                st.session_state.prior_student = found

        final_lang = intel.get("language") or detected_lang or "en"
        transcript_text = "\n".join(
            f"{m['role'].upper()}: {m['content']}" for m in st.session_state.messages
        )

        try:
            lead_id = upsert_lead(
                session_id=st.session_state.session_id,
                name=intel["student_name"],
                email=intel["email"],
                phone=intel["phone"],
                background=intel["background"],
                course_requirement=intel["course_requirement"],
                interest_level=intel["interest_level"],
                sentiment=intel["sentiment"],
                language=final_lang,
                preferred_schedule=intel["preferred_schedule"],
                follow_up_recommendation=intel["follow_up_recommendation"],
                opted_out=intel["opted_out"],
                notes=intel["call_summary"],
            )

            upsert_conversation(
                session_id=st.session_state.session_id,
                lead_id=lead_id,
                student_name=intel["student_name"],
                transcript=transcript_text,
                summary=intel["call_summary"],
                interest_level=intel["interest_level"],
                sentiment=intel["sentiment"],
                language=final_lang,
                key_discussion_points=intel["key_discussion_points"],
                next_steps=intel["next_steps"],
            )

            if intel.get("should_book_appointment"):
                ok, msg = book_appointment_safe(
                    session_id=st.session_state.session_id,
                    lead_id=lead_id,
                    student_name=intel["student_name"],
                    student_email=intel["email"],
                    demo_date=intel["demo_date"],
                    demo_time=intel["demo_time"],
                    course_topic=intel["course_topic"],
                )
                st.session_state.auto_booked_msg = (ok, msg)
        except Exception as exc:
            st.session_state.error_message = f"Database error: {exc}"

    if enable_tts:
        with st.spinner("Synthesizing gTTS audio response..."):
            audio_bytes, tts_err = text_to_speech(reply, language=final_lang)
        if tts_err:
            st.session_state.tts_warning = tts_err
            st.session_state.latest_audio = None
        else:
            st.session_state.latest_audio = audio_bytes
    else:
        st.session_state.latest_audio = None


# Sidebar Navigation
with st.sidebar:
    st.title("VoxLead AI")
    st.caption("Coaching Institute Admission & Lead Management")
    section = st.radio(
        "Navigation",
        [
            "Dashboard",
            "AI Voice Assistant",
            "Leads",
            "Appointments",
            "Call History",
            "Knowledge Base",
        ],
    )
    st.divider()
    stats = get_analytics_summary()
    st.metric("Student Leads", stats["total_leads"])
    st.metric("Counselling Booked", stats["scheduled_appointments"])


# ==============================================================================
# 1. DASHBOARD
# ==============================================================================
if section == "Dashboard":
    st.header("Admission Enquiry Dashboard")
    analytics = get_analytics_summary()

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Total Leads", analytics["total_leads"])
    c2.metric("Total Calls", analytics["total_calls"])
    c3.metric("High-Interest Leads", analytics["qualified_leads"])
    c4.metric("Scheduled Counselling", analytics["scheduled_appointments"])
    c5.metric("Conversion Rate", f"{analytics['conversion_rate']}%")

    st.divider()
    col_a, col_b = st.columns(2, gap="large")
    with col_a:
        st.subheader("Student Interest Distribution")
        interest_df = analytics["interest_distribution"]
        if interest_df.empty:
            st.info("No student enquiries recorded yet.")
        else:
            st.bar_chart(interest_df.set_index("Interest Level"))
    with col_b:
        st.subheader("Student Sentiment Distribution")
        sentiment_df = analytics["sentiment_distribution"]
        if sentiment_df.empty:
            st.info("No sentiment records yet.")
        else:
            st.bar_chart(sentiment_df.set_index("Sentiment"))


# ==============================================================================
# 2. AI VOICE ASSISTANT
# ==============================================================================
elif section == "AI Voice Assistant":
    st.header("AI Admission Counsellor (Voice & Text)")
    st.info(
        "Architecture Note: This Streamlit prototype uses turn-based audio recording "
        "(`st.audio_input` -> Groq Whisper STT -> Groq LLM + Sentence-Transformers RAG -> gTTS MP3 playback). "
        "It is not continuous full-duplex WebRTC telephony with live barge-in."
    )

    with st.expander("Returning Student Contextual Lookup (Optional — SQLite Memory)"):
        lc1, lc2, lc3 = st.columns([2, 2, 1])
        lookup_email = lc1.text_input("Student Email", placeholder="student@example.com")
        lookup_phone = lc2.text_input("Student Phone", placeholder="+91 9876543210")
        if lc3.button("Load Student Context", use_container_width=True):
            found = get_lead_by_contact(email=lookup_email, phone=lookup_phone)
            if found:
                st.session_state.prior_student = found
                st.success(f"Loaded prior record for {found['name']} ({found['course_requirement'] or 'General'}).")
            else:
                st.warning("No matching student record found in SQLite.")

    col_chat, col_crm = st.columns([1.45, 1], gap="large")

    with col_chat:
        enable_tts = st.checkbox("Auto-play AI voice reply (gTTS)", value=True)

        for msg in st.session_state.messages:
            with st.chat_message(msg["role"]):
                st.write(msg["content"])

        if st.session_state.latest_audio:
            st.audio(st.session_state.latest_audio, format="audio/mp3", autoplay=True)

        if st.session_state.error_message:
            st.error(st.session_state.error_message)
        if st.session_state.tts_warning:
            st.warning(st.session_state.tts_warning)

        st.divider()
        st.markdown("**Turn-Based Voice Recording (Groq Whisper STT)**")
        audio_input = st.audio_input("Record your admission question (English, Hindi, or Telugu)")

        if audio_input is not None:
            raw_bytes = audio_input.getvalue()
            audio_hash = hash(raw_bytes)
            if audio_hash != st.session_state.last_audio_hash:
                st.session_state.last_audio_hash = audio_hash
                with st.spinner("Transcribing speech via Groq Whisper..."):
                    transcript, lang, stt_err = transcribe_audio(raw_bytes)
                if stt_err:
                    st.session_state.error_message = stt_err
                    st.rerun()
                elif transcript:
                    process_turn(transcript, lang, enable_tts)
                    st.rerun()

        typed = st.chat_input("Or type a question (e.g., Python Full Stack fees, syllabus, book counselling)...")
        if typed:
            process_turn(typed, "auto", enable_tts)
            st.rerun()

        if st.button("Start New Student Call"):
            _reset_session()
            st.rerun()

    with col_crm:
        st.subheader("Live Autonomous CRM Sync")
        crm = st.session_state.live_crm
        if not crm:
            st.caption("Student details, interest level, sentiment, and auto-booked counselling slots appear here automatically.")
        else:
            m1, m2, m3 = st.columns(3)
            m1.metric("Interest", crm["interest_level"])
            m2.metric("Sentiment", crm["sentiment"])
            m3.metric("Language", crm["language"].upper())

            st.write(
                f"- **Student:** {crm['student_name'] or 'Not shared yet'}\n"
                f"- **Email:** {crm['email'] or 'Not shared yet'}\n"
                f"- **Phone:** {crm['phone'] or 'Not shared yet'}\n"
                f"- **Course Interest:** {crm['course_requirement'] or 'Exploring'}\n"
                f"- **Preferred Batch:** {crm['preferred_schedule'] or 'Not specified'}"
            )

            if st.session_state.auto_booked_msg:
                ok, msg = st.session_state.auto_booked_msg
                if ok:
                    st.success(msg)
                else:
                    st.warning(msg)

            st.markdown("**Call Summary**")
            st.info(crm["call_summary"])
            st.caption(f"Next Steps: {crm['next_steps']}")


# ==============================================================================
# 3. LEADS
# ==============================================================================
elif section == "Leads":
    st.header("Student Leads Pipeline")
    leads = get_all_leads()
    if not leads:
        st.info("No student leads captured yet. Start a conversation in AI Voice Assistant.")
    else:
        st.dataframe(leads, use_container_width=True, hide_index=True)

        st.subheader("Staff Interest Level Management")
        lead_options = {f"#{l['id']} — {l['name']} ({l['course_requirement'] or 'General'})": l["id"] for l in leads}
        selected_label = st.selectbox("Select Student Lead", list(lead_options.keys()))
        new_interest = st.selectbox("Update Interest Level", ["High", "Medium", "Low"])
        if st.button("Save Lead Status"):
            if update_lead_status(lead_options[selected_label], new_interest):
                st.success("Lead interest level updated in SQLite.")
                st.rerun()


# ==============================================================================
# 4. APPOINTMENTS (AI-Booked Only + Staff Status Management)
# ==============================================================================
elif section == "Appointments":
    st.header("Counselling Appointments")
    st.caption(
        "Counselling appointments are booked autonomously by VoxLead AI during student conversations. "
        "Staff can inspect open slots and update appointment statuses below."
    )

    col_slots, col_list = st.columns([1, 2], gap="large")
    with col_slots:
        st.subheader("Open Counselling Slots")
        check_date = st.date_input("Check Date").isoformat()
        open_slots = get_available_slots(check_date)
        st.write("Available:", ", ".join(open_slots) if open_slots else "All slots booked")

    with col_list:
        st.subheader("Scheduled Sessions")
        appts = get_all_appointments()
        if not appts:
            st.info("No counselling sessions booked yet.")
        else:
            st.dataframe(appts, use_container_width=True, hide_index=True)
            appt_map = {
                f"#{a['id']} — {a['student_name']} ({a['demo_date']} {a['demo_time']}) [{a['status']}]": a["id"]
                for a in appts
            }
            sc1, sc2, sc3 = st.columns([2, 1, 1])
            chosen_appt = sc1.selectbox("Select Appointment", list(appt_map.keys()))
            chosen_status = sc2.selectbox("New Status", ["Scheduled", "Completed", "Cancelled"])
            if sc3.button("Update Status", use_container_width=True):
                if update_appointment_status(appt_map[chosen_appt], chosen_status):
                    st.success("Appointment status updated.")
                    st.rerun()


# ==============================================================================
# 5. CALL HISTORY
# ==============================================================================
elif section == "Call History":
    st.header("Call Summaries, Sentiment & Transcripts")
    convs = get_recent_conversations(limit=25)
    if not convs:
        st.info("No call records stored yet.")
    else:
        for conv in convs:
            with st.expander(
                f"{conv['student_name']} — Interest: {conv['interest_level']} | Sentiment: {conv['sentiment']}"
            ):
                st.markdown(f"**Summary:** {conv['summary']}")
                st.markdown(f"**Key Discussion Points:** {conv['key_discussion_points']}")
                st.markdown(f"**Next Steps:** {conv['next_steps']}")
                st.text_area(
                    "Full Transcript",
                    value=conv["transcript"],
                    height=140,
                    disabled=True,
                    key=f"hist_{conv['id']}",
                )


# ==============================================================================
# 6. KNOWLEDGE BASE
# ==============================================================================
elif section == "Knowledge Base":
    st.header("Course Knowledge Base (`knowledge_base.txt`)")
    st.caption(
        "Used by Sentence Transformers (`all-MiniLM-L6-v2`) + NumPy cosine similarity to ground all "
        "counselling responses in accurate fees, syllabus, eligibility, and batch timings."
    )

    current_kb = load_knowledge_base()
    edited_kb = st.text_area("Edit Course Brochure Knowledge", value=current_kb, height=420)
    if st.button("Save & Refresh Knowledge Base"):
        ok, msg = save_knowledge_base(edited_kb)
        if ok:
            st.success(msg)
        else:
            st.error(msg)
