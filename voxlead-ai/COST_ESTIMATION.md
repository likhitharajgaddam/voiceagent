# Commercial Feasibility & Cost Estimation — VoxLead AI

## 1. Business Value for Coaching Institutes

Small and mid-sized coaching institutes lose prospective admissions when phone/web enquiries go unanswered after hours or during peak intake weeks. Automating first-response course Q&A, interest qualification, and counselling booking saves staff hours while increasing conversion to scheduled counselling sessions.

## 2. Proposed Commercial Model

- **Target Customers**: IT training academies, competitive exam coaching centres, and skill bootcamps.
- **Suggested B2B SaaS Pricing**:
  - **Starter Plan (~INR 4,999 / month)**: Up to 1,000 student enquiries/month, 1 institute knowledge base, CRM dashboard & counselling calendar.
  - **Growth Plan (~INR 12,999 / month)**: Up to 5,000 enquiries/month, multilingual voice + analytics exports, multi-branch staff access.

## 3. Operational Cost Categories & Estimates (Monthly, 1,000 Enquiries / ~3,000 Turns)

*Note: Exact provider bills depend on call duration, audio minutes, and model rates; figures below are conservative planning estimates.*

| Cost Category | Component | Estimated Monthly Cost (USD) | Notes / Assumptions |
| --- | --- | --- | --- |
| LLM Inference | Groq (`llama-3.3-70b-versatile`) | ~$5 – $15 | ~2 turns + 1 JSON extraction per enquiry (~1,500–2,500 tokens/enquiry) |
| Speech-to-Text | Groq Whisper (`whisper-large-v3-turbo`) | ~$2 – $6 | Assuming ~1–2 minutes of student audio per voice enquiry |
| Text-to-Speech | `gTTS` (Prototype) / Cloud TTS (Prod) | $0 (Proto) / ~$10–$25 (Prod) | `gTTS` is free for prototype; commercial cloud TTS recommended for SLA at scale |
| Embeddings & RAG | `all-MiniLM-L6-v2` (Local CPU) | $0 | Runs locally inside app container with zero per-token embedding fee |
| App Hosting & DB | Cloud VM + Managed PostgreSQL | ~$25 – $60 | Small container + managed DB for 10,000–100,000 stored student records |
| **Total Estimated Infra** | **All Categories** | **~$32 – $106 / month** | Yields healthy gross margins against INR 4,999–12,999/month institute plans |
