import React, { useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { DashboardPayload } from "../types";

interface CalendarViewProps {
  data: DashboardPayload | null;
  onUpdated: () => void;
}

const DEFAULT_SLOTS = ["10:00 AM", "11:30 AM", "2:00 PM", "4:00 PM", "5:30 PM"];

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function CalendarView({ data, onUpdated }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [availableSlots, setAvailableSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const appointments = data?.appointments ?? [];

  async function loadSlots(dateStr: string) {
    setSlotsLoading(true);
    try {
      const res = await fetch(`/api/appointments/slots?date=${encodeURIComponent(dateStr)}`);
      const payload = (await res.json()) as { availableSlots?: string[] };
      setAvailableSlots(payload.availableSlots ?? []);
    } catch {
      // Non-blocking
    } finally {
      setSlotsLoading(false);
    }
  }

  useEffect(() => {
    void loadSlots(selectedDate);
  }, [selectedDate, appointments.length]);

  async function updateStatus(id: number, status: "Completed" | "Cancelled") {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        onUpdated();
        void loadSlots(selectedDate);
      }
    } catch {
      // Ignore
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Read-Only Counselling Slot Availability */}
      <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Counselling Slot Availability
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Appointments are booked autonomously by VoxLead AI during live student enquiry calls.
            Duplicate slot bookings are prevented automatically in SQLite.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Inspect Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3.5 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Counselling Slots
            </span>
            <span className="font-mono text-slate-500 dark:text-slate-400">
              {slotsLoading ? "Checking..." : `${availableSlots.length} of ${DEFAULT_SLOTS.length} open`}
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {DEFAULT_SLOTS.map((slot) => {
              const isOpen = availableSlots.includes(slot);
              return (
                <div
                  key={slot}
                  className="px-4 py-2.5 flex items-center justify-between text-xs bg-white dark:bg-slate-950"
                >
                  <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                    {slot}
                  </span>
                  <span
                    className={
                      isOpen
                        ? "font-medium text-emerald-700 dark:text-emerald-400"
                        : "font-medium text-slate-400 dark:text-slate-500 line-through"
                    }
                  >
                    {isOpen ? "Available for AI Booking" : "Booked"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Right: AI-Booked Counselling Appointments List */}
      <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              AI-Booked Counselling Appointments
            </h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {appointments.length} total
          </span>
        </div>

        {appointments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No counselling appointments booked yet. Start a live voice call and ask VoxLead AI to
            schedule a counselling session.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {appointments.map((appt) => (
              <div
                key={appt.id}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-white text-sm">
                    {appt.customer_name}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">{appt.topic}</div>
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 font-mono">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {appt.demo_date} · {appt.demo_time}
                    </span>
                    {appt.customer_email && <span>{appt.customer_email}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`font-medium mr-2 ${
                      appt.status === "Scheduled"
                        ? "text-blue-700 dark:text-blue-400"
                        : appt.status === "Completed"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {appt.status}
                  </span>

                  {appt.status === "Scheduled" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void updateStatus(appt.id, "Completed")}
                        title="Mark completed"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Complete
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateStatus(appt.id, "Cancelled")}
                        title="Cancel appointment"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
