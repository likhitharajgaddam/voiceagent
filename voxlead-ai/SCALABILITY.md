# Scalability Strategy — Supporting Up to 100,000 Users

## 1. Realistic Capacity Distinction

Supporting **100,000 registered student/staff users** over time is architecturally very different from supporting **100,000 simultaneous live voice calls**:

- **100,000 Registered Users**: Typically produces 500 to 3,000 concurrent dashboard/enquiry sessions during peak admission seasons (result announcements, batch launches).
- **100,000 Simultaneous Live Voice Calls**: Requires dedicated telecom media servers, WebRTC SFUs, horizontal STT/TTS GPU clusters, and regional load balancers—well beyond a single-instance Streamlit + SQLite prototype.

## 2. Database Migration & Indexing (SQLite -> PostgreSQL)

The current prototype uses **SQLite** (`voxlead.db`), which works reliably for single-institute deployments and local evaluation but faces write-lock contention under high multi-worker concurrency.

To scale to 100,000 users:
- **Migrate to Managed PostgreSQL** (e.g., AWS RDS / Cloud SQL) with connection pooling (`PgBouncer`).
- **Keep & Expand Indexes**: Retain indexes on `leads(email)`, `leads(phone)`, `appointments(demo_date, demo_time)`, and `conversations(session_id)`, plus a partial unique index on `appointments(demo_date, demo_time) WHERE status = 'Scheduled'` to guarantee zero double-bookings under concurrent load.

## 3. Caching & RAG Performance

- **Precompute Embeddings**: Store `knowledge_base.txt` embeddings in memory/vector index (`pgvector`) rather than recomputing on startup across workers.
- **Model Warm-Up**: Load `SentenceTransformer("all-MiniLM-L6-v2")` once per worker container at startup rather than per request.

## 4. Stateless Application Scaling & Background Jobs

- **Horizontal Web Scaling**: Run multiple containerized instances behind an HTTPS load balancer (migrating from single-process Streamlit to decoupled API workers when concurrency grows).
- **Asynchronous Tasks**: Offload post-call LLM summary generation, gTTS synthesis, and CRM/email notifications to a task queue so user-facing response latency remains low.
- **Automated Backups & Monitoring**: Enable daily point-in-time database backups, API latency/rate-limit alerts, and error logging.
