import { useMemo, useState } from "react";
import { Lock } from "lucide-react";

import {
  ListFilterPopover,
  SearchField,
  SearchFilterCluster,
} from "../../common";
import { Button } from "../../ui/button";
import { AVAILABILITY_AVAILABLE } from "../../../services/doctorAvailabilityModel";
import {
  ROSTER_STATUS,
  displayedAvailabilityStatus,
  filterDoctorRoster,
} from "../../../utils/doctorRoster";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";
const STATUS_OPTIONS = [
  { value: ROSTER_STATUS.ALL, label: "All doctors" },
  { value: ROSTER_STATUS.AVAILABLE, label: "Available" },
  { value: ROSTER_STATUS.UNAVAILABLE, label: "Unavailable" },
];

const STATUS_FIELD = [
  {
    key: "status",
    label: "Status",
    resetValue: ROSTER_STATUS.ALL,
    options: STATUS_OPTIONS,
    fullWidth: true,
  },
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
  const statusLabel =
    STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
  const activeFilters = useMemo(
    () =>
      status !== ROSTER_STATUS.ALL
        ? [{ key: "status", label: `Status: ${statusLabel}` }]
        : [],
    [status, statusLabel],
  );

  return (
    <section className="flex h-[26rem] min-w-0 flex-col xl:h-full overflow-hidden rounded-card border border-neutral-200 bg-white shadow-card">
      <div className="shrink-0 space-y-3 border-b border-neutral-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-[17px] font-bold leading-tight text-ink-800">Doctors</h2>
          <SearchFilterCluster
            search={
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search name or specialization"
                label="Search doctors"
              />
            }
            filter={
              <ListFilterPopover
                fields={STATUS_FIELD}
                applied={{ status }}
                activeFilters={activeFilters}
                onApply={(next) => setStatus(next.status)}
                onRemoveFilter={() => setStatus(ROSTER_STATUS.ALL)}
                onClearAll={() => setStatus(ROSTER_STATUS.ALL)}
                buildDefaults={() => ({ status: ROSTER_STATUS.ALL })}
              />
            }
          />
        </div>
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
