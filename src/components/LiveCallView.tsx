import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarCheck,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
  VolumeX,
} from "lucide-react";
import type { CallStatus, LeadRecord } from "../types";

interface TranscriptEntry {
  id: string;
  speaker: "Student" | "VoxLead AI" | "System";
  text: string;
  timestamp: string;
}

interface LiveCallViewProps {
  onCallDataUpdated: () => void;
}

function encodePcm16ToBase64(float32: Float32Array): string {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64Pcm16ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(new ArrayBuffer(pcm.length * 4));
  for (let i = 0; i < pcm.length; i++) {
    float32[i] = pcm[i] / 32768;
  }
  return float32;
}

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export function LiveCallView({ onCallDataUpdated }: LiveCallViewProps) {
  const [languageHint, setLanguageHint] = useState<"auto" | "en" | "hi" | "te">("auto");
  const [callStatus, setCallStatus] = useState<CallStatus>("Idle");
  const [isEnding, setIsEnding] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [liveLead, setLiveLead] = useState<Partial<LeadRecord> | null>(null);
  const [liveBooking, setLiveBooking] = useState<{
    demoDate: string;
    demoTime: string;
    customerName: string;
    topic?: string;
    ok?: boolean;
    error?: string;
  } | null>(null);
  const [postCallSummary, setPostCallSummary] = useState<{
    summary: string;
    qualification: string;
    sentiment: string;
    nextRecommendedAction: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef(false);
  const isEndingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const endTimeoutRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    return () => {
      cleanupCallResources();
    };
  }, []);

  function stopPlaybackQueue() {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Ignore already stopped nodes
      }
    }
    activeSourcesRef.current.clear();
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }

  function stopAudioCaptureAndPlayback() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopPlaybackQueue();

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      void inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    setAudioLevel(0);
  }

  function playPcmChunk(base64Audio: string) {
    if (isEndingRef.current) return;
    const ctx = outputAudioCtxRef.current;
    if (!ctx) return;

    const float32 = decodeBase64Pcm16ToFloat32(base64Audio);
    if (float32.length === 0) return;

    let sumSq = 0;
    for (let i = 0; i < float32.length; i += 8) {
      sumSq += float32[i] * float32[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, Math.floor(float32.length / 8)));
    setAudioLevel(Math.min(100, Math.round(rms * 280)));

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.015, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  }

  function appendTranscript(speaker: "Student" | "VoxLead AI" | "System", text: string) {
    const clean = text;
    if (!clean) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker && speaker !== "System") {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          text: `${last.text}${clean.startsWith(" ") ? "" : " "}${clean}`.trim(),
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          speaker,
          text: clean.trim(),
          timestamp: now,
        },
      ];
    });
  }

  function cleanupCallResources() {
    if (endTimeoutRef.current !== null) {
      window.clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
    stopAudioCaptureAndPlayback();

    if (outputAudioCtxRef.current) {
      void outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore
      }
      wsRef.current = null;
    }
  }

  async function startLiveCall() {
    if (
      callStatus === "Connecting" ||
      callStatus === "Listening" ||
      callStatus === "Speaking" ||
      callStatus === "Thinking"
    ) {
      return;
    }

    setIsEnding(false);
    isEndingRef.current = false;
    setErrorMessage(null);
    setPostCallSummary(null);
    setLiveLead(null);
    setLiveBooking(null);
    setTranscript([]);
    setDurationSec(0);
    setCallStatus("Connecting");

    const sessionId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      let micStream: MediaStream | null = null;
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          streamRef.current = micStream;
        } catch {
          setErrorMessage(
            "Microphone permission denied or unavailable. Connected in text-assisted live call mode."
          );
        }
      }

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      if (inputCtx.state === "suspended") await inputCtx.resume();
      if (outputCtx.state === "suspended") await outputCtx.resume();
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/live?sessionId=${encodeURIComponent(sessionId)}&lang=${encodeURIComponent(languageHint)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        timerRef.current = window.setInterval(() => {
          setDurationSec((s) => s + 1);
        }, 1000);

        if (micStream) {
          const source = inputCtx.createMediaStreamSource(micStream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (isMutedRef.current || isEndingRef.current || ws.readyState !== WebSocket.OPEN) {
              return;
            }
            const channelData = e.inputBuffer.getChannelData(0);

            let sum = 0;
            for (let i = 0; i < channelData.length; i += 8) {
              sum += channelData[i] * channelData[i];
            }
            const rms = Math.sqrt(sum / Math.max(1, Math.floor(channelData.length / 8)));
            if (activeSourcesRef.current.size === 0) {
              setAudioLevel(Math.min(100, Math.round(rms * 350)));
            }

            const base64 = encodePcm16ToBase64(channelData);
            ws.send(JSON.stringify({ type: "audio", audio: base64 }));
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);
        }
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as {
          type?: string;
          status?: CallStatus;
          audio?: string;
          text?: string;
          tool?: string;
          data?: unknown;
          error?: string;
          summary?: {
            summary: string;
            qualification: string;
            sentiment: string;
            nextRecommendedAction: string;
          } | null;
        };

        if (isEndingRef.current && msg.type !== "callEnded" && msg.type !== "error") {
          return;
        }

        if (msg.type === "status" && msg.status) {
          setCallStatus(msg.status);
          if (msg.error) setErrorMessage(msg.error);
        } else if (msg.type === "audio" && msg.audio) {
          playPcmChunk(msg.audio);
        } else if (msg.type === "interrupted") {
          stopPlaybackQueue();
          setCallStatus("Listening");
          appendTranscript("System", "Student interrupted AI response.");
        } else if (msg.type === "inputTranscript" && msg.text) {
          appendTranscript("Student", msg.text);
        } else if (msg.type === "outputTranscript" && msg.text) {
          appendTranscript("VoxLead AI", msg.text);
        } else if (msg.type === "turnComplete") {
          setCallStatus("Listening");
        } else if (msg.type === "toolEvent") {
          if (msg.tool === "updateCrmLead" && msg.data) {
            setLiveLead(msg.data as Partial<LeadRecord>);
            onCallDataUpdated();
          } else if (msg.tool === "bookDemoAppointment" && msg.data) {
            setLiveBooking(
              msg.data as {
                demoDate: string;
                demoTime: string;
                customerName: string;
                topic?: string;
                ok?: boolean;
                error?: string;
              }
            );
            onCallDataUpdated();
          } else if (msg.tool === "markOptOut") {
            appendTranscript("System", "Student opted out — CRM flagged Do-Not-Call.");
            onCallDataUpdated();
          }
        } else if (msg.type === "callEnded") {
          setIsEnding(false);
          isEndingRef.current = false;
          if (msg.summary) {
            setPostCallSummary(msg.summary);
          }
          setCallStatus(msg.status ?? "Completed");
          cleanupCallResources();
          onCallDataUpdated();
        } else if (msg.type === "error" && msg.error) {
          setErrorMessage(msg.error);
        }
      };

      ws.onerror = () => {
        setIsEnding(false);
        isEndingRef.current = false;
        setErrorMessage("Live WebSocket voice connection failed.");
        setCallStatus("Failed");
        cleanupCallResources();
      };

      ws.onclose = () => {
        setIsEnding(false);
        isEndingRef.current = false;
        setCallStatus((prev) =>
          prev === "Connecting" || prev === "Listening" || prev === "Thinking" || prev === "Speaking"
            ? "Completed"
            : prev
        );
        cleanupCallResources();
        onCallDataUpdated();
      };
    } catch (err) {
      setIsEnding(false);
      isEndingRef.current = false;
      setErrorMessage(err instanceof Error ? err.message : "Failed to initialize live voice call.");
      setCallStatus("Failed");
      cleanupCallResources();
    }
  }

  function endLiveCall() {
    if (isEndingRef.current) return;

    setIsEnding(true);
    isEndingRef.current = true;
    stopAudioCaptureAndPlayback();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
      endTimeoutRef.current = window.setTimeout(() => {
        setIsEnding(false);
        isEndingRef.current = false;
        setCallStatus("Completed");
        cleanupCallResources();
        onCallDataUpdated();
      }, 5000);
    } else {
      setIsEnding(false);
      isEndingRef.current = false;
      setCallStatus("Completed");
      cleanupCallResources();
      onCallDataUpdated();
    }
  }

  function sendLiveText(e: React.FormEvent) {
    e.preventDefault();
    const clean = textInput.trim();
    if (!clean || isEndingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    stopPlaybackQueue();
    appendTranscript("Student", clean);
    wsRef.current.send(JSON.stringify({ type: "text", text: clean }));
    setTextInput("");
  }

  const isCallActive =
    callStatus === "Connecting" ||
    callStatus === "Listening" ||
    callStatus === "Thinking" ||
    callStatus === "Speaking";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Browser Real-Time WebSocket Voice Calling (16kHz PCM In / 24kHz PCM Out)
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <span>Language:</span>
          <select
            value={languageHint}
            disabled={isCallActive}
            onChange={(e) => setLanguageHint(e.target.value as "auto" | "en" | "hi" | "te")}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
          >
            <option value="auto">Auto-Detect (EN / HI / TE)</option>
            <option value="en">English</option>
            <option value="hi">Hindi (हिन्दी)</option>
            <option value="te">Telugu (తెలుగు)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Real-Time Call Console + Live Transcript */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Real-Time Admission Voice Session
              </div>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span
                className={`text-xs font-medium ${
                  callStatus === "Failed"
                    ? "text-red-600 dark:text-red-400"
                    : callStatus === "Speaking" || callStatus === "Listening"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : callStatus === "Thinking" || callStatus === "Connecting"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                Status: {isEnding ? "Ending..." : callStatus}
              </span>
            </div>
            <div className="font-mono tabular-nums text-sm font-medium text-slate-900 dark:text-slate-100">
              {formatDuration(durationSec)}
            </div>
          </div>

          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {!isCallActive ? (
                <button
                  type="button"
                  onClick={() => void startLiveCall()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PhoneCall className="h-4 w-4" />
                  Start Live AI Call
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isEnding}
                    onClick={() => setIsMuted((m) => !m)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
                      isMuted
                        ? "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isMuted ? "Unmute" : "Mute"}
                  </button>

                  <button
                    type="button"
                    disabled={isEnding}
                    onClick={stopPlaybackQueue}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <VolumeX className="h-4 w-4" />
                    Interrupt Speech
                  </button>

                  <button
                    type="button"
                    disabled={isEnding}
                    onClick={endLiveCall}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    <PhoneOff className="h-4 w-4" />
                    {isEnding ? "Ending Call..." : "End Call"}
                  </button>
                </>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Live Audio Signal (16kHz In / 24kHz Out)</span>
                <span className="font-mono tabular-nums">{audioLevel}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-700 dark:bg-blue-500 transition-all duration-75"
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
            </div>
          </div>

          <div className="p-6 space-y-3 min-h-[320px] max-h-[380px] overflow-y-auto">
            {transcript.length === 0 ? (
              <div className="h-full py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Click <strong className="text-slate-800 dark:text-slate-200">Start Live AI Call</strong>{" "}
                and ask about Python Full Stack Development, fees, batch schedules, or book a
                1-on-1 counselling session in English, Hindi, or Telugu.
              </div>
            ) : (
              transcript.map((item) => (
                <div
                  key={item.id}
                  className={`flex flex-col ${
                    item.speaker === "Student"
                      ? "items-end"
                      : item.speaker === "System"
                      ? "items-center"
                      : "items-start"
                  }`}
                >
                  {item.speaker === "System" ? (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 py-1">
                      {item.text} · <span className="font-mono">{item.timestamp}</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        {item.speaker} · <span className="font-mono">{item.timestamp}</span>
                      </div>
                      <div
                        className={`max-w-[85%] px-4 py-2.5 rounded-lg text-sm leading-relaxed ${
                          item.speaker === "Student"
                            ? "bg-blue-700 text-white"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                        }`}
                      >
                        {item.text}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {errorMessage && (
            <div className="px-6 py-3 border-t border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form
            onSubmit={sendLiveText}
            className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={textInput}
              disabled={!isCallActive || isEnding}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={
                isCallActive
                  ? "Ask about Python Full Stack, fees, batches, or request counselling..."
                  : "Start a live call to speak or type..."
              }
              className="flex-1 px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isCallActive || isEnding || !textInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </form>
        </section>

        {/* Right: Live Student Profile & Autonomous Booking */}
        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Live Student Profile & CRM Sync
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Populated automatically during the admission enquiry call
              </p>
            </div>

            {!liveLead && !postCallSummary ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Student name, background, course interest, preferred batch schedule, interest level
                (High / Medium / Low), and sentiment update here automatically as the call progresses.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <div className="text-slate-500 dark:text-slate-400">Interest Level</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                      {postCallSummary?.qualification || liveLead?.qualification || "Medium"}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <div className="text-slate-500 dark:text-slate-400">Sentiment</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                      {postCallSummary?.sentiment || liveLead?.sentiment || "Neutral"}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <div className="text-slate-500 dark:text-slate-400">Language</div>
                    <div className="text-sm font-semibold font-mono uppercase text-slate-900 dark:text-white mt-0.5">
                      {liveLead?.language || "en"}
                    </div>
                  </div>
                </div>

                {liveLead && (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {[
                      ["Student", liveLead.name || "Prospect"],
                      ["Background", liveLead.company || "—"],
                      ["Email", liveLead.email || "—"],
                      ["Phone", liveLead.phone || "—"],
                      ["Course Interest", liveLead.requirement || "—"],
                      ["Fee Preference", liveLead.budget || "—"],
                      ["Schedule / Timeline", liveLead.buying_timeline || "—"],
                    ].map(([label, val]) => (
                      <div key={label} className="py-2 flex justify-between gap-4">
                        <span className="text-slate-500 dark:text-slate-400">{label}</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100 text-right">
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {postCallSummary && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      Post-Call Counselling Summary
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {postCallSummary.summary}
                    </p>
                    {postCallSummary.nextRecommendedAction && (
                      <p className="text-blue-700 dark:text-blue-400 font-medium">
                        Next Step: {postCallSummary.nextRecommendedAction}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {liveBooking && (
              <div
                className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                  liveBooking.ok === false
                    ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                    : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  <CalendarCheck className="h-4 w-4 shrink-0" />
                  <span>
                    {liveBooking.ok === false
                      ? "Slot Conflict Detected"
                      : "Counselling Appointment Saved"}
                  </span>
                </div>
                <div className="font-mono tabular-nums">
                  {liveBooking.demoDate} · {liveBooking.demoTime} · {liveBooking.customerName}
                </div>
                {liveBooking.error && <div>{liveBooking.error}</div>}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
