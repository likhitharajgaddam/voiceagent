import { useState } from "react";
import { Check, Copy, FileCode2, Terminal } from "lucide-react";
import type { PythonFileEntry } from "../types";

interface PythonCodeViewProps {
  files: PythonFileEntry[];
  loading: boolean;
}

export function PythonCodeView({ files, loading }: PythonCodeViewProps) {
  const [selectedName, setSelectedName] = useState("app.py");
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const activeFile = files.find((f) => f.name === selectedName) ?? files[0] ?? null;

  async function copyContent(name: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedName(name);
      setTimeout(() => setCopiedName(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  }

  return (
    <div className="space-y-6">
      {/* Local Setup Commands */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="h-4 w-4 text-blue-700 dark:text-blue-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Python &amp; Streamlit Setup (macOS / Linux)
          </h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          All Python modules, Sentence-Transformers RAG retrieval, SQLite persistence, and
          project documentation reside in{" "}
          <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            voxlead-ai/
          </code>
          . Configure your{" "}
          <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            GROQ_API_KEY
          </code>{" "}
          inside{" "}
          <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            .env
          </code>
          :
        </p>
        <pre className="p-4 bg-slate-950 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
{`cd voxlead-ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
streamlit run app.py`}
        </pre>
      </section>

      {/* Architecture Flow */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
          Admission Enquiry Architecture (Committed Stack)
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Streamlit · Groq LLM · Groq Whisper STT · gTTS · Sentence Transformers + NumPy · Pandas · SQLite
        </p>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-center text-xs">
          {[
            { title: "1. Student Audio/Text", detail: "Streamlit UI + st.audio_input" },
            { title: "2. Groq Whisper STT", detail: "Audio-to-Text + Language" },
            { title: "3. Embeddings RAG", detail: "Sentence Transformers + NumPy" },
            { title: "4. Groq LLM + Memory", detail: "SQLite Lookup & Grounded Reply" },
            { title: "5. gTTS & Auto-Book", detail: "MP3 Playback & Safe Slots" },
            { title: "6. Pandas & SQLite CRM", detail: "Interest, Sentiment & Insights" },
          ].map((step) => (
            <div
              key={step.title}
              className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col justify-center"
            >
              <div className="font-semibold text-slate-900 dark:text-white">{step.title}</div>
              <div className="text-slate-600 dark:text-slate-400 mt-1">{step.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {/* File Explorer & Code Viewer */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4">
          <div className="flex items-center gap-2 px-2 pb-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <FileCode2 className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            <span>voxlead-ai/ Deliverables</span>
          </div>
          {loading ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
              Loading project files...
            </div>
          ) : (
            <div className="space-y-1">
              {files.map((file) => {
                const isSelected = activeFile?.name === file.name;
                return (
                  <button
                    key={file.name}
                    type="button"
                    onClick={() => setSelectedName(file.name)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-white/70 dark:hover:bg-slate-900/50 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <div className="font-mono text-xs font-medium">{file.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {file.role}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div className="lg:col-span-8 flex flex-col min-w-0">
          {activeFile ? (
            <>
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {activeFile.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {activeFile.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void copyContent(activeFile.name, activeFile.content)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedName === activeFile.name ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy File
                    </>
                  )}
                </button>
              </div>
              <pre className="p-5 bg-slate-950 text-slate-100 text-xs font-mono overflow-auto max-h-[540px] leading-relaxed">
                {activeFile.content}
              </pre>
            </>
          ) : (
            <div className="p-8 text-sm text-slate-500 dark:text-slate-400">
              Select a file to inspect its code.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
