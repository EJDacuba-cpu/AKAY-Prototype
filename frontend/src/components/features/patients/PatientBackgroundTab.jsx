import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { getPatientBackgroundHistory } from "../../../services/patientService";
import { formatLongDate } from "../../../utils/formatters";
import { queryKeys } from "../../../utils/queryKeys";
import {
  BACKGROUND_SECTION_FIELDS,
  BACKGROUND_SECTION_KEYS,
  BACKGROUND_SECTION_LABELS,
  backgroundChangeRows,
} from "../../../utils/backgroundUpdate";
import MedicalConditionsGroups from "./MedicalConditionsGroups";
import { FieldList, ProfileSection } from "./profile/ProfileSection";

function readValue(background, field) {
  return (field.group ? background?.[field.group]?.[field.key] : background?.[field.key]) || "";
}

/** One dated entry of a section's Changes log; expands to the fields it changed. */
function ChangeEntry({ entry, section, basePath }) {
  const [open, setOpen] = useState(false);
  const rows = backgroundChangeRows(entry.before, entry.after, section);
  const fromDiagnosis = entry.source === "diagnosis";

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="text-neutral-900">
          {fromDiagnosis ? "Current Conditions updated from diagnosis" : `${BACKGROUND_SECTION_LABELS[section]} updated`}
          <span className="text-neutral-500">
            {" · "}
            {formatLongDate(entry.dateRecorded || entry.changedAt, "")}
            {entry.changedByName ? ` · ${entry.changedByName}` : ""}
          </span>
        </span>
        <span className="flex items-center gap-3 text-xs">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              className="font-medium text-neutral-600 hover:text-neutral-900 hover:underline"
            >
              {open ? "Hide changes" : "Show changes"}
            </button>
          )}
          {entry.healthRecordId && (
            <Link
              to={`${basePath}/health-records/${entry.healthRecordId}`}
              className="font-medium text-ink-600 hover:text-ink-900"
            >
              From consultation →
            </Link>
          )}
        </span>
      </div>
      {open && (
        <dl className="mt-1.5 grid grid-cols-[minmax(6.5rem,9rem)_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
          {rows.map((row) => (
            <div key={row.key} className="contents">
              <dt className="text-neutral-500">{row.label}</dt>
              <dd className="m-0 min-w-0 break-words text-neutral-900">
                <span className="text-neutral-500 line-through">{row.before || "Not recorded"}</span>
                {" → "}
                {row.after || "Not recorded"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

function ChangesLog({ section, entries, lastUpdated, isLoading, isError, basePath }) {
  return (
    <div className="mt-4 border-t border-neutral-100 pt-3">
      <h3 className="text-[13px] font-semibold text-neutral-900">Changes</h3>
      {isLoading ? (
        <p className="py-2 text-sm text-neutral-500">Loading changes...</p>
      ) : isError ? (
        <p className="py-2 text-sm text-neutral-500">Unable to load the change history right now.</p>
      ) : entries.length ? (
        <ul className="divide-y divide-neutral-100">
          {entries.map((entry, index) => (
            <ChangeEntry key={`${entry.healthRecordId}-${entry.revision}-${index}`} entry={entry} section={section} basePath={basePath} />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-neutral-500">
          {lastUpdated ? "Last changed before change history was recorded." : "No recorded changes yet."}
        </p>
      )}
    </div>
  );
}

/**
 * The Patient Background tab: Past Medical, Family, and Personal & Social
 * History, read-only, each with its dated Changes log. Reviewing and updating
 * happens inside a consultation (ConsultationBackgroundCard), never here.
 */
export default function PatientBackgroundTab({ patientId, background, conditions, basePath = "/bhc" }) {
  const history = useQuery({
    queryKey: queryKeys.patientBackgroundHistory(patientId),
    queryFn: () => getPatientBackgroundHistory(patientId),
    enabled: Boolean(patientId),
  });
  const entries = Array.isArray(history.data) ? history.data : [];

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-500">
        Background is reviewed and updated during a consultation.
      </p>

      {BACKGROUND_SECTION_KEYS.map((section) => {
        const lastUpdated = background?.updatedAt?.[section] || "";
        const fields = BACKGROUND_SECTION_FIELDS[section].filter((field) => field.key !== "currentDiseases");
        return (
          <ProfileSection
            key={section}
            id={`background-${section}`}
            title={BACKGROUND_SECTION_LABELS[section]}
            meta={lastUpdated ? `Updated ${formatLongDate(lastUpdated, "")}` : "Not yet recorded"}
          >
            {section === "medical" && (
              <div className="mb-3">
                <h3 className="mb-1.5 text-[13px] font-semibold text-neutral-900">Medical Conditions</h3>
                <MedicalConditionsGroups
                  groups={conditions?.groups}
                  isLoading={conditions?.isLoading}
                  isError={conditions?.isError}
                />
              </div>
            )}
            <FieldList rows={fields.map((field) => [field.label, readValue(background, field)])} />
            <ChangesLog
              section={section}
              entries={entries.filter((entry) => entry.section === section)}
              lastUpdated={lastUpdated}
              isLoading={history.isLoading}
              isError={history.isError}
              basePath={basePath}
            />
          </ProfileSection>
        );
      })}
    </div>
  );
}
