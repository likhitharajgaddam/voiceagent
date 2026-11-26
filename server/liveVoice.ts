import type { Server as HttpServer } from "node:http";
import {
  FunctionDeclaration,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Type,
} from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import {
  bookAppointmentSafe,
  createOrUpdateCall,
  db,
  getAvailableSlotsForDate,
  upsertLead,
} from "./db";
import { analyzeAndPersistCallSummary } from "./intelligence";
import { searchKnowledgeBase } from "./rag";

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in environment configuration.");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

const searchKnowledgeDecl: FunctionDeclaration = {
  name: "searchKnowledgeBase",
  description:
    "Search uploaded company PDF/TXT knowledge documents for accurate pricing, plans, features, integrations, and policies before answering company questions.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "Customer question or topic to look up." },
    },
    required: ["query"],
  },
};

const checkSlotsDecl: FunctionDeclaration = {
  name: "checkAvailableSlots",
  description:
    "Check open product demonstration appointment slots for a given date (YYYY-MM-DD).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      demoDate: { type: Type.STRING, description: "Date in YYYY-MM-DD format." },
    },
    required: ["demoDate"],
  },
};

const bookAppointmentDecl: FunctionDeclaration = {
  name: "bookDemoAppointment",
  description:
    "Book a confirmed product demonstration in the database. Only call after clarifying date/time, checking slot availability, and confirming with the customer.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      customerName: { type: Type.STRING },
      customerEmail: { type: Type.STRING },
      demoDate: { type: Type.STRING, description: "YYYY-MM-DD" },
      demoTime: {
        type: Type.STRING,
        description: "One of: 10:00 AM, 11:30 AM, 2:00 PM, 4:00 PM, 5:30 PM",
      },
      topic: { type: Type.STRING },
    },
    required: ["customerName", "demoDate", "demoTime"],
  },
};

const updateCrmLeadDecl: FunctionDeclaration = {
  name: "updateCrmLead",
  description:
    "Persist newly learned customer information, requirements, budget, timeline, qualification, or sentiment into the CRM immediately.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      email: { type: Type.STRING },
      phone: { type: Type.STRING },
      company: { type: Type.STRING },
      requirement: { type: Type.STRING },
      budget: { type: Type.STRING },
      buyingTimeline: { type: Type.STRING },
      qualification: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
      sentiment: { type: Type.STRING, enum: ["Positive", "Neutral", "Negative"] },
      language: { type: Type.STRING, description: "en, hi, or te" },
    },
  },
};

const markOptOutDecl: FunctionDeclaration = {
  name: "markOptOut",
  description:
    "Immediately mark a customer as opted out / do-not-call if they ask not to be contacted again.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING },
    },
    required: ["reason"],
  },
};

export function attachLiveVoiceWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (clientWs: WebSocket, req) => {
    const url = new URL(req.url ?? "/live", "http://localhost");
    const sessionId =
      url.searchParams.get("sessionId")?.trim() ||
      `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const preferredLang = url.searchParams.get("lang")?.trim() || "auto";

    const startedAtMs = Date.now();
    let currentLeadId: number | null = null;
    let callEnded = false;
    let detectedLanguage = preferredLang === "auto" ? "en" : preferredLang;
    const transcriptLog: Array<{ speaker: "Customer" | "VoxLead AI"; text: string }> = [];
    let pendingUserBuffer = "";
    let pendingModelBuffer = "";

    const sendToClient = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const flushTranscriptBuffers = () => {
      if (pendingUserBuffer.trim()) {
        transcriptLog.push({ speaker: "Customer", text: pendingUserBuffer.trim() });
        pendingUserBuffer = "";
      }
      if (pendingModelBuffer.trim()) {
        transcriptLog.push({ speaker: "VoxLead AI", text: pendingModelBuffer.trim() });
        pendingModelBuffer = "";
      }
    };

    sendToClient({ type: "status", status: "Connecting", sessionId });

    try {
      createOrUpdateCall({
        sessionId,
        callMode: "browser",
        direction: "inbound",
        status: "Connecting",
        language: detectedLanguage,
      });

      const ai = getAiClient();
      const todayIso = new Date().toISOString().split("T")[0];
      const tomorrowIso = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      const systemInstruction = `You are VoxLead AI, an autonomous, helpful AI Admission Counsellor for VoxLead Career & Tech Academy (an IT Coaching Institute & Training Centre).
Today's date is ${todayIso} (tomorrow is ${tomorrowIso}).

CORE VOICE & CONVERSATIONAL FLOW:
1. START OF CALL — COLLECT STUDENT DETAILS FIRST: As soon as the call starts, warmly welcome the student to VoxLead Career & Tech Academy and ask for their full name and contact details (phone number or email), plus which course they are interested in. If the student asks a question immediately without giving their details, briefly answer their question (via 'searchKnowledgeBase') and politely ask for their name and phone/email so you can personalize guidance and save their enquiry.
2. IMMEDIATE CRM CAPTURE: Call 'updateCrmLead' immediately whenever the student shares their name, phone, email, educational/work background, course interest, preferred batch schedule, or sentiment. Keep updating as new details arrive.
3. MULTILINGUAL SUPPORT: Fluently understand and speak English, Hindi, and Telugu (and detect automatically). If the student speaks or switches to Hindi, Telugu, or English, immediately respond naturally in their chosen language.
4. CONTEXTUAL MEMORY & DISCOVERY: Ask naturally about the student's current background/experience, learning goals, and preferred batch schedule (Morning, Evening, or Weekend). Remember everything already collected—never ask the same question twice.
5. COURSE KNOWLEDGE GROUNDING: Always call 'searchKnowledgeBase' before quoting any course fees, duration, syllabus, eligibility, batch timings, or placement support. Never invent facts or fees; if information is missing, clearly tell the student it is not in your course brochure.
6. COUNSELLING APPOINTMENT BOOKING: When a student wants to book a 1-on-1 counselling session:
   - Clarify the exact date and preferred time if ambiguous (e.g. "tomorrow afternoon" -> ask 2:00 PM or 4:00 PM).
   - Call 'checkAvailableSlots' first.
   - Ensure you have the student's name and email/phone before booking.
   - Confirm the chosen slot, then call 'bookDemoAppointment'. Only announce the booking is confirmed after the tool returns success.
7. OPT-OUT COMPLIANCE: If the student asks not to be contacted again, immediately call 'markOptOut', politely acknowledge, and conclude the call.`;

      let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;

      const finalizeCall = async (finalStatus: "Completed" | "Failed", errMsg = "") => {
        if (callEnded) return;
        callEnded = true;
        flushTranscriptBuffers();

        // Immediately close upstream Gemini Live session so no further audio frames stream
        try {
          session?.close();
        } catch {
          // Ignore close error
        }

        const durationSec = Math.max(1, Math.round((Date.now() - startedAtMs) / 1000));
        const transcriptText = transcriptLog
          .map((t) => `${t.speaker}: ${t.text}`)
          .join("\n");

        let summaryResult = null;
        let summaryError = "";
        try {
          if (transcriptText.trim()) {
            summaryResult = await analyzeAndPersistCallSummary({
              sessionId,
              transcript: transcriptText,
              fallbackLanguage: detectedLanguage,
            });
            currentLeadId = summaryResult.leadId;
          }
        } catch (sumErr) {
          summaryError = sumErr instanceof Error ? sumErr.message : String(sumErr);
          console.error("[LiveVoice] Post-call summary failed:", sumErr);
        }

        createOrUpdateCall({
          sessionId,
          leadId: currentLeadId,
          callMode: "browser",
          direction: "inbound",
          status: finalStatus,
          durationSec,
          language: summaryResult?.language ?? detectedLanguage,
          errorMessage: errMsg || summaryError,
          ended: true,
        });

        sendToClient({
          type: "callEnded",
          status: finalStatus,
          durationSec,
          summary: summaryResult,
          error: summaryError || undefined,
        });
      };

      const handleClientMessage = (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            audio?: string;
            text?: string;
          };

          if (msg.type === "end") {
            void finalizeCall("Completed");
            return;
          }
          if (!session || callEnded) {
            return;
          }

          if (msg.type === "audio" && msg.audio) {
            session.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: "audio/pcm;rate=16000" },
            });
          } else if (msg.type === "text" && msg.text?.trim()) {
            const cleanText = msg.text.trim();
            transcriptLog.push({ speaker: "Customer", text: cleanText });
            sendToClient({ type: "status", status: "Thinking" });
            session.sendRealtimeInput({ text: cleanText });
          }
        } catch (parseErr) {
          sendToClient({
            type: "error",
            error: parseErr instanceof Error ? parseErr.message : "Invalid WebSocket payload",
          });
        }
      };

      clientWs.on("message", handleClientMessage);
      clientWs.on("close", () => {
        void finalizeCall("Completed");
      });

      session = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          tools: [
            {
              functionDeclarations: [
                searchKnowledgeDecl,
                checkSlotsDecl,
                bookAppointmentDecl,
                updateCrmLeadDecl,
                markOptOutDecl,
              ],
            },
          ],
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            // Wait until connect() resolves so session & listeners are ready
          },
          onmessage: async (message: LiveServerMessage) => {
            if (callEnded) return;
            const content = message.serverContent;

            if (content?.interrupted) {
              flushTranscriptBuffers();
              sendToClient({ type: "interrupted", status: "Listening" });
            }

            if (content?.inputTranscription?.text) {
              const chunk = content.inputTranscription.text;
              pendingUserBuffer += chunk;
              sendToClient({ type: "inputTranscript", text: chunk });
            }

            if (content?.outputTranscription?.text) {
              const chunk = content.outputTranscription.text;
              pendingModelBuffer += chunk;
              sendToClient({ type: "outputTranscript", text: chunk });
            }

            if (content?.modelTurn?.parts) {
              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                  sendToClient({ type: "status", status: "Speaking" });
                  sendToClient({ type: "audio", audio: part.inlineData.data });
                }
              }
            }

            if (content?.turnComplete) {
              flushTranscriptBuffers();
              sendToClient({ type: "turnComplete", status: "Listening" });
            }

            // Execute Live Function Calls (RAG, Slot Check, Booking, CRM Update, Opt-Out)
            if (message.toolCall?.functionCalls?.length) {
              sendToClient({ type: "status", status: "Thinking" });
              const functionResponses = [];

              for (const call of message.toolCall.functionCalls) {
                const args = (call.args ?? {}) as Record<string, unknown>;
                let resultPayload: Record<string, unknown> = { ok: true };

                try {
                  if (call.name === "searchKnowledgeBase") {
                    const query = String(args.query ?? "");
                    const rag = await searchKnowledgeBase(query, 4);
                    resultPayload = {
                      mode: rag.mode,
                      results: rag.chunks.map((c) => ({
                        source: c.filename,
                        section: c.title,
                        content: c.content,
                        relevanceScore: c.score,
                      })),
                    };
                    sendToClient({
                      type: "toolEvent",
                      tool: "searchKnowledgeBase",
                      data: rag.chunks,
                    });
                  } else if (call.name === "checkAvailableSlots") {
                    const d = String(args.demoDate ?? tomorrowIso);
                    const slots = getAvailableSlotsForDate(d);
                    resultPayload = { demoDate: d, availableSlots: slots };
                    sendToClient({
                      type: "toolEvent",
                      tool: "checkAvailableSlots",
                      data: resultPayload,
                    });
                  } else if (call.name === "bookDemoAppointment") {
                    const customerName = String(args.customerName ?? "Prospect");
                    const customerEmail = String(args.customerEmail ?? "");
                    const demoDate = String(args.demoDate ?? tomorrowIso);
                    const demoTime = String(args.demoTime ?? "2:00 PM");
                    const topic = String(args.topic ?? "VoxLead AI Product Demo");

                    if (!currentLeadId) {
                      currentLeadId = upsertLead({
                        sessionId,
                        name: customerName,
                        email: customerEmail,
                        qualification: "High",
                        sentiment: "Positive",
                        language: detectedLanguage,
                      });
                    }

                    const booking = bookAppointmentSafe({
                      sessionId,
                      leadId: currentLeadId,
                      customerName,
                      customerEmail,
                      demoDate,
                      demoTime,
                      topic,
                    });

                    resultPayload = booking;
                    sendToClient({
                      type: "toolEvent",
                      tool: "bookDemoAppointment",
                      data: { ...booking, customerName, demoDate, demoTime, topic },
                    });
                  } else if (call.name === "updateCrmLead") {
                    if (args.language) {
                      detectedLanguage = String(args.language).slice(0, 5);
                    }
                    currentLeadId = upsertLead({
                      sessionId,
                      name: args.name ? String(args.name) : undefined,
                      email: args.email ? String(args.email) : undefined,
                      phone: args.phone ? String(args.phone) : undefined,
                      company: args.company ? String(args.company) : undefined,
                      requirement: args.requirement ? String(args.requirement) : undefined,
                      budget: args.budget ? String(args.budget) : undefined,
                      buyingTimeline: args.buyingTimeline
                        ? String(args.buyingTimeline)
                        : undefined,
                      qualification: args.qualification
                        ? String(args.qualification)
                        : undefined,
                      sentiment: args.sentiment ? String(args.sentiment) : undefined,
                      language: detectedLanguage,
                    });
                    const leadRow = db
                      .prepare("SELECT * FROM leads WHERE id = ?")
                      .get(currentLeadId);
                    resultPayload = { ok: true, leadId: currentLeadId };
                    sendToClient({
                      type: "toolEvent",
                      tool: "updateCrmLead",
                      data: leadRow,
                    });
                  } else if (call.name === "markOptOut") {
                    const reason = String(args.reason ?? "Customer requested opt-out");
                    currentLeadId = upsertLead({
                      sessionId,
                      qualification: "Low",
                      sentiment: "Negative",
                      optedOut: true,
                      nextRecommendedAction: "Do Not Contact — customer opted out.",
                      notes: reason,
                    });
                    resultPayload = { ok: true, optedOut: true };
                    sendToClient({
                      type: "toolEvent",
                      tool: "markOptOut",
                      data: { reason },
                    });
                  }
                } catch (toolErr) {
                  resultPayload = {
                    ok: false,
                    error: toolErr instanceof Error ? toolErr.message : "Tool execution failed",
                  };
                }

                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: resultPayload,
                });
              }

              session?.sendToolResponse({ functionResponses });
            }
          },
          onerror: (err) => {
            const msg = err?.message || "Live voice session error";
            console.error("[LiveVoice] Gemini Live error:", msg);
            createOrUpdateCall({
              sessionId,
              leadId: currentLeadId,
              callMode: "browser",
              direction: "inbound",
              status: "Failed",
              durationSec: Math.round((Date.now() - startedAtMs) / 1000),
              errorMessage: msg,
              ended: true,
            });
            sendToClient({ type: "status", status: "Failed", error: msg });
          },
          onclose: (closeEvt) => {
            const reason =
              (closeEvt as { reason?: string } | undefined)?.reason || "";
            if (reason) {
              console.warn("[LiveVoice] Gemini Live closed:", reason);
            }
            if (!callEnded) {
              void finalizeCall(reason ? "Failed" : "Completed", reason);
            }
          },
        },
      });

      if (!callEnded && clientWs.readyState === WebSocket.OPEN) {
        createOrUpdateCall({
          sessionId,
          leadId: currentLeadId,
          callMode: "browser",
          direction: "inbound",
          status: "Listening",
        });
        sendToClient({ type: "status", status: "Listening", sessionId });

        // Trigger the AI to speak first on call start and collect student details
        const langCue =
          preferredLang === "hi"
            ? "in Hindi"
            : preferredLang === "te"
            ? "in Telugu"
            : "in English (and mention they can also speak in Hindi or Telugu)";
        session.sendRealtimeInput({
          text: `The call just connected. Greet the caller warmly ${langCue} as VoxLead AI Admission Counsellor for VoxLead Career & Tech Academy, and politely ask for their name, phone number or email, and which course they are interested in.`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start live voice call.";
      createOrUpdateCall({
        sessionId,
        leadId: currentLeadId,
        callMode: "browser",
        direction: "inbound",
        status: "Failed",
        durationSec: Math.round((Date.now() - startedAtMs) / 1000),
        errorMessage: msg,
        ended: true,
      });
      sendToClient({ type: "status", status: "Failed", error: msg });
      clientWs.close();
    }
  });
}
