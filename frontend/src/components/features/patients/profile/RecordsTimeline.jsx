import { useMemo, useState } from "react";
import { ChevronRight, Info } from "lucide-react";

import { RefreshingIndicator, SoftLoadingArea } from "../../../common";
import SpecializedRecordsTab from "../../records/SpecializedRecordsTab";
import { AREA_CONFIG } from "../PatientProgramTab";
import { EmptyNote, ProfileSection, TextAction } from "./ProfileSection";
import { formatDisplayValue } from "../../../../utils/formatters";
import { formatShortDate } from "../../../../utils/patientProfile";
import {
  getRecordDateValue,
  getRecordIdLabel,
  getRecordOutcome,
  getRecordOutcomeSubLabel,
  getServiceTypeLabel,
  getSpecializedRecordPrograms,
  isFollowUpVisitRecord,
} from "../../../../utils/healthRecordPrograms";

const INITIAL_VISIBLE = 5;

function getRecordKey(record = {}) {
  const id = record.id || record.health_record_id || record.healthRecordId || record.record_id || record.recordId || record._id;
  return id ? String(id) : "";
}

function FilterChip({ active, count, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded-none border px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 ${
        active
          ? "border-red-600 bg-red-600 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
      }`}
    >
      {children}
      <span className={`tabular-nums ${active ? "text-white/80" : "text-gray-400"}`}>{count}</span>
    </button>
  );
}

const OUTCOME_TEXT = {
  Referred: "text-amber-700",
  "Follow-up": "text-red-600",
  Routine: "text-gray-500",
};

/** Flat disposition label: coloured text, no pill. Shows a dash for legacy rows. */
function Outcome({ record }) {
  const outcome = getRecordOutcome(record);
  if (!outcome) return <span className="text-gray-300">—</span>;
  const subLabel = getRecordOutcomeSubLabel(record);
  return (
    <span className="flex flex-col items-end">
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${OUTCOME_TEXT[outcome]}`}>
        {outcome}
      </span>
      {subLabel && <span className="text-[11px] text-gray-400">{subLabel}</span>}
    </span>
  );
}

function TimelineRow({ record, onView }) {
  const recordId = getRecordKey(record);
  return (
    <li>
      <button
        type="button"
        onClick={() => onView(recordId)}
        aria-label={`View health record ${getRecordIdLabel(record)}`}
        className="group grid w-full grid-cols-[6.25rem_minmax(0,1fr)_auto] items-center gap-x-4 py-3 text-left transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600/40"
      >
        <span className="text-xs tabular-nums text-gray-500">
          {formatShortDate(getRecordDateValue(record))}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-gray-900">
            {formatDisplayValue(record.chiefComplaint, "No complaint recorded")}
            {isFollowUpVisitRecord(record) && (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#1D4ED8]">
                Follow-up
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">
            {[getServiceTypeLabel(record, ""), getRecordIdLabel(record)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <Outcome record={record} />
          <ChevronRight size={14} className="text-gray-300 transition group-hover:text-gray-600" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

/** Compiled program history (immunization chart, prenatal visits...) for the selected chip. */
function ProgramDetail({ program, records, patient, area }) {
  const config = area ? AREA_CONFIG[area.key] : null;
  return (
    <div className="mt-5">
      {area?.historyOnly && (
        <p className="mb-3 flex items-start gap-2 text-xs text-gray-500">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          Kept for the record — this patient is no longer eligible for new services in this program, but past records remain available.
        </p>
      )}
      <SpecializedRecordsTab records={records} patient={patient} basePath="/bhc" program={program} flat />
      {config?.pending?.length > 0 && (
        <p className="mt-4 text-xs text-gray-400">
          Not yet captured: {config.pending.map((item) => item.title).join(", ")}.
        </p>
      )}
    </div>
  );
}

/**
 * The patient's health records as one chronological timeline. Program filter
 * chips narrow it (and reveal that program's compiled history beneath), so
 * program-specific charts live here instead of behind separate tabs. The
 * latest five show by default; "Show all" expands in place.
 */
export default function RecordsTimeline({
  records = [],
  patient,
  conditionalAreas = [],
  isLoading = false,
  isFetching = false,
  isError = false,
  onView,
}) {
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);

  const programs = useMemo(() => getSpecializedRecordPrograms(records), [records]);
  // A stale selection (records reassigned, patient changed) falls back to All.
  const activeProgram = programs.find((program) => program.key === filter) || null;
  const visibleSource = activeProgram ? activeProgram.records : records;
  const visible = showAll ? visibleSource : visibleSource.slice(0, INITIAL_VISIBLE);
  const area = activeProgram
    ? conditionalAreas.find((candidate) => candidate.programs.includes(activeProgram.key)) || null
    : null;

  function selectFilter(next) {
    setFilter(next);
    setShowAll(false);
  }

  return (
    <ProfileSection
      id="records"
      title="Health Records"
      meta={records.length ? `${records.length} total` : null}
      actions={isFetching && records.length > 0 ? <RefreshingIndicator label="Updating health records..." /> : null}
    >
      {isLoading && records.length === 0 ? (
        <SoftLoadingArea isLoading message="Loading health records..." minHeight="min-h-[160px]">
          <div className="min-h-[160px]" />
        </SoftLoadingArea>
      ) : isError && records.length === 0 ? (
        <EmptyNote>Unable to load health records right now.</EmptyNote>
      ) : records.length === 0 ? (
        <EmptyNote>No health records recorded for this patient yet.</EmptyNote>
      ) : (
        <>
          {programs.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter health records by program">
              <FilterChip active={!activeProgram} count={records.length} onClick={() => selectFilter("all")}>
                All
              </FilterChip>
              {programs.map((program) => (
                <FilterChip
                  key={program.key}
                  active={activeProgram?.key === program.key}
                  count={program.count}
                  onClick={() => selectFilter(program.key)}
                >
                  {program.label}
                </FilterChip>
              ))}
            </div>
          )}

          <ul className="divide-y divide-gray-100 border-y border-gray-100">
            {visible.map((record) => (
              <TimelineRow key={getRecordKey(record)} record={record} onView={onView} />
            ))}
          </ul>

          {visibleSource.length > INITIAL_VISIBLE && (
            <div className="pt-3">
              <TextAction onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Show less" : `Show all ${visibleSource.length} records`}
              </TextAction>
            </div>
          )}

          {activeProgram && (
            <ProgramDetail
              program={activeProgram.key}
              records={records}
              patient={patient}
              area={area}
            />
          )}
        </>
      )}
    </ProfileSection>
  );
}
