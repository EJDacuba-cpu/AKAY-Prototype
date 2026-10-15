import { useId, useRef, useState } from "react";
import { CircleX, Plus, Search } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import HouseholdConnectionReview, { RelationshipField } from "./HouseholdConnectionReview";
import { addressText, householdForConnection, patientName, relationshipForConnection, searchHouseholds } from "../../../services/mockFamilyRegistry";

const labelClass = "mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]";

export default function FamilyRegistryField({
  registry, patient, connection, savedConnection, headReplacement,
  onChange, onCreateHousehold, onPendingChange, error, relationshipError,
}) {
  const id = useId();
  const inputRef = useRef(null);
  const [searching, setSearching] = useState(!connection);
  // `query` is what the user is typing; `submitted` is the search actually run.
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [review, setReview] = useState(null);
  const household = householdForConnection(registry, connection);
  const results = searchHouseholds(registry, submitted);
  const head = connection?.kind === "new" && connection.headPatientId === "self"
    ? patient
    : registry.patients.find((item) => item.id === (connection?.kind === "new" ? connection.headPatientId : household?.headPatientId));
  const hasQuery = Boolean(submitted.trim());

  function resetSearch() {
    setQuery("");
    setSubmitted("");
  }

  function runSearch() {
    setSubmitted(query);
  }

  function requestConnection(candidate) {
    setReview({ candidate });
    onPendingChange(true);
  }

  function finishReview(next, replacement) {
    onChange(next, replacement);
    setReview(null);
    resetSearch();
    setSearching(!next);
    onPendingChange(false);
  }

  function continueUnlinked() {
    if (connection) requestConnection(null);
    else {
      resetSearch();
      inputRef.current?.blur();
      onPendingChange(false);
    }
  }

  const emptyActions = <div className="flex flex-wrap items-center justify-center gap-2">
    <Button type="button" size="sm" onClick={onCreateHousehold}><Plus size={14} />Add</Button>
    <Button type="button" variant="ghost" size="sm" onClick={continueUnlinked}>Continue without household</Button>
  </div>;

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <label htmlFor={searching || !connection ? id : `${id}-serial`} className={labelClass}>Family Serial Number</label>
        {household && <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input id={`${id}-serial`} aria-label="Family Serial Number" value={household.serialNumber} readOnly className="h-9 min-w-28 flex-1 bg-gray-50 shadow-none" />
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearching(true); resetSearch(); }}>Change Household</Button>
            <Button type="button" variant="ghost" size="sm" className="text-red-700" onClick={() => requestConnection(null)}>Remove Connection</Button>
          </div>
          <div className="text-xs text-gray-600">
            <p className="font-medium text-gray-950">{patientName(head)}</p>
            <p className="mt-1">{addressText(household.address)}</p>
          </div>
          {!review && <RelationshipField
            value={relationshipForConnection(registry, connection, patient.id)} error={relationshipError}
            onChange={(relationship) => onChange({ ...connection, relationship }, headReplacement)}
          />}
        </div>}
        {(searching || !connection) && !review && <div className={household ? "mt-3 space-y-3" : "space-y-3"}>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input ref={inputRef} id={id} type="search" value={query}
                placeholder="Search FSN, household head or address"
                aria-controls={hasQuery ? `${id}-results` : undefined}
                className="h-9 pl-9 shadow-none"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); runSearch(); }
                  if (event.key === "Escape") { event.preventDefault(); resetSearch(); setSearching(!connection); }
                }}
              />
            </div>
            <Button type="button" variant="ghost" size="sm" className="border border-gray-300 text-gray-900" onClick={runSearch}>Search</Button>
          </div>
          <p className="text-[10px] leading-relaxed text-[#64748B]">Search by family serial number, household head, or address.</p>
          {hasQuery && results.length > 0 && <fieldset id={`${id}-results`} className="max-h-60 overflow-y-auto divide-y divide-gray-200 border-y border-gray-200">
            <legend className="sr-only">Matching households</legend>
            {results.map((item) => <button key={item.id} type="button" disabled={!item.headPatientId}
              className="block w-full px-2 py-3 text-left outline-none hover:bg-gray-50 focus-visible:bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-700/30 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => requestConnection({ kind: "existing", householdId: item.id, relationship: connection?.householdId === item.id ? connection.relationship : "" })}>
              <span className="flex flex-wrap gap-x-3 text-sm font-medium text-gray-950"><span>{item.serialNumber}</span><span>{item.headPatientId ? patientName(registry.patients.find((person) => person.id === item.headPatientId)) : "No assigned head"}</span></span>
              <span className="mt-1 block text-xs text-gray-600">{addressText(item.address)}</span>
            </button>)}
          </fieldset>}
          {hasQuery && results.length === 0 ? <div id={`${id}-results`} className="flex flex-col items-center gap-3 border border-gray-300 px-4 py-8 text-center">
            <CircleX size={24} aria-hidden="true" className="text-gray-500" />
            <div>
              <p role="status" className="text-sm font-semibold text-gray-950">No household found</p>
              <p className="mt-1 text-xs text-gray-600">No match for &ldquo;{submitted.trim()}&rdquo;. Check your search or add a new family serial number.</p>
            </div>
            {emptyActions}
          </div> : connection && <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearching(false); resetSearch(); }}>Cancel search</Button>
          </div>}
        </div>}
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {review && <HouseholdConnectionReview
        key={review.candidate?.householdId || "remove"}
        registry={registry} patient={patient} currentConnection={connection} savedConnection={savedConnection}
        candidate={review.candidate} initialReplacement={headReplacement} onConfirm={finishReview}
        onCancel={() => { setReview(null); onPendingChange(false); }}
      />}
    </div>
  );
}
