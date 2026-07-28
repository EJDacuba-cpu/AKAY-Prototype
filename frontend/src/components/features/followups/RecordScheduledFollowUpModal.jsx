import { useEffect, useState } from "react";
import { CalendarClock, Search, UserRound, X } from "lucide-react";

import { getPatientDetailsListByRole } from "../../../services/patientService";
import { getFollowUpTasks } from "../../../services/followUpTaskService";
import { formatDate } from "./followUpStatusStyles.jsx";

function patientName(patient = {}) {
  return (
    patient.name ||
    [patient.firstName, patient.middleName, patient.lastName]
      .filter(Boolean)
      .join(" ") ||
    "Unnamed patient"
  );
}

function patientMeta(patient = {}) {
  const id = patient.patientId || patient.id;
  const ageSex =
    patient.ageSex ||
    [patient.age ? `${patient.age} yrs` : "", patient.sex]
      .filter(Boolean)
      .join(" / ");
  return [
    id ? `Patient ID ${id}` : "",
    ageSex,
    patient.barangay || patient.patientBarangay,
  ]
    .filter(Boolean)
    .join(" · ");
}

function serviceLabel(task = {}) {
  return (
    task.healthRecord?.category ||
    task.healthRecord?.patientClassification ||
    task.category ||
    "General Consultation"
  );
}

export default function RecordScheduledFollowUpModal({
  open,
  onClose,
  onRecord,
}) {
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [searching, setSearching] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    if (!search.trim()) {
      setPatients([]);
      setSearching(false);
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const result = await getPatientDetailsListByRole("bhc", {
          search: search.trim(),
          per_page: 10,
        });
        if (active) setPatients(result || []);
      } catch (requestError) {
        if (active) {
          setPatients([]);
          setError(requestError?.message || "Unable to search patients.");
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, search]);

  useEffect(() => {
    if (open) return;
    setSearch("");
    setPatients([]);
    setSelectedPatient(null);
    setTasks([]);
    setError("");
  }, [open]);

  if (!open) return null;

  async function selectPatient(patient) {
    setSelectedPatient(patient);
    setTasks([]);
    setTasksLoading(true);
    setError("");
    try {
      setTasks(
        await getFollowUpTasks({
          patient_id: patient.id,
          active: 1,
        }),
      );
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Unable to check this patient's active follow-ups.",
      );
    } finally {
      setTasksLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <section
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-scheduled-follow-up-title"
      >
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
              <CalendarClock size={20} />
            </span>
            <div>
              <h2
                id="record-scheduled-follow-up-title"
                className="text-base font-bold text-slate-900"
              >
                Schedule Follow-up
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Search a patient to find and record an active automated
                follow-up.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
          >
            <X size={17} />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              autoFocus
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedPatient(null);
                setTasks([]);
              }}
              placeholder="Search name, Patient ID, PhilHealth, contact, or barangay"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white focus:ring-2 focus:ring-red-50"
            />
          </div>

          {!selectedPatient && search.trim() && (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {searching ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  Searching patients...
                </p>
              ) : patients.length > 0 ? (
                patients.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => selectPatient(patient)}
                    className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-red-50/40"
                  >
                    <UserRound
                      size={17}
                      className="mt-0.5 shrink-0 text-[#B91C1C]"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900">
                        {patientName(patient)}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {patientMeta(patient)}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  No matching patients found.
                </p>
              )}
            </div>
          )}

          {selectedPatient && (
            <div>
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                <p className="font-semibold text-blue-950">
                  {patientName(selectedPatient)}
                </p>
                <p className="mt-1 text-xs text-blue-700">
                  {patientMeta(selectedPatient)}
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {tasksLoading ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Checking active follow-ups...
                  </p>
                ) : tasks.length > 0 ? (
                  <>
                    <p className="text-xs font-semibold text-slate-600">
                      {tasks.length === 1
                        ? "1 active automated follow-up found"
                        : `${tasks.length} active automated follow-ups found`}
                    </p>
                    {tasks.map((task) => (
                      <article
                        key={task.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                          <dl className="grid flex-1 gap-3 text-sm sm:grid-cols-2">
                            <TaskDetail
                              label="Service"
                              value={serviceLabel(task)}
                            />
                            <TaskDetail
                              label="Scheduled"
                              value={`${formatDate(task.dueDate)}${
                                task.dueTime ? ` · ${task.dueTime}` : ""
                              }`}
                            />
                            <TaskDetail
                              label="Reason"
                              value={task.reason || "Not recorded"}
                            />
                            <TaskDetail
                              label="Linked Record"
                              value={`Record #${task.healthRecordId}`}
                            />
                          </dl>
                          <button
                            type="button"
                            onClick={() => onRecord(task)}
                            className="shrink-0 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#991B1B]"
                          >
                            Record Visit
                          </button>
                        </div>
                      </article>
                    ))}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-slate-700">
                      No active automated follow-up
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      A schedule will appear here after a health record is saved
                      with Follow-up Required.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function TaskDetail({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-slate-700">{value}</dd>
    </div>
  );
}
