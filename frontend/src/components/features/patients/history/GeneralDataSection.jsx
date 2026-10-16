import { Link } from "react-router";

import { formatDisplayValue, formatLongDate, formatPatientName } from "../../../../utils/formatters";
import { calculateAgeInYears } from "../../../../utils/maternalRisk";
import { INFORMANT_RELATIONS } from "../../../../utils/patientHistory";
import { formatPatientAddress } from "../PatientIdentityCard";
import { Block, FieldGrid, SelectField, TextField } from "./HistoryFields";

function pick(patient, keys) {
  const key = keys.find((name) => patient?.[name] !== undefined && patient?.[name] !== null && patient[name] !== "");
  return key ? String(patient[key]).trim() : "";
}

function Row({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className="m-0 mt-0.5 break-words text-[13px] font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

/**
 * Section I. Identity rows are read-only (they come from registration); the
 * informant is the one per-visit input. `informant` may be null (no default).
 * Changing the relation or the name drops `patientId`, because the linked
 * patient no longer describes the person typed in.
 */
export default function GeneralDataSection({
  patient,
  informant,
  onInformantChange,
  editLink,
  today = new Date(),
}) {
  const birthdate = pick(patient, ["birthdate", "birthDate", "dateOfBirth", "date_of_birth"]);
  const age = calculateAgeInYears(birthdate, today);
  const sex = pick(patient, ["sex"]);
  const civilStatus = pick(patient, ["civilStatus", "civil_status"]);
  const current = informant || { relation: "", name: "", patientId: null };

  const agePart = age === null ? "Age not recorded" : `${age} yrs`;
  const summary = [agePart, sex || "Sex not recorded", civilStatus || "Civil status not recorded"].join(" · ");

  function change(field, next) {
    onInformantChange({ ...current, [field]: next, patientId: null });
  }

  return (
    <div className="space-y-4">
      <Block title="Patient">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-x-4 gap-y-3">
          <Row label="Name" value={formatPatientName(patient, "Not recorded")} />
          <Row label="Age / Sex / Civil Status" value={summary} />
          <Row label="Residence" value={formatDisplayValue(formatPatientAddress(patient), "Not recorded")} />
          <Row label="Occupation" value={formatDisplayValue(pick(patient, ["occupation"]), "Not recorded")} />
          <Row label="Birthday" value={formatLongDate(birthdate, "Not recorded")} />
        </dl>
        {/* A new tab, so the unsaved record in this one is never lost. */}
        {editLink && (
          <Link
            to={editLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-red-600 hover:text-red-800 hover:underline"
          >
            Edit in Patient Information
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        )}
      </Block>

      <Block title="Informant" note="Who gave this history at this visit.">
        <FieldGrid>
          <SelectField
            label="Relation to patient"
            value={current.relation}
            options={INFORMANT_RELATIONS}
            emptyLabel="Not recorded"
            onChange={(next) => change("relation", next)}
          />
          <TextField label="Informant name" value={current.name} onChange={(next) => change("name", next)} />
        </FieldGrid>
      </Block>
    </div>
  );
}
