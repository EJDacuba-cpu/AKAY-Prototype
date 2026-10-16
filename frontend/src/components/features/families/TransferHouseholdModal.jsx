import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, Search } from "lucide-react";
import toast from "react-hot-toast";
import ModalShell from "../../common/modals/ModalShell";
import { Button } from "../../ui/button";
import useBhcHouseholdScope from "../../../hooks/useBhcHouseholdScope";
import useHouseholdSearch from "../../../hooks/useHouseholdSearch";
import { changePatientHousehold, getHouseholdById } from "../../../services/householdService";
import { addressText, patientName, validateConnection } from "../../../services/familyRegistry";
import { householdRegistry, registrationErrors } from "../../../utils/householdData";
import { changeHouseholdPayload } from "../../../utils/changeHousehold";
import { destinationCandidates } from "../../../utils/householdTransfer";
import { RELATIONSHIP_LABELS, isAcceptedLabel } from "../../../utils/relationshipLabels";
import { queryKeys } from "../../../utils/queryKeys";

const field = "h-10 w-full rounded-full border border-neutral-300 bg-white px-4 text-sm text-neutral-900 outline-none focus-visible:border-red-700 focus-visible:ring-2 focus-visible:ring-red-700/15 aria-invalid:border-red-700";
const panel = "min-w-0 rounded-md border border-neutral-200 bg-white p-4";

const headOf = (household) => household?.members?.find((member) => member.id === household.headPatientId);

function Detail({ label, value }) {
  return <div><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 break-words text-sm">{value || "Not recorded"}</dd></div>;
}

// Moves one member to another existing household. It sends only the existing household command, so the patient's
// identity, birth and guardian details, parent links and records are untouched; the address changes on the server
// only after the explicit review and confirmation below.
export default function TransferHouseholdModal({ member, household, onClose }) {
  const scope = useBhcHouseholdScope();
  const client = useQueryClient();
  const lookup = useHouseholdSearch(scope);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [destination, setDestination] = useState(null);
  const [relationship, setRelationship] = useState("");
  const [step, setStep] = useState("select");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  const name = patientName(member);
  const currentHead = headOf(household);
  const destinationHead = headOf(destination);
  const candidates = destinationCandidates(lookup.results, household.id);
  const registry = useMemo(() => householdRegistry(destination ? [destination] : [], member), [destination, member]);
  const connection = destination ? { kind: "existing", householdId: destination.id, relationship } : null;

  const mutation = useMutation({
    mutationFn: () => changePatientHousehold(member.id, changeHouseholdPayload(connection, registry, null)),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: scope.key }),
        client.invalidateQueries({ queryKey: queryKeys.patients("bhc") }),
        client.invalidateQueries({ queryKey: queryKeys.patientDetails("bhc", member.id) }),
      ]);
      toast.success(`${name} moved to ${destination.serialNumber}.`);
      onClose();
    },
    onError: (error) => {
      if (error.status === 409) setMessage("The destination household changed. Go back, search again, and review the transfer.");
      else if (error.status === 404) setMessage("The destination household is no longer available. Go back and choose another.");
      else {
        const mapped = registrationErrors(error);
        setMessage(mapped.relationshipToHouseholdHead || mapped.familySerialNumber || Object.values(mapped)[0] || "Unable to transfer this member.");
      }
    },
  });
  const busy = mutation.isPending || checking;

  function runSearch() {
    setSearched(true);
    lookup.search(query.trim());
  }

  function review() {
    const found = validateConnection(registry, connection, member.id, undefined, isAcceptedLabel);
    if (!destination) found.household = "Select a destination household from the results.";
    if (!relationship) found.relationship = "Select the new relationship to the household head.";
    if (Object.keys(found).length) {
      setErrors({ household: found.household || found.serialNumber || found.headPatientId, relationship: found.relationship });
      return;
    }
    setErrors({});
    setMessage("");
    setStep("review");
  }

  // The server verifies the destination; this re-reads the source so a stale screen cannot move the wrong member.
  async function confirm() {
    if (busy) return;
    setChecking(true);
    setMessage("");
    try {
      const latest = await getHouseholdById(household.id);
      if (!latest.members.some((item) => item.id === member.id) || latest.version !== household.version) {
        await client.invalidateQueries({ queryKey: scope.key });
        setMessage("This household changed since you opened it. Close this window, review the Members List, and try again.");
        return;
      }
    } catch {
      setMessage("Unable to confirm the current household. Check your connection and try again.");
      return;
    } finally {
      setChecking(false);
    }
    mutation.mutate();
  }

  const changed = step === "review";
  const row = (label, from, to) => <tr key={label} className="border-t border-neutral-200 align-top"><th scope="row" className="py-2 pr-3 text-left text-xs font-normal text-neutral-500">{label}</th><td className="py-2 pr-3 text-sm">{from || "Not recorded"}</td><td className="py-2 text-sm font-medium">{to || "Not recorded"}</td></tr>;

  return <ModalShell title="Transfer Household" appearance="plain" onClose={() => !busy && onClose()} closeDisabled={busy} size="wide"
    panelClassName="max-w-[960px]! max-h-[85vh]! sm:max-h-[85vh]!" bodyClassName="p-4"
    footer={<>
      <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={onClose}>Cancel</Button>
      {changed && <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={() => { setStep("select"); setMessage(""); }}>Back</Button>}
      {changed
        ? <Button type="button" className="rounded-full" disabled={busy} onClick={confirm}>{busy ? "Transferring…" : "Confirm Transfer"}</Button>
        : <Button type="button" className="rounded-full" onClick={review}>Review Transfer</Button>}
    </>}>
    <div className="space-y-4 text-neutral-900">
      <p className="text-sm text-neutral-600">Move {name} to another household. Birth details, guardian details, parent links, and health records are not changed.</p>
      {message && <p role="alert" className="text-sm text-red-700">{message}</p>}

      {!changed ? <div className="grid items-stretch gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <section aria-labelledby="transfer-current" className={panel}>
          <h3 id="transfer-current" className="mb-4 text-sm font-semibold">Current household</h3>
          <dl className="space-y-4">
            <Detail label="Family Serial Number" value={household.serialNumber} />
            <Detail label="Household head" value={currentHead ? patientName(currentHead) : ""} />
            <Detail label="Relationship to head" value={member.relationshipToHouseholdHead} />
            <Detail label="Address" value={addressText(household.address)} />
          </dl>
        </section>

        <div className="flex items-center justify-center text-neutral-400" aria-hidden="true">
          <ArrowRight className="hidden md:block" size={28} />
          <ArrowDown className="md:hidden" size={28} />
        </div>

        <section aria-labelledby="transfer-destination" className={panel}>
          <h3 id="transfer-destination" className="mb-4 text-sm font-semibold">Destination household</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="transfer-search" className="mb-1 block text-xs text-neutral-500">Search FSN, household head, or address</label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-4 top-3 text-neutral-400" />
                  <input id="transfer-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={`${field} pl-10`}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); runSearch(); } }} />
                </div>
                <Button type="button" variant="outline" className="rounded-full" onClick={runSearch}>Search</Button>
              </div>
              {lookup.loading && <p role="status" className="mt-2 text-xs text-neutral-600">Searching households…</p>}
              {lookup.error && <p role="alert" className="mt-2 text-xs text-red-700">{lookup.error} Select Search to retry.</p>}
              {searched && !lookup.loading && !lookup.error && (candidates.length
                ? <ul className="mt-2 max-h-40 divide-y divide-neutral-200 overflow-y-auto rounded-md border border-neutral-200" aria-label="Matching households">
                  {candidates.map((item) => <li key={item.id}><button type="button" aria-pressed={destination?.id === item.id} onClick={() => { setDestination(item); setErrors({}); }}
                    className={`block w-full px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600 ${destination?.id === item.id ? "bg-red-50 text-red-900" : "hover:bg-neutral-50"}`}>
                    <span className="font-medium">{item.serialNumber}</span> <span className="text-neutral-600">{patientName(headOf(item))}</span>
                    <span className="block text-xs text-neutral-500">{addressText(item.address)}</span></button></li>)}
                </ul>
                : <p role="status" className="mt-2 text-xs text-neutral-600">No other household matches. The current household is not listed.</p>)}
              {errors.household && <p role="alert" className="mt-2 text-xs text-red-700">{errors.household}</p>}
            </div>

            {destination && <dl className="space-y-4 border-t border-neutral-200 pt-4">
              <Detail label="Destination FSN" value={destination.serialNumber} />
              <Detail label="Household head" value={destinationHead ? patientName(destinationHead) : ""} />
              <Detail label="Address" value={addressText(destination.address)} />
            </dl>}

            <div>
              <label htmlFor="transfer-relationship" className="mb-1 block text-xs text-neutral-500">New relationship to head <span className="text-red-700">*</span></label>
              <select id="transfer-relationship" value={relationship} aria-invalid={Boolean(errors.relationship)} className={field}
                onChange={(event) => { setRelationship(event.target.value); setErrors((previous) => ({ ...previous, relationship: "" })); }}>
                <option value="">Select relationship</option>
                {RELATIONSHIP_LABELS.map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
              {errors.relationship && <p role="alert" className="mt-2 text-xs text-red-700">{errors.relationship}</p>}
            </div>
          </div>
        </section>
      </div>

      : <section aria-labelledby="transfer-review" className={panel}>
        <h3 id="transfer-review" className="mb-2 text-sm font-semibold">Review transfer for {name}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead><tr><th className="w-40" /><th scope="col" className="pb-2 pr-3 text-xs font-medium text-neutral-500">Current household</th><th scope="col" className="pb-2 text-xs font-medium text-neutral-500">New household</th></tr></thead>
            <tbody>
              {row("Family Serial Number", household.serialNumber, destination.serialNumber)}
              {row("Household head", currentHead ? patientName(currentHead) : "", destinationHead ? patientName(destinationHead) : "")}
              {row("Relationship to head", member.relationshipToHouseholdHead, relationship)}
              {row("Address", addressText(household.address), addressText(destination.address))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-neutral-600">
          <li>The address changes to the new household&apos;s address only when you confirm.</li>
          <li>The relationship label is descriptive. It does not create or change any parent-child link.</li>
          <li>Saved spouse and sibling connections are kept, and appear only when both people share a household.</li>
        </ul>
      </section>}
    </div>
  </ModalShell>;
}
