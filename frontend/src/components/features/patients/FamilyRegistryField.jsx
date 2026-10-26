import { useId, useRef, useState } from "react";
import { CircleX, Plus, Search } from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import HouseholdConnectionReview, { RelationshipField } from "./HouseholdConnectionReview";
import { relationshipLinkOffer } from "../../../utils/relationshipLink";
import {
  HEAD_RELATIONSHIP, addressText, canHeadHousehold, householdForConnection, nextSerialNumber,
  patientName, relationshipForConnection, searchHouseholds,
} from "../../../services/familyRegistry";

const labelClass = "mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]";

export default function FamilyRegistryField({
  registry, patient, connection, savedConnection, headReplacement,
  onChange, onPendingChange, error, relationshipError, live = false, onSearch, searchResults = [], searchLoading = false, searchError = "", refreshError, onRefresh,
  allowDirectCreate = false,
}) {
  const id = useId();
  const inputRef = useRef(null);
  const [searching, setSearching] = useState(!connection);
  // `query` is what the user is typing; `submitted` is the search actually run.
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [review, setReview] = useState(null);
  const household = householdForConnection(registry, connection);
  const results = live ? searchResults : searchHouseholds(registry, submitted);
  const head = connection?.kind === "new" && connection.headPatientId === "self"
    ? patient
    : registry.patients.find((item) => item.id === (connection?.kind === "new" ? connection.headPatientId : household?.headPatientId));
  const hasQuery = Boolean(submitted.trim());
  const creatingHousehold = connection?.kind === "new";
  const eligibility = canHeadHousehold(patient);
  const directCreate = allowDirectCreate && !patient?.id && !savedConnection;
  const automaticSerial = live && (connection?.household?.serialMode || 'auto') === 'auto';
  const serialPreview = `FSN-${new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date())}-XXXX`;

  function selectHouseholdTab(mode) {
    // These handlers only stage/reset the form draft. Persistence still happens on Save Patient.
    if (mode === 'create') {
      if (!creatingHousehold) createHousehold();
    } else if (creatingHousehold) {
      cancelCreation();
    } else {
      setSearching(true);
      resetSearch();
    }
  }

  function handleTabKeys(event) {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + 1) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  }

  function resetSearch() {
    setQuery("");
    setSubmitted("");
  }

  function runSearch() {
    setSubmitted(query);
    onSearch?.(query);
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

  function createHousehold() {
    onChange({
      kind: "new", headPatientId: "self", relationship: HEAD_RELATIONSHIP,
      household: { serialNumber: live ? "" : nextSerialNumber(registry), ...(live ? {serialMode:"auto"} : {}), address: {} },
    }, null);
    resetSearch();
    setSearching(false);
  }

  function cancelCreation() {
    onChange(null, null);
    setSearching(true);
  }

  // The patient becomes the head, so a minor can't start a household of their own.
  const emptyActions = connection
    ? <p className="text-xs text-gray-700">To start a separate household for an existing patient, use Add Family in the Families module.</p>
    : eligibility.code === "minor"
    ? <p className="text-xs text-gray-700">{eligibility.reason}</p>
    : <div className="flex flex-col items-center gap-1.5">
        <Button type="button" size="sm" disabled={!eligibility.ok} onClick={createHousehold}><Plus size={14} />Create New Household</Button>
        <p className="text-[10px] leading-relaxed text-[#64748B]">{eligibility.ok ? "This patient will be the household head. The address on this form will be used." : eligibility.reason}</p>
      </div>;

  return (
    <div className="min-w-0 space-y-3">
      {refreshError && <div className="space-y-2 text-xs text-red-700"><p role="status">Saved household data could not refresh. Your draft is kept.</p><Button type="button" variant="secondary" size="sm" onClick={onRefresh}>Retry refresh</Button></div>}
      <div>
        <label htmlFor={searching || !connection ? id : `${id}-serial`} className={labelClass}>Family Serial Number</label>
        {directCreate && !review && <div className="mb-3">
          <div className="grid grid-cols-1 gap-1 rounded-2xl bg-neutral-100 p-1 sm:grid-cols-2 sm:rounded-full" role="tablist" aria-label="Household selection" onKeyDown={handleTabKeys}>
            {[['search', 'Search Existing Household'], ['create', 'Create New Household']].map(([mode, label]) => {
              const selected = creatingHousehold === (mode === 'create');
              return <Button key={mode} id={`${id}-${mode}-tab`} type="button" variant="ghost" size="sm" role="tab" aria-selected={selected}
                aria-controls={`${id}-${mode}-panel`} tabIndex={selected ? 0 : -1}
                className={`h-auto min-h-9 min-w-0 whitespace-normal rounded-full text-xs ${selected ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'}`}
                onClick={() => selectHouseholdTab(mode)}>{label}</Button>;
            })}
          </div>
        </div>}
        <div role={directCreate && !review ? 'tabpanel' : undefined} id={directCreate ? `${id}-${creatingHousehold ? 'create' : 'search'}-panel` : undefined}
          aria-labelledby={directCreate && !review ? `${id}-${creatingHousehold ? 'create' : 'search'}-tab` : undefined}>
        {creatingHousehold && <div className="space-y-3">
          {directCreate && <>
            <p role="status" className={`text-xs ${eligibility.ok ? 'text-neutral-600' : 'text-red-700'}`}>{eligibility.ok
              ? 'This patient will be the household head. The address on this form will be used.'
              : eligibility.reason}</p>
            <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
              <legend className="mb-2 text-xs font-medium text-neutral-700">FSN assignment</legend>
              {[['auto', 'Auto-generated'], ['manual', 'Enter manually']].map(([mode, label]) => <label key={mode} className="inline-flex items-center gap-2 text-sm text-neutral-900">
                <input type="radio" name={`${id}-assignment`} value={mode} checked={(connection.household.serialMode || 'auto') === mode}
                  className="size-4 accent-ink-700" onChange={() => onChange({ ...connection, household: { ...connection.household, serialMode: mode } }, null)} />
                {label}
              </label>)}
            </fieldset>
          </>}
          <div className="flex flex-wrap gap-2">
            <Input id={`${id}-serial`} aria-label={directCreate && automaticSerial ? 'FSN format preview' : 'Family Serial Number'} value={automaticSerial ? (directCreate ? serialPreview : "Assigned automatically on save") : connection.household.serialNumber}
              readOnly={automaticSerial} maxLength={100}
              aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => onChange({ ...connection, household: { ...connection.household, serialNumber: event.target.value } }, null)}
              className="h-9 min-w-28 flex-1 shadow-none" />
            {live && !directCreate && <Button type="button" variant="secondary" size="sm" onClick={() => onChange({...connection,household:{...connection.household,serialMode:connection.household.serialMode === "auto" ? "manual" : "auto",serialNumber:""}},null)}>{connection.household.serialMode === "auto" ? "Enter manually" : "Use automatic FSN"}</Button>}
            {!directCreate && <Button type="button" variant="ghost" size="sm" onClick={cancelCreation}>Cancel</Button>}
          </div>
          {directCreate ? <p className="text-xs text-neutral-600">{automaticSerial
            ? 'Format preview only. Your actual FSN is assigned by your facility on save.'
            : 'Enter the household FSN. Availability is checked when registration is saved.'}</p>
            : <p className="text-xs text-gray-600">New household &middot; This patient is the household head.{automaticSerial ? " Format: FSN-YYYY-NNNN. The number is assigned by your facility on save." : ""}</p>}
        </div>}
        {household && !creatingHousehold && <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input id={`${id}-serial`} aria-label="Family Serial Number" value={household.serialNumber} readOnly className="h-9 min-w-28 flex-1 bg-gray-50 shadow-none" />
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearching(true); resetSearch(); }}>Change Household</Button>
          </div>
          <div className="text-xs text-gray-600">
            <p className="font-medium text-gray-950">{patientName(head)}</p>
            <p className="mt-1">{addressText(household.address)}</p>
          </div>
          {!review && <RelationshipField live={live}
            value={relationshipForConnection(registry, connection, patient.id)} error={relationshipError}
            saved={savedConnection?.kind === "existing" && savedConnection.householdId === connection.householdId ? savedConnection.relationship : ""}
            onChange={(relationship) => onChange({ ...connection, relationship, relationshipLink: undefined }, headReplacement)}
          />}
          {!review && live && connection.kind === "existing" && !(savedConnection?.kind === "existing" && savedConnection.householdId === connection.householdId) && (() => {
            const offer = relationshipLinkOffer(relationshipForConnection(registry, connection, patient.id), patientName(head));
            return offer && <label className="flex items-start gap-2 text-xs text-gray-950">
              <input type="checkbox" className="mt-0.5" checked={connection.relationshipLink?.type === offer.type}
                onChange={(event) => onChange({ ...connection, relationshipLink: event.target.checked ? { type: offer.type } : undefined }, headReplacement)} />
              <span>{offer.text}<span className="block text-gray-500">Optional. Saved with the patient only if you tick this.</span></span>
            </label>;
          })()}
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
          {searchLoading && <p role="status" className="text-xs text-gray-600">Searching households…</p>}
          {searchError && <p role="alert" className="text-xs text-red-700">{searchError} Select Search to retry.</p>}
          {hasQuery && !searchLoading && !searchError && results.length > 0 && <fieldset id={`${id}-results`} className="max-h-60 overflow-y-auto divide-y divide-gray-200 border-y border-gray-200">
            <legend className="sr-only">Matching households</legend>
            {results.map((item) => <button key={item.id} type="button" disabled={!item.headPatientId}
              className="block w-full px-2 py-3 text-left outline-none hover:bg-gray-50 focus-visible:bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-700/30 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => requestConnection({ kind: "existing", householdId: item.id, relationship: connection?.householdId === item.id ? connection.relationship : "" })}>
              <span className="flex flex-wrap gap-x-3 text-sm font-medium text-gray-950"><span>{item.serialNumber}</span><span>{item.headPatientId ? patientName(registry.patients.find((person) => person.id === item.headPatientId)) : "No assigned head"}</span></span>
              <span className="mt-1 block text-xs text-gray-600">{addressText(item.address)}</span>
            </button>)}
          </fieldset>}
          {hasQuery && !searchLoading && !searchError && results.length === 0 ? <div id={`${id}-results`} className="flex flex-col items-center gap-3 border border-gray-300 px-4 py-8 text-center">
            <CircleX size={24} aria-hidden="true" className="text-gray-500" />
            <div>
              <p role="status" className="text-sm font-semibold text-gray-950">No household found</p>
              <p className="mt-1 text-xs text-gray-600">No match for &ldquo;{submitted.trim()}&rdquo;. Check your search or add a new family serial number.</p>
            </div>
            {!directCreate && emptyActions}
          </div> : connection && <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearching(false); resetSearch(); }}>Cancel search</Button>
          </div>}
        </div>}
        </div>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-700">{error}</p>}
      {review && <HouseholdConnectionReview
        key={review.candidate?.householdId || "remove"}
        registry={registry} patient={patient} currentConnection={connection} savedConnection={savedConnection}
        live={live} candidate={review.candidate} initialReplacement={headReplacement} onConfirm={finishReview}
        onCancel={() => { setReview(null); onPendingChange(false); }}
      />}
    </div>
  );
}
