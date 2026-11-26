export type CallStatus =
  | "Idle"
  | "Connecting"
  | "Listening"
  | "Thinking"
  | "Speaking"
  | "Completed"
  | "Failed";

export type LeadQualification = "High" | "Medium" | "Low";
export type LeadSentiment = "Positive" | "Neutral" | "Negative";

export interface LeadRecord {
  id: number;
  session_id: string | null;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: string;
  qualification: LeadQualification;
  sentiment: LeadSentiment;
  language: string;
  requirement: string;
  budget: string;
  buying_timeline: string;
  objections: string;
  purchase_intent: string;
  next_recommended_action: string;
  opted_out: number;
  consent_recorded: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CallRecord {
  id: number;
  session_id: string;
  lead_id: number | null;
  lead_name: string | null;
  qualification: LeadQualification | null;
  sentiment: LeadSentiment | null;
  call_mode: string;
  direction: string;
  phone_number: string;
  status: string;
  duration_sec: number;
  language: string;
  started_at: string;
  ended_at: string | null;
  error_message: string;
}

export interface AppointmentRecord {
  id: number;
  session_id: string | null;
  lead_id: number | null;
  customer_name: string;
  customer_email: string;
  demo_date: string;
  demo_time: string;
  topic: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  created_at: string;
}

export interface ConversationRecord {
  id: number;
  session_id: string | null;
  lead_id: number | null;
  customer_name: string;
  transcript: string;
  summary: string;
  lead_status: LeadQualification;
  sentiment: LeadSentiment;
  language: string;
  key_topic: string;
  objections: string;
  purchase_intent: string;
  next_action: string;
  updated_at: string;
}

export interface DashboardPayload {
  metrics: {
    totalCalls: number;
    completedCalls: number;
    failedCalls: number;
    avgDurationSec: number;
    totalLeads: number;
    highLeads: number;
    mediumLeads: number;
    lowLeads: number;
    positiveSentiment: number;
    neutralSentiment: number;
    negativeSentiment: number;
    totalAppointments: number;
    appointmentConversionRate: number;
  };
  charts: {
    dailyActivity: Array<{ day: string; calls: number; completed: number }>;
    weeklyTrend: Array<{ week: string; total_leads: number; high_leads: number }>;
  };
  followUps: Array<{
    id: number;
    name: string;
    company: string;
    email: string;
    phone: string;
    qualification: LeadQualification;
    sentiment: LeadSentiment;
    next_recommended_action: string;
    updated_at: string;
  }>;
  leads: LeadRecord[];
  calls: CallRecord[];
  appointments: AppointmentRecord[];
  conversations: ConversationRecord[];
}

export interface IndexedDocument {
  id: number;
  filename: string;
  file_type: string;
  char_count: number;
  chunk_count: number;
  has_embeddings: number;
  uploaded_at: string;
}

export interface RagSearchChunk {
  id: number;
  filename: string;
  title: string;
  content: string;
  score: number;
}

export interface PythonFileEntry {
  name: string;
  language: string;
  role: string;
  content: string;
}
