import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Code2,
  Menu,
  Moon,
  PhoneCall,
  RefreshCw,
  Sun,
  Users,
  X,
} from "lucide-react";
import { LiveCallView } from "./components/LiveCallView";
import { AnalyticsView } from "./components/AnalyticsView";
import { CrmView } from "./components/CrmView";
import { CalendarView } from "./components/CalendarView";
import { PythonCodeView } from "./components/PythonCodeView";
import type { DashboardPayload, PythonFileEntry } from "./types";

type NavView = "live" | "analytics" | "crm" | "calendar" | "python";

const NAV_ITEMS: Array<{
  id: NavView;
  label: string;
  subtitle: string;
  icon: typeof PhoneCall;
}> = [
  {
    id: "live",
    label: "Live Call Studio",
    subtitle: "Real-time AI admission counselling call via WebSocket with voice activity and interruption handling.",
    icon: PhoneCall,
  },
  {
    id: "analytics",
    label: "Analytics & Insights",
    subtitle: "Live SQLite KPIs, student interest distribution, sentiment metrics, call charts & follow-up actions.",
    icon: BarChart3,
  },
  {
    id: "crm",
    label: "Leads & Call History",
    subtitle: "Student enquiry pipeline, interest filters, call logs, AI summaries, full transcripts & opt-out controls.",
    icon: Users,
  },
  {
    id: "calendar",
    label: "Appointments",
    subtitle: "AI-booked 1-on-1 counselling sessions, open slot inspection, and staff status updates.",
    icon: CalendarDays,
  },
  {
    id: "python",
    label: "Python & Streamlit Code",
    subtitle: "Streamlit admission assistant, Groq Whisper STT, Sentence-Transformers + NumPy RAG, SQLite & docs.",
    icon: Code2,
  },
];

export default function App() {
  const [activeView, setActiveView] = useState<NavView>("live");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem("voxlead_theme") === "dark";
    } catch {
      return false;
    }
  });

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [pythonFiles, setPythonFiles] = useState<PythonFileEntry[]>([]);
  const [pythonLoading, setPythonLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("voxlead_theme", isDark ? "dark" : "light");
    } catch {
      // Ignore storage restrictions
    }
  }, [isDark]);

  const fetchDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const res = await fetch("/api/dashboard");
      const payload = (await res.json()) as DashboardPayload & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to load dashboard.");
      }
      setDashboard(payload);
      setGlobalError(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const fetchPythonFiles = useCallback(async () => {
    setPythonLoading(true);
    try {
      const res = await fetch("/api/python-files");
      const payload = (await res.json()) as { files?: PythonFileEntry[] };
      if (res.ok) {
        setPythonFiles(payload.files ?? []);
      }
    } catch {
      // Non-blocking
    } finally {
      setPythonLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
    void fetchPythonFiles();
  }, [fetchDashboard, fetchPythonFiles]);

  const activeMeta = NAV_ITEMS.find((n) => n.id === activeView) ?? NAV_ITEMS[0];

  function selectView(id: NavView) {
    setActiveView(id);
    setMobileNavOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="h-16 px-6 flex items-center border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white">
              VoxLead AI
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Admission & Lead Management
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectView(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-blue-700 text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Student Leads</span>
            <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {dashboard?.metrics.totalLeads ?? 0}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Counselling Booked</span>
            <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {dashboard?.metrics.totalAppointments ?? 0}
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-50">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="font-display text-base font-bold text-slate-900 dark:text-white">
                  VoxLead AI
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Admission & Lead Management
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectView(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? "bg-blue-700 text-white"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                VoxLead Career & Tech Academy / Admission Counselling
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {activeMeta.label}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void fetchDashboard()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync
            </button>

            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label="Toggle color theme"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {isDark ? "Light" : "Dark"}
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {activeMeta.label}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {activeMeta.subtitle}
            </p>
          </div>

          {globalError && (
            <div className="mb-6 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
              {globalError}
            </div>
          )}

          {activeView === "live" && (
            <LiveCallView onCallDataUpdated={() => void fetchDashboard()} />
          )}

          {activeView === "analytics" && (
            <AnalyticsView data={dashboard} loading={dashboardLoading} />
          )}

          {activeView === "crm" && (
            <CrmView data={dashboard} onUpdated={() => void fetchDashboard()} />
          )}

          {activeView === "calendar" && (
            <CalendarView data={dashboard} onUpdated={() => void fetchDashboard()} />
          )}

          {activeView === "python" && (
            <PythonCodeView files={pythonFiles} loading={pythonLoading} />
          )}
        </main>
      </div>
    </div>
  );
}
