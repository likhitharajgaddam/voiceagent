import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, ShieldOff, ShieldCheck } from "lucide-react";
import type { DashboardPayload, LeadQualification, LeadRecord } from "../types";

interface CrmViewProps {
  data: DashboardPayload | null;
  onUpdated: () => void;
}

export function CrmView({ data, onUpdated }: CrmViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [qualFilter, setQualFilter] = useState<"All" | LeadQualification>("All");
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [expandedConvoId, setExpandedConvoId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leads = data?.leads ?? [];
  const calls = data?.calls ?? [];
  const conversations = data?.conversations ?? [];

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (qualFilter !== "All" && lead.qualification !== qualFilter) {
        return false;
      }
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        lead.company.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        lead.requirement.toLowerCase().includes(q)
      );
    });
  }, [leads, qualFilter, searchQuery]);

  const activeLead: LeadRecord | null =
    filteredLeads.find((l) => l.id === selectedLeadId) ?? filteredLeads[0] ?? null;

  async function updateLead(
    leadId: number,
    patch: { qualification?: LeadQualification; optedOut?: boolean; nextRecommendedAction?: string }
  ) {
    setSavingId(leadId);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update lead.");
      }
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lead.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student leads by name, background, email, phone, course..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
          {(["All", "High", "Medium", "Low"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setQualFilter(level)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                qualFilter === level
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Leads Master Table + Lead Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Student Admission Leads
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {filteredLeads.length} records
            </span>
          </div>

          {filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No student leads match this filter yet. Start a live voice call to capture and qualify student enquiries automatically.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-3 px-4 font-medium">Student</th>
                    <th className="py-3 px-4 font-medium">Interest</th>
                    <th className="py-3 px-4 font-medium">Sentiment</th>
                    <th className="py-3 px-4 font-medium">Lang</th>
                    <th className="py-3 px-4 font-medium">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredLeads.map((lead) => {
                    const isSelected = activeLead?.id === lead.id;
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-blue-50/70 dark:bg-blue-950/30"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {lead.name}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                            {lead.requirement || lead.company || lead.email || lead.phone || "No details yet"}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium">
                          <span
                            className={
                              lead.qualification === "High"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : lead.qualification === "Medium"
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-slate-500 dark:text-slate-400"
                            }
                          >
                            {lead.qualification}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          {lead.sentiment}
                        </td>
                        <td className="py-3 px-4 font-mono uppercase text-slate-600 dark:text-slate-400">
                          {lead.language || "en"}
                        </td>
                        <td className="py-3 px-4">
                          {lead.opted_out ? (
                            <span className="text-red-600 dark:text-red-400 font-medium">
                              Opted Out
                            </span>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-400">Active</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Lead Detail Inspector */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          {!activeLead ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Select a student lead from the table to inspect course interest, questions, next steps, and opt-out controls.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {activeLead.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeLead.company || "Prospective Student"} · Updated{" "}
                    <span className="font-mono">{activeLead.updated_at}</span>
                  </p>
                </div>

                <select
                  aria-label="Interest level"
                  value={activeLead.qualification}
                  disabled={savingId === activeLead.id}
                  onChange={(e) =>
                    void updateLead(activeLead.id, {
                      qualification: e.target.value as LeadQualification,
                    })
                  }
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {[
                  ["Email", activeLead.email || "—"],
                  ["Phone", activeLead.phone || "—"],
                  ["Course Interest", activeLead.requirement || "—"],
                  ["Fee Preference", activeLead.budget || "—"],
                  ["Preferred Schedule", activeLead.buying_timeline || "—"],
                  ["Questions / Objections", activeLead.objections || "None recorded"],
                  ["Admission Intent", activeLead.purchase_intent || "—"],
                  ["Recommended Next Step", activeLead.next_recommended_action || "—"],
                  ["Consent Recorded", activeLead.consent_recorded ? "Yes" : "Browser / Pending"],
                ].map(([label, val]) => (
                  <div key={label} className="py-2.5 flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
                    <span className="text-slate-900 dark:text-slate-100 text-right font-medium">
                      {val}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={savingId === activeLead.id}
                  onClick={() =>
                    void updateLead(activeLead.id, {
                      optedOut: !activeLead.opted_out,
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    activeLead.opted_out
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                      : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300"
                  }`}
                >
                  {activeLead.opted_out ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Restore Contact Permission
                    </>
                  ) : (
                    <>
                      <ShieldOff className="h-3.5 w-3.5" />
                      Mark Do-Not-Call (Opt Out)
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Call Logs & Post-Call Summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Recent Call Sessions
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {calls.length}
            </span>
          </div>
          {calls.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
              No voice calls logged yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[420px] overflow-y-auto">
              {calls.map((c) => (
                <div key={c.id} className="px-6 py-3.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {c.lead_name || c.phone_number || c.session_id}
                    </span>
                    <span
                      className={`font-medium ${
                        c.status === "Completed"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : c.status === "Failed"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 font-mono">
                    <span>
                      {c.call_mode} · {c.direction} · {c.language.toUpperCase()}
                    </span>
                    <span>{c.duration_sec}s</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              AI Call Summaries & Transcripts
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {conversations.length}
            </span>
          </div>

          {conversations.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
              Call summaries appear automatically after each completed call.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {conversations.map((conv) => {
                const isOpen = expandedConvoId === conv.id;
                return (
                  <div key={conv.id} className="p-5 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {conv.customer_name} ·{" "}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {conv.key_topic || "Sales Discovery"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-slate-500 dark:text-slate-400">
                        <span>{conv.lead_status}</span>
                        <span>·</span>
                        <span>{conv.sentiment}</span>
                        <span>·</span>
                        <span className="uppercase">{conv.language}</span>
                      </div>
                    </div>

                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      {conv.summary}
                    </p>

                    {conv.next_action && (
                      <div className="text-blue-700 dark:text-blue-400 font-medium">
                        Next Action: {conv.next_action}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedConvoId(isOpen ? null : conv.id)}
                      className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white pt-1 cursor-pointer"
                    >
                      {isOpen ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          Hide Full Transcript
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          View Full Transcript
                        </>
                      )}
                    </button>

                    {isOpen && (
                      <pre className="mt-2 p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {conv.transcript || "No transcript stored."}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
