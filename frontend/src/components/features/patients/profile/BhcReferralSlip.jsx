import { useState } from "react";

import { EmptyNote, FieldList, ProfileSection } from "./ProfileSection";
import { ProfileStatusChip } from "./ProfileChip";
import BodyPreviewPanel from "../../health-records/wizard/BodyPreviewPanel";
import { formatDate, formatDisplayValue } from "../../../../utils/formatters";
import { getPatientBirthDate } from "../../../../utils/patientProfile";
import { getReferralDate } from "./FollowUpsAndReferrals";
import { referralSlipModel } from "../../../../utils/referralSlipView";

function Narrative({ label, value, empty }) {
  return (
    <div>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
        {value ? value : <span className="text-neutral-500">{empty}</span>}
      </p>
    </div>
  );
}

function ReferralBodyFindings({ record, sex, birthDate, findings }) {
  const [side, setSide] = useState("front");
  if (!record) {
    return (
      <EmptyNote>
        Body findings are unavailable because this referral has no linked BHC health record.
      </EmptyNote>
    );
  }

  return (
    <div className="mt-4">
      <BodyPreviewPanel
        findings={findings}
        readOnly
        onChange={() => {}}
        dialog={null}
        onDialogChange={() => {}}
        sex={sex}
        birthDate={birthDate}
        side={side}
        onSideChange={setSide}
      />
      {findings.length === 0 && (
        <EmptyNote>No body findings recorded on this referral visit.</EmptyNote>
      )}
    </div>
  );
}

export default function BhcReferralSlip({
  referral = null,
  record = null,
  patient = null,
  loading = false,
  missing = false,
  unauthorized = false,
}) {
  if (loading) {
    return (
      <ProfileSection id="bhc-referral-slip" title="BHC Referral Slip">
        <EmptyNote>Loading the referral slip...</EmptyNote>
      </ProfileSection>
    );
  }

  if (unauthorized) {
    return (
      <ProfileSection id="bhc-referral-slip" title="BHC Referral Slip">
        <EmptyNote>Clinical referral details are restricted to authorized RHU users.</EmptyNote>
      </ProfileSection>
    );
  }

  if (missing || !referral) {
    return (
      <ProfileSection id="bhc-referral-slip" title="BHC Referral Slip">
        <EmptyNote>
          {missing
            ? "The referral linked to this visit could not be loaded."
            : "Select a referral to review the BHC slip."}
        </EmptyNote>
      </ProfileSection>
    );
  }

  const slip = referralSlipModel(referral, record);
  const trackingId = referral.trackingId || referral.id;
  const vitals = slip.vitals.map((item) => [item.label, item.value]);

  return (
    <ProfileSection
      id="bhc-referral-slip"
      title="BHC Referral Slip"
      meta={trackingId ? String(trackingId) : null}
      actions={<ProfileStatusChip status={referral.status} />}
    >
      <FieldList
        rows={[
          ["Date of referral", getReferralDate(referral)],
          ["Referring BHC", formatDisplayValue(slip.referringHci, "")],
          ["Referred concerns / services", formatDisplayValue(slip.services, "")],
          ["Referring practitioner", formatDisplayValue(slip.practitioner, "")],
        ]}
      />

      <div className="mt-5 space-y-4 border-t border-neutral-100 pt-4">
        <Narrative label="Reason for referral" value={slip.reason} empty="No reason for referral recorded." />
        <Narrative label="Chief complaint" value={slip.chiefComplaint} empty="No chief complaint recorded." />
        <Narrative
          label="History of present illness"
          value={slip.historyOfPresentIllness}
          empty={
            slip.missingLinkedRecord
              ? "History of present illness is unavailable without the linked BHC health record."
              : "No history of present illness recorded."
          }
        />
        <Narrative
          label="Physical examination"
          value={slip.physicalExam}
          empty={
            slip.missingLinkedRecord
              ? "Physical examination is unavailable without the linked BHC health record."
              : "No physical examination recorded."
          }
        />
        <Narrative label="Documented actions" value={slip.actions} empty="No treatment or action taken recorded." />
      </div>

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <p className="mb-3 text-sm font-semibold text-neutral-900">Vital signs</p>
        {slip.missingLinkedRecord ? (
          <EmptyNote>Vital signs are unavailable without the linked BHC health record.</EmptyNote>
        ) : (
          <FieldList rows={vitals} />
        )}
      </div>

      <div className="mt-5 border-t border-neutral-100 pt-4">
        <p className="text-sm font-semibold text-neutral-900">Body findings</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Recorded on this referral visit only. {formatDate(referral.referralDateTime || referral.date || referral.createdAt, "")}
        </p>
        <ReferralBodyFindings
          record={record}
          findings={slip.bodyFindings}
          sex={patient?.sex}
          birthDate={getPatientBirthDate(patient)}
        />
      </div>
    </ProfileSection>
  );
}
