import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Stethoscope } from "lucide-react";

import { getReferralDestination } from "../../../services/referrals";
import { getStoredAuthUser } from "../../../services/apiClient";
import { Drawer, ModalButton, ModalShell } from "../../common";
import { FieldError, FieldLabel } from "./fields/ClinicalFields";

const STATUS_AVAILABLE = "Available";
const PREVIEW_LIMIT = 3;
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
      className={`inline-flex w-fit flex-none items-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
        available ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#F3F4F6] text-[#374151]"
      }`}
    >
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
        className={`flex w-full items-start justify-between gap-3 py-2.5 text-left transition hover:bg-white focus:bg-white focus:outline-none ${paddingClassName}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#111827]">
            {provider.name}
          </span>
          {provider.specialization && (
            <span className="block text-xs text-[#6B7280]">{provider.specialization}</span>
          )}
          {schedule && (
            <span className="mt-0.5 block text-xs text-[#6B7280]">{schedule}</span>
          )}
        </span>
        <span className="flex flex-none items-center gap-1.5">
          <StatusBadge provider={provider} />
          <ChevronRight size={14} className="text-[#9CA3AF]" aria-hidden="true" />
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

function AllDoctorsDrawer({ facility, providers, onClose, onOpenDoctor }) {
  const [filter, setFilter] = useState("all");
  const availableProviders = providers.filter(isAvailable);
  const shown = filter === "available" ? availableProviders : providers;
  const tabs = [
    { key: "all", label: "All", count: providers.length },
    { key: "available", label: "Available", count: availableProviders.length },
  ];

  return (
    <Overlay>
      <Drawer
        open
        onClose={onClose}
        title={`${facility.name} Doctors`}
        description={REFERENCE_NOTE}
        icon={<Stethoscope size={16} />}
        widthClassName="w-full sm:w-[420px]"
      >
        <div className="border-b border-[#EEF2F6] px-5 py-3">
          <div
            role="group"
            aria-label="Filter doctors"
            className="inline-flex rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-0.5"
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-pressed={filter === tab.key}
                onClick={() => setFilter(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  filter === tab.key
                    ? "bg-white text-[#B91C1C] shadow-sm"
                    : "text-[#6B7280] hover:text-[#111827]"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[#6B7280]">
            No doctors are currently available at this facility.
          </p>
        ) : (
          <ul className="divide-y divide-[#E5E7EB]">
            {shown.map((provider) => (
              <DoctorRow
                key={provider.id}
                provider={provider}
                onOpen={onOpenDoctor}
                paddingClassName="px-5 hover:bg-[#F9FAFB] focus:bg-[#F9FAFB]"
              />
            ))}
          </ul>
        )}
      </Drawer>
    </Overlay>
  );
}

function AvailabilityPanel({ facility }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsProvider, setDetailsProvider] = useState(null);
  const availability = facility.availability || {};
  const providers = sortProviders(
    Array.isArray(availability.providers) ? availability.providers : [],
  );
  const available = availability.available_count ?? providers.filter(isAvailable).length;
  const total = availability.total_count ?? providers.length;
  const updated = formatStamp(availability.updated_at);

  return (
    <div
      aria-label={`${facility.name} availability`}
      className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[#E5E7EB] px-3.5 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
          RHU Availability
          <span className="ml-1.5 normal-case tracking-normal text-[#374151]">
            · {available} of {total} available
          </span>
        </p>
        {updated && (
          <p className="text-[11px] text-[#9CA3AF]">Updated {updated}</p>
        )}
      </div>
      <p className="px-3.5 pt-2 text-[11px] text-[#6B7280]">{REFERENCE_NOTE}</p>
      {providers.length === 0 ? (
        <p className="px-3.5 py-3 text-sm text-[#6B7280]">
          No practitioners are listed for this facility.
        </p>
      ) : (
        <ul className="divide-y divide-[#E5E7EB] pb-1">
          {providers.slice(0, PREVIEW_LIMIT).map((provider) => (
            <DoctorRow key={provider.id} provider={provider} onOpen={setDetailsProvider} />
          ))}
        </ul>
      )}
      {providers.length > PREVIEW_LIMIT && (
        <div className="border-t border-[#E5E7EB] px-3.5 py-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="text-xs font-semibold text-[#B91C1C] hover:text-red-700"
          >
            View All Doctors ({providers.length})
          </button>
        </div>
      )}

      {drawerOpen && (
        <AllDoctorsDrawer
          facility={facility}
          providers={providers}
          onClose={() => setDrawerOpen(false)}
          onOpenDoctor={setDetailsProvider}
        />
      )}
      <DoctorDetailsModal
        provider={detailsProvider}
        onClose={() => setDetailsProvider(null)}
      />
    </div>
  );
}

/**
 * Receiving facility for a referral made from the Disposition step, with a
 * read-only view of that RHU's practitioners. BHC staff never pick a doctor
 * here: the RHU assigns one, and DOC-14 stays enforced by the server.
 */
export default function ReferralFacilityField({ value, onChange, error, disabled = false }) {
  const user = getStoredAuthUser();
  const { data, error: loadError, refetch } = useQuery({
    queryKey: ["approved-referral-destinations", user?.id, user?.working_facility_key],
    queryFn: getReferralDestination,
    refetchInterval: 30000,
  });
  const destinations = data?.destinations || [];
  const selected = destinations.find((d) => String(d.id) === String(value));
  const alternatives = selected
    ? destinations.filter(
        (d) => d.id !== selected.id && d.availability?.can_submit_referral,
      )
    : [];

  useEffect(() => {
    if (!value && data?.receivingRuralHealthUnit?.id) {
      onChange(String(data.receivingRuralHealthUnit.id));
    }
  }, [value, data, onChange]);

  return (
    <div className="space-y-4">
      <div data-field="receivingRhuId" tabIndex={error ? -1 : undefined}>
        <FieldLabel label="Receiving Facility" required />
        <select
          aria-label="Receiving Facility"
          name="receivingRhuId"
          value={value || ""}
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

      {selected && <AvailabilityPanel facility={selected} />}

      {selected && !selected.availability?.can_submit_referral && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          <p>
            No doctor is currently available at {selected.name}. Choose another
            facility, or finalize to save the consultation with this referral
            marked Awaiting Doctor Availability / Not Yet Submitted.
          </p>
          {alternatives.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {alternatives.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  disabled={disabled}
                  onClick={() => onChange(String(d.id))}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2]"
                >
                  Choose {d.name}
                </button>
              ))}
            </div>
          )}
          <p className="text-xs">
            A hold is an administrative state, not an appointment or assurance
            that waiting is safe.
          </p>
        </div>
      )}
    </div>
  );
}
