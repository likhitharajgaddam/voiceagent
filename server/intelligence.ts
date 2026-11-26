import { GoogleGenAI, Type } from "@google/genai";
import {
  normalizeQualification,
  normalizeSentiment,
  upsertConversationSummary,
  upsertLead,
} from "./db";

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

export interface CallIntelligenceResult {
  leadId: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  qualification: "High" | "Medium" | "Low";
  sentiment: "Positive" | "Neutral" | "Negative";
  language: string;
  requirement: string;
  budget: string;
  buyingTimeline: string;
  objections: string;
  purchaseIntent: string;
  nextRecommendedAction: string;
  summary: string;
  keyTopic: string;
  optedOut: boolean;
}

export async function analyzeAndPersistCallSummary(params: {
  sessionId: string;
  transcript: string;
  fallbackLanguage?: string;
}): Promise<CallIntelligenceResult> {
  const cleanTranscript = params.transcript.trim();
  if (!cleanTranscript) {
    const leadId = upsertLead({
      sessionId: params.sessionId,
      qualification: "Low",
      sentiment: "Neutral",
      language: params.fallbackLanguage || "en",
      nextRecommendedAction: "No speech recorded; follow up if customer re-engages.",
      notes: "Call ended without spoken or text dialogue.",
    });

    upsertConversationSummary({
      sessionId: params.sessionId,
      leadId,
      customerName: "Prospect",
      transcript: "",
      summary: "Call ended before conversation started.",
      qualification: "Low",
      sentiment: "Neutral",
      language: params.fallbackLanguage || "en",
      keyTopic: "Incomplete Call",
      nextAction: "Re-engage prospect if inquiry was accidental.",
    });

    return {
      leadId,
      name: "Prospect",
      email: "",
      phone: "",
      company: "",
      qualification: "Low",
      sentiment: "Neutral",
      language: params.fallbackLanguage || "en",
      requirement: "",
      budget: "",
      buyingTimeline: "",
      objections: "",
      purchaseIntent: "Unclear",
      nextRecommendedAction: "Re-engage prospect if inquiry was accidental.",
      summary: "Call ended before conversation started.",
      keyTopic: "Incomplete Call",
      optedOut: false,
    };
  }

  const ai = getAiClient();
  const promptText = `Analyze this completed student admission counselling call transcript for VoxLead AI (Coaching Institute & Training Centre) and extract accurate CRM fields, student interest level (High/Medium/Low), sentiment, discussion points, and summary.
Never invent student contact details that were not stated.

TRANSCRIPT:
${cleanTranscript}`;

  const schemaConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        company: { type: Type.STRING },
        qualification: {
          type: Type.STRING,
          enum: ["High", "Medium", "Low"],
          description:
            "High: strong buying intent or demo booked; Medium: evaluating; Low: no fit/opted out.",
        },
        sentiment: {
          type: Type.STRING,
          enum: ["Positive", "Neutral", "Negative"],
        },
        language: {
          type: Type.STRING,
          description: "Primary ISO 639-1 language code spoken by the customer, e.g. en, hi, te.",
        },
        requirement: { type: Type.STRING },
        budget: { type: Type.STRING },
        buyingTimeline: { type: Type.STRING },
        objections: { type: Type.STRING },
        purchaseIntent: { type: Type.STRING },
        nextRecommendedAction: { type: Type.STRING },
        summary: { type: Type.STRING },
        keyTopic: { type: Type.STRING },
        optedOut: { type: Type.BOOLEAN },
      },
      required: [
        "name",
        "email",
        "phone",
        "company",
        "qualification",
        "sentiment",
        "language",
        "requirement",
        "budget",
        "buyingTimeline",
        "objections",
        "purchaseIntent",
        "nextRecommendedAction",
        "summary",
        "keyTopic",
        "optedOut",
      ],
    },
  };

  let parsed: Partial<CallIntelligenceResult> = {};
  const candidateModels = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];

  for (let attempt = 0; attempt < candidateModels.length; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: candidateModels[attempt],
        contents: promptText,
        config: schemaConfig,
      });
      parsed = JSON.parse((response.text ?? "{}").trim()) as Partial<CallIntelligenceResult>;
      break;
    } catch (err) {
      const isLast = attempt === candidateModels.length - 1;
      if (isLast) {
        console.warn("[Intelligence] Summary extraction fell back to transcript-only save:", err);
        parsed = {
          qualification: "Medium",
          sentiment: "Neutral",
          language: params.fallbackLanguage || "en",
          summary: "Call completed and transcript saved (automated AI summary temporarily unavailable).",
          keyTopic: "Sales Conversation",
          nextRecommendedAction: "Review saved transcript and follow up with prospect.",
        };
      } else {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  const qualification = normalizeQualification(parsed.qualification);
  const sentiment = normalizeSentiment(parsed.sentiment);
  const language = (parsed.language || params.fallbackLanguage || "en").trim().slice(0, 5);
  const name = parsed.name?.trim() || "Prospect";
  const summary = parsed.summary?.trim() || "Sales call completed.";
  const keyTopic = parsed.keyTopic?.trim() || "Product Inquiry";

  const leadId = upsertLead({
    sessionId: params.sessionId,
    name,
    email: parsed.email ?? "",
    phone: parsed.phone ?? "",
    company: parsed.company ?? "",
    qualification,
    sentiment,
    language,
    requirement: parsed.requirement ?? "",
    budget: parsed.budget ?? "",
    buyingTimeline: parsed.buyingTimeline ?? "",
    objections: parsed.objections ?? "",
    purchaseIntent: parsed.purchaseIntent ?? "",
    nextRecommendedAction: parsed.nextRecommendedAction ?? "",
    optedOut: Boolean(parsed.optedOut),
    notes: summary,
  });

  upsertConversationSummary({
    sessionId: params.sessionId,
    leadId,
    customerName: name,
    transcript: cleanTranscript,
    summary,
    qualification,
    sentiment,
    language,
    keyTopic,
    objections: parsed.objections ?? "",
    purchaseIntent: parsed.purchaseIntent ?? "",
    nextAction: parsed.nextRecommendedAction ?? "",
  });

  return {
    leadId,
    name,
    email: parsed.email?.trim() ?? "",
    phone: parsed.phone?.trim() ?? "",
    company: parsed.company?.trim() ?? "",
    qualification,
    sentiment,
    language,
    requirement: parsed.requirement?.trim() ?? "",
    budget: parsed.budget?.trim() ?? "",
    buyingTimeline: parsed.buyingTimeline?.trim() ?? "",
    objections: parsed.objections?.trim() ?? "",
    purchaseIntent: parsed.purchaseIntent?.trim() ?? "",
    nextRecommendedAction: parsed.nextRecommendedAction?.trim() ?? "",
    summary,
    keyTopic,
    optedOut: Boolean(parsed.optedOut),
  };
}
