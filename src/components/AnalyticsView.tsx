import type { DashboardPayload } from "../types";

interface AnalyticsViewProps {
  data: DashboardPayload | null;
  loading: boolean;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function AnalyticsView({ data, loading }: AnalyticsViewProps) {
  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  const m = data?.metrics ?? {
    totalCalls: 0,
    completedCalls: 0,
    failedCalls: 0,
    avgDurationSec: 0,
    totalLeads: 0,
    highLeads: 0,
    mediumLeads: 0,
    lowLeads: 0,
    positiveSentiment: 0,
    neutralSentiment: 0,
    negativeSentiment: 0,
    totalAppointments: 0,
    appointmentConversionRate: 0,
  };

  const daily = data?.charts.dailyActivity ?? [];
  const weekly = data?.charts.weeklyTrend ?? [];
  const followUps = data?.followUps ?? [];

  const maxDailyCalls = Math.max(1, ...daily.map((d) => d.calls));
  const maxWeeklyLeads = Math.max(1, ...weekly.map((w) => w.total_leads));

  return (
    <div className="space-y-6">
      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Calls</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {m.totalCalls}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {m.completedCalls} completed · {m.failedCalls} failed
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Avg Call Duration</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {formatDuration(m.avgDurationSec)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Across completed calls
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Student Leads</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {m.totalLeads}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {m.highLeads} High · {m.mediumLeads} Med · {m.lowLeads} Low
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Counselling Booked</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-blue-700 dark:text-blue-400 mt-1">
            {m.totalAppointments}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            AI-scheduled sessions
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Counselling Conversion
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
            {m.appointmentConversionRate}%
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Booked sessions / total leads
          </div>
        </div>
      </div>

      {/* Distribution Breakdown Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Student Interest Breakdown
          </h3>
          <div className="space-y-3 text-xs">
            {[
              { label: "High Interest", count: m.highLeads, color: "bg-emerald-600" },
              { label: "Medium (Evaluating)", count: m.mediumLeads, color: "bg-amber-500" },
              { label: "Low Interest", count: m.lowLeads, color: "bg-slate-400" },
            ].map((row) => {
              const pct = m.totalLeads > 0 ? Math.round((row.count / m.totalLeads) * 100) : 0;
              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>{row.label}</span>
                    <span className="font-mono tabular-nums">
                      {row.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Student Sentiment Distribution
          </h3>
          <div className="space-y-3 text-xs">
            {[
              { label: "Positive", count: m.positiveSentiment, color: "bg-blue-700" },
              { label: "Neutral", count: m.neutralSentiment, color: "bg-slate-500" },
              { label: "Negative", count: m.negativeSentiment, color: "bg-red-600" },
            ].map((row) => {
              const pct = m.totalLeads > 0 ? Math.round((row.count / m.totalLeads) * 100) : 0;
              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between text-slate-700 dark:text-slate-300">
                    <span>{row.label}</span>
                    <span className="font-mono tabular-nums">
                      {row.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${row.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Real SQL Charts: Daily Call Activity & Weekly Lead Conversion Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Daily Call Activity (Last 14 Days)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Real SQL call logs grouped by date
          </p>
          {daily.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No call activity recorded yet. Complete a live call to populate chart data.
            </div>
          ) : (
            <div className="flex items-end gap-3 h-40 pt-4">
              {daily.map((d) => {
                const heightPct = Math.max(8, Math.round((d.calls / maxDailyCalls) * 100));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {d.calls}
                    </span>
                    <div className="w-full max-w-[36px] bg-slate-100 dark:bg-slate-800 rounded-t-md h-28 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-blue-700 dark:bg-blue-500 rounded-t-md"
                        style={{ height: `${heightPct}%` }}
                        title={`${d.day}: ${d.calls} total, ${d.completed} completed`}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-full">
                      {d.day.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Weekly Lead Conversion Trend
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Total leads vs. High-intent qualified leads per week
          </p>
          {weekly.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No weekly lead trends available yet.
            </div>
          ) : (
            <div className="space-y-3">
              {weekly.map((w) => {
                const totalPct = Math.round((w.total_leads / maxWeeklyLeads) * 100);
                const highPct = Math.round((w.high_leads / maxWeeklyLeads) * 100);
                return (
                  <div key={w.week} className="space-y-1 text-xs">
                    <div className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span className="font-mono">{w.week}</span>
                      <span className="font-mono tabular-nums">
                        {w.high_leads} High / {w.total_leads} Total
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-slate-300 dark:bg-slate-600"
                        style={{ width: `${totalPct}%` }}
                      />
                      <div
                        className="h-full bg-emerald-600 absolute top-0 left-0"
                        style={{ width: `${highPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Follow-Up Recommendations */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            AI Follow-Up Recommendations
          </h3>
        </div>
        {followUps.length === 0 ? (
          <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
            No follow-up actions pending yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {followUps.map((f) => (
              <div
                key={f.id}
                className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    {f.name} {f.company ? `· ${f.company}` : ""}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    {f.next_recommended_action}
                  </div>
                </div>
                <div className="flex items-center gap-3 font-mono text-slate-500 dark:text-slate-400 shrink-0">
                  <span>{f.qualification}</span>
                  <span>·</span>
                  <span>{f.sentiment}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
