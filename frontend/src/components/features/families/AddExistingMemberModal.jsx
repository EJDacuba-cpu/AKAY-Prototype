import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import toast from "react-hot-toast";
import ModalShell from "../../common/modals/ModalShell";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select } from "../../ui/select";
import useHouseholdScope from "../../../hooks/useBhcHouseholdScope";
import { changePatientHousehold, getHouseholdById, getHouseholdCandidates } from "../../../services/householdService";
import { getPatientById } from "../../../services/patientService";
import { addressText, patientName, validateConnection } from "../../../services/familyRegistry";
import { householdRegistry, normalizeHouseholdPatient, registrationErrors } from "../../../utils/householdData";
import { changeHouseholdPayload } from "../../../utils/changeHousehold";
import {
  addMemberBlockReason,
  currentHouseholdLabel,
  destinationVersionUnchanged,
  sourceMembershipUnchanged,
} from "../../../utils/addExistingMember";
import { RELATIONSHIP_LABELS, isAcceptedLabel } from "../../../utils/relationshipLabels";
import { queryKeys } from "../../../utils/queryKeys";

const panel = "min-w-0 rounded-md border border-neutral-200 bg-white p-4";

const headOf = (household) => household?.members?.find((member) => member.id === household.headPatientId);

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value || "Not recorded"}</dd>
    </div>
  );
}

// Attaches an existing registered patient to this household. Never creates a patient record.
export default function AddExistingMemberModal({ role = "bhc", household, onClose }) {
  const scope = useHouseholdScope(role);
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [relationship, setRelationship] = useState("");
  const [step, setStep] = useState("select");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  const destinationHead = headOf(household);
  const connection = selected
    ? { kind: "existing", householdId: household.id, relationship }
    : null;
  const registry = useMemo(
    () => householdRegistry([household], selected),
    [household, selected],
  );

  const mutation = useMutation({
    mutationFn: () => changePatientHousehold(selected.id, changeHouseholdPayload(connection, registry, null)),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: scope.key }),
        client.invalidateQueries({ queryKey: queryKeys.patients(role) }),
        client.invalidateQueries({ queryKey: queryKeys.patientDetails(role, selected.id) }),
      ]);
      toast.success(`${patientName(selected)} added to ${household.serialNumber}.`);
      onClose();
    },
    onError: (error) => {
      if (error.status === 409) {
        setMessage("This household changed. Close this window, refresh, and try again.");
      } else if (error.status === 404) {
        setMessage("The patient or household is no longer available. Close and try again.");
      } else {
        const mapped = registrationErrors(error);
        setMessage(
          mapped.relationshipToHouseholdHead
            || mapped.familySerialNumber
            || Object.values(mapped)[0]
            || "Unable to add this member.",
        );
      }
    },
  });

  const busy = mutation.isPending || checking || loading;

  async function runSearch() {
    setSearched(true);
    setLoading(true);
    setSearchError("");
    setResults([]);
    try {
      const items = await getHouseholdCandidates(query.trim(), role);
      setResults(items);
    } catch (error) {
      setSearchError(error.message || "Unable to search patients.");
    } finally {
      setLoading(false);
    }
  }

  function choosePatient(patient) {
    const blocked = addMemberBlockReason(patient, household);
    if (blocked) {
      setErrors({ patient: blocked });
      setSelected(null);
      return;
    }
    setSelected(patient);
    setErrors({});
    setMessage("");
  }

  function review() {
    const blocked = addMemberBlockReason(selected, household);
    const found = validateConnection(registry, connection, selected?.id, undefined, isAcceptedLabel);
    const next = {
      patient: blocked || (!selected ? "Select a registered patient from the results." : ""),
      relationship: found.relationship || (!relationship ? "Select the relationship to the household head." : ""),
    };
    Object.keys(next).forEach((key) => { if (!next[key]) delete next[key]; });
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setMessage("");
    setStep("review");
  }

  async function confirm() {
    if (busy || !selected) return;
    setChecking(true);
    setMessage("");
    try {
      const [latestHousehold, latestPatientRaw] = await Promise.all([
        getHouseholdById(household.id, role),
        getPatientById(selected.id),
      ]);
      const latestPatient = normalizeHouseholdPatient(latestPatientRaw);
      if (!destinationVersionUnchanged(household, latestHousehold)) {
        await client.invalidateQueries({ queryKey: scope.key });
        setMessage("This household changed since you opened it. Close this window, review the Members List, and try again.");
        return;
      }
      if (!sourceMembershipUnchanged(selected, latestPatient)) {
        await client.invalidateQueries({ queryKey: scope.key });
        setMessage("This patient's household membership changed. Close this window, search again, and review before saving.");
        return;
      }
      const blocked = addMemberBlockReason(latestPatient, latestHousehold);
      if (blocked) {
        setMessage(blocked);
        return;
      }
    } catch {
      setMessage("Unable to confirm the current household or patient. Check your connection and try again.");
      return;
    } finally {
      setChecking(false);
    }
    mutation.mutate();
  }

  const reviewing = step === "review";

  return (
    <ModalShell
      title="Add Existing Member"
      appearance="plain"
      onClose={() => !busy && onClose()}
      closeDisabled={busy}
      size="wide"
      panelClassName="max-w-[960px]! max-h-[85vh]! sm:max-h-[85vh]!"
      bodyClassName="p-4"
      footer={(
        <>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          {reviewing && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setStep("select"); setMessage(""); }}>
              Back
            </Button>
          )}
          {reviewing
            ? <Button type="button" variant="brand" disabled={busy} onClick={confirm}>{busy ? "Saving…" : "Confirm Add Member"}</Button>
            : <Button type="button" variant="brand" onClick={review}>Review Assignment</Button>}
        </>
      )}
    >
      <div className="space-y-4 text-neutral-900">
        <p className="text-sm text-neutral-600">
          Connect a registered patient to {household.serialNumber}. This does not create a new patient record.
        </p>
        {message && <p role="alert" className="text-sm text-red-700">{message}</p>}

        {!reviewing ? (
          <div className="grid gap-4 md:grid-cols-2">
            <section aria-labelledby="add-member-search" className={panel}>
              <h3 id="add-member-search" className="mb-4 text-sm font-semibold">Search registered patients</h3>
              <label htmlFor="add-member-query" className="mb-1 block text-xs text-neutral-500">
                Name or patient ID
              </label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-[14px] text-neutral-500" />
                  <Input
                    id="add-member-query"
                    type="search"
                    value={query}
                    className="pl-10"
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        runSearch();
                      }
                    }}
                  />
                </div>
                <Button type="button" variant="secondary" className="h-11" onClick={runSearch}>Search</Button>
              </div>
              {loading && <p role="status" className="mt-2 text-xs text-neutral-600">Searching patients…</p>}
              {searchError && <p role="alert" className="mt-2 text-xs text-red-700">{searchError} Select Search to retry.</p>}
              {searched && !loading && !searchError && (results.length
                ? (
                  <ul className="mt-2 max-h-56 divide-y divide-neutral-200 overflow-y-auto rounded-md border border-neutral-200" aria-label="Matching patients">
                    {results.map((patient) => {
                      const blocked = addMemberBlockReason(patient, household);
                      return (
                        <li key={patient.id}>
                          <button
                            type="button"
                            disabled={Boolean(blocked)}
                            aria-pressed={selected?.id === patient.id}
                            onClick={() => choosePatient(patient)}
                            className={`block w-full px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50 disabled:opacity-50 ${selected?.id === patient.id ? "bg-neutral-100 text-ink-800 ring-1 ring-inset ring-ink-400" : "hover:bg-neutral-50"}`}
                          >
                            <span className="font-medium">{patientName(patient)}</span>
                            <span className="mt-1 block text-xs text-neutral-500">
                              ID {patient.id}
                              {patient.birthDate ? ` · Born ${patient.birthDate}` : ""}
                              {" · "}
                              {blocked || currentHouseholdLabel(patient)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
                : <p role="status" className="mt-2 text-xs text-neutral-600">No registered patients match this search.</p>)}
              {errors.patient && <p role="alert" className="mt-2 text-xs text-red-700">{errors.patient}</p>}
            </section>

            <section aria-labelledby="add-member-destination" className={panel}>
              <h3 id="add-member-destination" className="mb-4 text-sm font-semibold">Destination household</h3>
              <dl className="space-y-4">
                <Detail label="Family Serial Number" value={household.serialNumber} />
                <Detail label="Household head" value={destinationHead ? patientName(destinationHead) : ""} />
                <Detail label="Address" value={addressText(household.address)} />
              </dl>
              {selected && (
                <dl className="mt-4 space-y-4 border-t border-neutral-200 pt-4">
                  <Detail label="Selected patient" value={patientName(selected)} />
                  <Detail label="Patient ID" value={selected.id} />
                  <Detail label="Birthdate" value={selected.birthDate} />
                  <Detail label="Current household" value={currentHouseholdLabel(selected)} />
                </dl>
              )}
              <div className="mt-4">
                <label htmlFor="add-member-relationship" className="mb-1 block text-xs text-neutral-500">
                  Relationship to head <span className="text-red-700">*</span>
                </label>
                <Select
                  id="add-member-relationship"
                  value={relationship}
                  aria-invalid={Boolean(errors.relationship)}
                  onChange={(event) => {
                    setRelationship(event.target.value);
                    setErrors((previous) => ({ ...previous, relationship: "" }));
                  }}
                >
                  <option value="">Select relationship</option>
                  {RELATIONSHIP_LABELS.map((label) => (
                    <option key={label} value={label}>{label}</option>
                  ))}
                </Select>
                {errors.relationship && <p role="alert" className="mt-2 text-xs text-red-700">{errors.relationship}</p>}
              </div>
            </section>
          </div>
        ) : (
          <section aria-labelledby="add-member-review" className={panel}>
            <h3 id="add-member-review" className="mb-2 text-sm font-semibold">
              Review assignment for {patientName(selected)}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr>
                    <th className="w-40" />
                    <th scope="col" className="pb-2 pr-3 text-xs font-medium text-neutral-500">Current</th>
                    <th scope="col" className="pb-2 text-xs font-medium text-neutral-500">After save</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-neutral-200 align-top">
                    <th scope="row" className="py-2 pr-3 text-left text-xs font-normal text-neutral-500">Family Serial Number</th>
                    <td className="py-2 pr-3 text-sm">{currentHouseholdLabel(selected)}</td>
                    <td className="py-2 text-sm font-medium">{household.serialNumber}</td>
                  </tr>
                  <tr className="border-t border-neutral-200 align-top">
                    <th scope="row" className="py-2 pr-3 text-left text-xs font-normal text-neutral-500">Household head</th>
                    <td className="py-2 pr-3 text-sm">—</td>
                    <td className="py-2 text-sm font-medium">{destinationHead ? patientName(destinationHead) : ""}</td>
                  </tr>
                  <tr className="border-t border-neutral-200 align-top">
                    <th scope="row" className="py-2 pr-3 text-left text-xs font-normal text-neutral-500">Relationship to head</th>
                    <td className="py-2 pr-3 text-sm">{selected.relationshipToHouseholdHead || "—"}</td>
                    <td className="py-2 text-sm font-medium">{relationship}</td>
                  </tr>
                  <tr className="border-t border-neutral-200 align-top">
                    <th scope="row" className="py-2 pr-3 text-left text-xs font-normal text-neutral-500">Address</th>
                    <td className="py-2 pr-3 text-sm">{[selected.streetAddress, selected.purokArea].filter(Boolean).join(", ") || "—"}</td>
                    <td className="py-2 text-sm font-medium">{addressText(household.address)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-neutral-600">
              <li>No new patient record is created.</li>
              <li>The address changes to this household&apos;s address only when you confirm.</li>
              <li>The relationship label is descriptive. It does not create or change any parent-child link.</li>
            </ul>
          </section>
        )}
      </div>
    </ModalShell>
  );
}
