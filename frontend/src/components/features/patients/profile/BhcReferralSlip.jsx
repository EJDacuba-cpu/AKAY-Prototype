import { useState } from "react";

import { ReferralStatusChip } from "./ProfileChip";
import BodyPreviewPanel, { BodyFindingsList } from "../../health-records/wizard/BodyPreviewPanel";
import { formatDisplayValue, formatPatientName, formatReferralStatus } from "../../../../utils/formatters";
import { getPatientAge, getPatientBirthDate } from "../../../../utils/patientProfile";
import { referralSlipModel } from "../../../../utils/referralSlipView";

function Field({ label, value, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className={`mt-1 break-words text-[13px] text-neutral-900 ${mono ? "font-mono" : ""}`}>
        {value ? value : <span className="text-neutral-500">Not recorded</span>}
      </dd>
    </div>
  );
}

function Narrative({ label, value, empty }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</h3>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-900">
        {value ? value : <span className="text-neutral-500">{empty}</span>}
      </p>
    </section>
  );
}

function missingClinical(slip, empty) {
  return slip.missingLinkedRecord
    ? "Unavailable without the linked BHC health record. This can still exist even when RHU Health Records is empty."
    : empty;
}

export default function BhcReferralSlip({ referral = null, record = null, patient = null }) {
  const slip = referralSlipModel(referral, record);
  const trackingId = slip.trackingId || referral?.id;
  const name = formatPatientName(patient || referral?.patient, "");
  const age = getPatientAge(patient || referral?.patient);
  const identity = [name, age !== "" ? `${age} yrs` : "", (patient || referral?.patient)?.sex]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-5 shadow-card sm:p-6">
      <header className="flex flex-col gap-3 border-b border-neutral-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.5rem] font-bold leading-tight tracking-tight text-ink-800">
            Referral Slip
          </h1>
          <p className="mt-1 font-mono text-[13px] text-neutral-600">{trackingId || "Tracking ID not recorded"}</p>
        </div>
        <ReferralStatusChip status={referral?.status} />
      </header>

      <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Referral date / time" value={slip.dateTime} />
        <Field label="Referring BHC" value={slip.referringHci} />
        <Field label="Destination RHU" value={slip.receivingFacility} />
        <Field label="Referring practitioner" value={slip.practitioner} />
        <Field
          label="Referral status"
          value={formatReferralStatus(formatDisplayValue(referral?.status, ""), "")}
        />
        <Field label="Patient" value={identity} />
      </dl>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="space-y-5">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
            Clinical referral information
          </h2>
          <Narrative
            label="Referred concerns / services"
            value={slip.services}
            empty="No referred concern recorded on this slip."
          />
          <Narrative label="Reason for referral" value={slip.reason} empty="No reason for referral recorded." />
          <Narrative label="Chief complaint" value={slip.chiefComplaint} empty="No chief complaint recorded." />
          <Narrative
            label="History of present illness"
            value={slip.historyOfPresentIllness}
            empty={missingClinical(slip, "No history of present illness recorded.")}
          />
          <Narrative
            label="Original BHC physical examination"
            value={slip.physicalExam}
            empty={missingClinical(slip, "No physical examination recorded.")}
          />
          <Narrative
            label="BHC treatment / actions taken"
            value={slip.actions}
            empty="No treatment or action taken recorded."
          />
        </div>

        <div className="relative min-w-0 space-y-6 overflow-hidden">
          <BhcExaminationPanel slip={slip} record={record} patient={patient || referral?.patient} />
        </div>
      </div>
    </article>
  );
}

function BhcExaminationPanel({ slip, record, patient }) {
  const [side, setSide] = useState("front");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Examination findings</h2>
        {!record ? (
          <p className="mt-3 text-[13px] text-neutral-500">
            Body findings are unavailable without the linked BHC health record. RHU Health Records may still be empty.
          </p>
        ) : (
          <div className="mt-3">
            <BodyPreviewPanel
              findings={slip.bodyFindings}
              readOnly
              sticky={false}
              onChange={() => {}}
              dialog={null}
              onDialogChange={() => {}}
              sex={patient?.sex}
              birthDate={getPatientBirthDate(patient)}
              side={side}
              onSideChange={setSide}
            />
            {slip.bodyFindings.length > 0 ? (
              <BodyFindingsList findings={slip.bodyFindings} readOnly />
            ) : (
              <p className="mt-3 text-[13px] text-neutral-500">No body findings recorded on this BHC encounter.</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Vital signs</h2>
        {!record ? (
          <p className="mt-3 text-[13px] text-neutral-500">
            Vital signs are unavailable without the linked BHC health record.
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {slip.vitals.map((item) => (
              <Field key={item.label} label={item.label} value={item.value} />
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
