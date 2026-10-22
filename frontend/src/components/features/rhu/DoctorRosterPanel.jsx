import { useState } from "react";
import { ChevronDown, Lock, SlidersHorizontal, X } from "lucide-react";

import { SearchField } from "../../common";
import { Button } from "../../ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "../../ui/popover";
import { AVAILABILITY_AVAILABLE } from "../../../services/doctorAvailabilityModel";
import {
  ROSTER_STATUS,
  displayedAvailabilityStatus,
  filterDoctorRoster,
} from "../../../utils/doctorRoster";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";
const FILTER_SELECT =
  "h-8 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-neutral-200 bg-white py-0 pl-3 pr-8 text-[13px] text-ink-800 shadow-xs outline-none transition-colors hover:border-neutral-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30";
const STATUS_OPTIONS = [
  { value: ROSTER_STATUS.ALL, label: "All doctors" },
  { value: ROSTER_STATUS.AVAILABLE, label: "Available" },
  { value: ROSTER_STATUS.UNAVAILABLE, label: "Unavailable" },
];

export default function DoctorRosterPanel({
  doctors,
  selectedDoctorId,
  canManage,
  onSelectDoctor,
  onManageDoctor,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ROSTER_STATUS.ALL);
  const visible = filterDoctorRoster(doctors, { status, query });
  const filtering = status !== ROSTER_STATUS.ALL || query.trim() !== "";

  return (
    <section className="flex h-[26rem] min-w-0 flex-col xl:h-full overflow-hidden rounded-card border border-neutral-200 bg-white shadow-card">
      <div className="shrink-0 space-y-3 border-b border-neutral-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold leading-tight text-ink-800">Doctors</h2>
          <StatusFilterMenu value={status} onApply={setStatus} />
        </div>
        <SearchField value={query} onChange={setQuery} placeholder="Search name or specialization" label="Search doctors" />
        {!canManage ? (
          <p className="flex items-start gap-1.5 text-[12px] text-neutral-600">
            <Lock size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            View only. The MHO has not granted Manage doctor availability.
          </p>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 text-center">
          <p className="text-[13px] font-semibold text-ink-800">No doctors match</p>
          <p className="mt-1 text-[12px] text-neutral-600">
            {filtering ? "Clear the search or filter to see everyone." : "No doctors to show."}
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
          {visible.map((doctor) => {
            const displayed = displayedAvailabilityStatus(doctor);
            const available = displayed === AVAILABILITY_AVAILABLE;
            const selected = doctor.id === selectedDoctorId;
            return (
              <li
                key={doctor.id}
                className={`flex items-center gap-2 pr-3 ${selected ? "bg-brand-50" : "hover:bg-neutral-50"}`}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectDoctor(selected ? "" : doctor.id)}
                  title={selected ? "Showing this doctor on the calendar. Select again to show everyone." : "Show this doctor on the calendar"}
                  className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left ${FOCUS_RING}`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${available ? "bg-success-500" : "bg-brand-600"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className={`block truncate text-[13px] font-semibold ${selected ? "text-brand-700" : "text-ink-800"}`}>
                      {doctor.name}
                    </span>
                    <span className="block truncate text-[12px] text-neutral-600">
                      {displayed}
                      {doctor.specialization ? ` · ${doctor.specialization}` : ""}
                    </span>
                  </span>
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => onManageDoctor(doctor)}
                  aria-label={`${canManage ? "Manage" : "View"} ${doctor.name}`}
                >
                  {canManage ? "Manage" : "View"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatusFilterMenu({ value, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const active = value !== ROSTER_STATUS.ALL;

  function handleOpenChange(next) {
    if (next) setDraft(value);
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="filter" size="sm" aria-pressed={active} className="gap-2 py-0 pl-1.5 pr-3">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              active ? "bg-white text-brand-700" : "bg-neutral-100 text-neutral-600"
            }`}
          >
            <SlidersHorizontal size={13} strokeWidth={2.1} aria-hidden="true" />
          </span>
          Filter
          {active ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
              1
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Filters"
        className="w-[min(calc(100vw-1.5rem),300px)] overflow-hidden rounded-card p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
          <p className="text-[13px] font-semibold text-ink-800">Filters</p>
          <PopoverClose asChild>
            <button
              type="button"
              className={`flex h-7 w-7 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-ink-800 ${FOCUS_RING}`}
              aria-label="Close filters"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </PopoverClose>
        </div>
        <div className="px-3 py-3">
          <label htmlFor="doctor-status-filter" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-neutral-600">
            Status
          </label>
          <div className="relative">
            <select
              id="doctor-status-filter"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={FILTER_SELECT}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              strokeWidth={2.1}
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-600"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-3 py-2.5">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={draft === ROSTER_STATUS.ALL}
            onClick={() => setDraft(ROSTER_STATUS.ALL)}
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="brand"
            size="compact"
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Apply Filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
