import { Link } from "react-router";
import { CalendarClock, FileText } from "lucide-react";

import { formatLongDate } from "../../../utils/formatters";

const ACTIVE_STATES = new Set(["pending", "rescheduled", "no_show"]);

function scheduleLabel(task) {
  const date = formatLongDate(task.dueDate, "Not recorded");
  return task.dueTime ? `${date} · ${task.dueTime}` : date;
}

function stateLabel(value) {
  return String(value || "pending")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function recordLabel(record) {
  return record.visitType === "follow_up_visit"
    ? "Follow-up Visit"
    : "Initial Consultation";
}

export default function FollowUpEpisodePanel({ episode }) {
  const records = Array.isArray(episode?.records) ? episode.records : [];
  const tasks = Array.isArray(episode?.tasks) ? episode.tasks : [];

  if (!episode?.originalRecord && records.length === 0 && tasks.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <CalendarClock size={18} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-slate-900">Care & Follow-up</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Explicit consultation chain and scheduled return visits.
          </p>
        </div>
      </header>

      <div className="space-y-5 p-5">
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Visit chain
          </h3>
          <ol className="mt-3 space-y-2">
            {records.map((record, index) => (
              <li
                key={record.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-[#B91C1C] shadow-sm">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      Record #{record.id} · {recordLabel(record)}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {formatLongDate(record.dateRecorded, "Date not recorded")}
                      {record.diagnosis ? ` · ${record.diagnosis}` : ""}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/bhc/health-records/${record.id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#B91C1C] hover:underline"
                >
                  <FileText size={13} />
                  View record
                </Link>
              </li>
            ))}
          </ol>
        </div>

        {tasks.length > 0 && (
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Follow-up schedules
            </h3>
            <div className="mt-3 space-y-3">
              {tasks.map((task) => {
                const active = ACTIVE_STATES.has(task.state);
                return (
                  <article
                    key={task.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <dl className="grid flex-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <EpisodeDetail
                          label="Source"
                          value={`Record #${task.healthRecordId}`}
                        />
                        <EpisodeDetail
                          label="Schedule"
                          value={scheduleLabel(task)}
                        />
                        <EpisodeDetail
                          label="Reason"
                          value={task.reason || "Not recorded"}
                        />
                        <EpisodeDetail
                          label="Status"
                          value={stateLabel(task.state)}
                        />
                      </dl>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`/bhc/follow-ups/${task.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          View Follow-up Details
                        </Link>
                        {active && (
                          <>
                            <Link
                              to={`/bhc/health-records/add?mode=followup&followUpId=${task.id}&patientId=${task.patientId}&recordId=${task.healthRecordId}`}
                              className="rounded-lg bg-[#B91C1C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#991B1B]"
                            >
                              Record Visit
                            </Link>
                            <Link
                              to={`/bhc/follow-ups?task=${task.id}&open=reschedule`}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Reschedule
                            </Link>
                            <Link
                              to={`/bhc/follow-ups?task=${task.id}&open=cancel`}
                              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-[#B91C1C] hover:bg-red-50"
                            >
                              Cancel
                            </Link>
                          </>
                        )}
                        {task.state === "fulfilled" &&
                          task.fulfilledByHealthRecordId && (
                            <Link
                              to={`/bhc/health-records/${task.fulfilledByHealthRecordId}`}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              View Health Record
                            </Link>
                          )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function EpisodeDetail({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-slate-700">{value}</dd>
    </div>
  );
}
