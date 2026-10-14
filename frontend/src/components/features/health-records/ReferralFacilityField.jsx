import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Stethoscope } from "lucide-react";

import { getReferralDestination } from "../../../services/referrals";
import { getStoredAuthUser } from "../../../services/apiClient";
import { ModalButton, ModalShell } from "../../common";
import { Button } from "../../ui/button";
import { Card, CardHeader, CardTitle } from "../../ui/card";
import { FieldError, FieldLabel } from "./fields/ClinicalFields";

const STATUS_AVAILABLE = "Available";
const REFERENCE_NOTE = "For reference only — the RHU assigns the practitioner.";

function formatStamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isAvailable(provider) {
  return provider.availability_status === STATUS_AVAILABLE;
}

function sortProviders(providers) {
  return [...providers].sort(
    (a, b) =>
      Number(isAvailable(b)) - Number(isAvailable(a)) ||
      String(a.name || "").localeCompare(String(b.name || "")),
  );
}

// The roster has no working-hours data yet; remarks and the expected return
// time are what the RHU records about when a doctor can be seen.
function scheduleText(provider) {
  const expected = !isAvailable(provider) && formatStamp(provider.expected_available_at);
  return [provider.remarks, expected ? `Expected available: ${expected}` : ""]
    .filter(Boolean)
    .join(" · ");
}

// Rendered into <body>: the consultation form sits inside animated
// (transformed) containers, which would otherwise trap position: fixed.
function Overlay({ children }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}

function StatusBadge({ provider }) {
  const available = isAvailable(provider);
  return (
    <span
      className="inline-flex w-fit flex-none items-center gap-1.5 rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-black"
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${available ? "bg-black" : "border border-black"}`} />
      {available ? "Available" : "Unavailable"}
    </span>
  );
}

function DoctorRow({ provider, onOpen, paddingClassName = "px-3.5" }) {
  const schedule = scheduleText(provider);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(provider)}
        aria-label={`View availability details for ${provider.name}`}
        className={`flex w-full items-start justify-between gap-3 py-3 text-left text-black transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-400 ${paddingClassName}`}
      >
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold">
            {provider.name}
          </span>
          {provider.specialization && (
            <span className="block text-xs">{provider.specialization}</span>
          )}
          {schedule && (
            <span className="mt-0.5 block text-xs">{schedule}</span>
          )}
        </span>
        <span className="flex flex-none items-center gap-1.5">
          <StatusBadge provider={provider} />
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}

function DetailItem({ label, children }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[#374151]">{children}</dd>
    </div>
  );
}

function DoctorDetailsModal({ provider, onClose }) {
  if (!provider) return null;
  const schedule = scheduleText(provider);
  const updated = formatStamp(provider.updated_at);

  return (
    <Overlay>
      <ModalShell
        open
        title="Doctor Availability Details"
        subtitle={REFERENCE_NOTE}
        icon={<Stethoscope size={14} />}
        size="sm"
        onClose={onClose}
        footer={<ModalButton onClick={onClose}>Close</ModalButton>}
      >
        <dl className="space-y-3">
          <DetailItem label="Name">
            <span className="font-semibold text-[#111827]">{provider.name}</span>
          </DetailItem>
          <DetailItem label="Specialization">
            {provider.specialization || "Not specified"}
          </DetailItem>
          <DetailItem label="Current Status">
            <StatusBadge provider={provider} />
          </DetailItem>
          <DetailItem label="Schedule">
            {schedule || "No schedule notes recorded."}
          </DetailItem>
        </dl>
        {updated && (
          <p className="mt-4 text-[11px] text-[#9CA3AF]">Last updated {updated}</p>
        )}
      </ModalShell>
    </Overlay>
  );
}

/**
 * Full-width read-only roster below the facility and priority fields.
 * Unavailable doctors stay visible; only an empty roster shows the empty state.
 */
function AvailabilityPreview({ facility, alternatives = [], disabled = false, onFacilityChange }) {
  const [detailsProvider, setDetailsProvider] = useState(null);
  const availability = facility.availability || {};
  const providers = sortProviders(
    Array.isArray(availability.providers) ? availability.providers : [],
  );
  const available = availability.available_count ?? providers.filter(isAvailable).length;
  const total = availability.total_count ?? providers.length;
  const updated = formatStamp(availability.updated_at);

  return (
    <Card aria-label={`${facility.name} doctor availability`} className="w-full rounded-none text-black">
      <CardHeader className="space-y-1 border-b border-slate-200 p-4">
        <CardTitle className="flex items-center gap-2 text-black"><Stethoscope size={16} aria-hidden="true" />Doctor Availability</CardTitle>
        <p className="text-xs">{facility.name} · {available} of {total} available</p>
        <p className="text-xs">{REFERENCE_NOTE}</p>
        {updated && <p className="text-[11px]">Last updated {updated}</p>}
      </CardHeader>
      {providers.length === 0 ? (
        <div role="status" className="flex min-h-40 items-center justify-center p-6 text-center text-sm">No doctors listed for this RHU.</div>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-200 overflow-y-auto">
          {providers.map((provider) => <DoctorRow key={provider.id} provider={provider} onOpen={setDetailsProvider} paddingClassName="px-4" />)}
        </ul>
      )}
      {!availability.can_submit_referral && (
        <div role="status" className="space-y-3 border-t border-slate-200 p-4 text-xs leading-5">
          <p>No doctor is currently available at {facility.name}. Choose another facility, or finalize to save the consultation with this referral marked Awaiting Doctor Availability / Not Yet Submitted.</p>
          {alternatives.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {alternatives.map((destination) => <Button key={destination.id} type="button" variant="ghost" disabled={disabled} onClick={() => onFacilityChange(String(destination.id))} className="rounded-none border border-slate-300 bg-white text-black hover:bg-slate-50 hover:text-black">Choose {destination.name}</Button>)}
            </div>
          )}
          <p>A hold is an administrative state, not an appointment or assurance that waiting is safe.</p>
        </div>
      )}
      <DoctorDetailsModal
        provider={detailsProvider}
        onClose={() => setDetailsProvider(null)}
      />
    </Card>
  );
}

/**
 * Receiving facility for a referral made from the Disposition step, with a
 * read-only view of that RHU's practitioners. BHC staff never pick a doctor
 * here: the RHU assigns one, and DOC-14 stays enforced by the server.
 *
 * @param selectAside  optional field drawn beside the select on wide screens
 */
export default function ReferralFacilityField({ value, onChange, error, disabled = false, autoSelect = true, selectAside = null, name = "receivingRhuId", label = "Receiving Facility" }) {
  const user = getStoredAuthUser();
  const { data, error: loadError, refetch } = useQuery({
    queryKey: ["approved-referral-destinations", user?.id, user?.working_facility_key],
    queryFn: getReferralDestination,
    refetchInterval: 30000,
  });
  const destinations = data?.destinations || [];
  const defaultDestination = destinations.find((destination) => String(destination.id) === String(data?.receivingRuralHealthUnit?.id))
    || destinations.find((destination) => destination.is_default);
  const selectedValue = value || (autoSelect && !disabled && defaultDestination ? String(defaultDestination.id) : "");
  const selected = destinations.find((d) => String(d.id) === String(selectedValue));
  const alternatives = selected
    ? destinations.filter(
        (d) => d.id !== selected.id && d.availability?.can_submit_referral,
      )
    : [];

  useEffect(() => {
    if (autoSelect && !disabled && !value && selectedValue) {
      onChange(selectedValue);
    }
  }, [value, selectedValue, onChange, disabled, autoSelect]);

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className={selectAside ? "grid items-start gap-x-4 gap-y-3 md:grid-cols-2" : undefined}>
        <div data-field={name} tabIndex={error ? -1 : undefined}>
          <FieldLabel label={label} required />
          <select
            aria-label={label}
            name={name}
            value={selectedValue}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.target.value)}
            className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-[#1F2937] outline-none transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
              error
                ? "border-[#B91C1C] ring-2 ring-[#B91C1C]/10"
                : "border-[#E5E7EB] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
            }`}
          >
            <option value="">Select receiving facility</option>
            {destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.is_default ? " · Default" : ""}
              </option>
            ))}
          </select>
          <FieldError error={error} />
          {loadError && (
            <p role="alert" className="mt-1 text-[11px] font-medium text-[#B91C1C]">
              Unable to load receiving facilities.{" "}
              <button type="button" className="underline" onClick={() => refetch()}>
                Retry
              </button>
            </p>
          )}
          {value && data && !selected && (
            <p role="alert" className="mt-1 text-[11px] font-medium text-[#B91C1C]">
              This facility is no longer authorized or active. Choose another.
            </p>
          )}
        </div>
        {selectAside}
      </div>

      {selected && <AvailabilityPreview key={selected.id} facility={selected} alternatives={alternatives} disabled={disabled} onFacilityChange={onChange} />}
    </div>
  );
}
