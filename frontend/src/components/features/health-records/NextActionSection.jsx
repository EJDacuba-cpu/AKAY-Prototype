import { CalendarClock, Check, CircleSlash, Share2 } from "lucide-react";

import { TimePickerField } from "../../common/forms/DatePickerField";
import {
  ClinicalFieldGroup,
  FieldInput,
  FieldTextarea,
} from "./fields/ClinicalFields";
import {
  NEXT_ACTION_NONE,
  NEXT_ACTION_REFERRAL,
  NEXT_ACTION_SCHEDULE,
} from "../../../utils/nextAction";

function buildActionCards({ referralTitle, referralBody }) {
  return [
    {
      key: NEXT_ACTION_NONE,
      icon: CircleSlash,
      title: "No Follow-up",
      body: "No follow-up needed at this time.",
    },
    {
      key: NEXT_ACTION_SCHEDULE,
      icon: CalendarClock,
      title: "Schedule Follow-up",
      body: "Schedule a return visit for this patient.",
    },
    {
      key: NEXT_ACTION_REFERRAL,
      icon: Share2,
      title: referralTitle,
      body: referralBody,
    },
  ];
}

function ActionCard({ card, selected, disabled, onSelect }) {
  const Icon = card.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(card.key)}
      disabled={disabled}
      aria-pressed={selected}
      className={`relative rounded-xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        selected
          ? "border-[#B91C1C] bg-[#FEF2F2] ring-2 ring-[#B91C1C]/10"
          : "border-[#E8ECF0] bg-white hover:border-[#FECACA] hover:bg-[#FEF2F2]/40"
      }`}
    >
      <Icon size={22} className={selected ? "text-[#B91C1C]" : "text-[#64748B]"} />
      <span className="mt-3 block text-sm font-bold text-[#0F172A]">
        {card.title}
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-[#64748B]">
        {card.body}
      </span>
      {selected && (
        <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#B91C1C] text-white">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/**
 * The single place a visit's disposition is decided.
 *
 * This replaces the four near-identical "Follow-up & Referral" blocks the BHC
 * and RHU record pages each grew - one per program - which all wrote the same
 * `followUpStatus` / `followUpDate` / `followUpTime` / `needsReferral` state
 * through slightly different controls.
 *
 * The three cards are mutually exclusive, matching what the server already
 * enforces (a referral cancels any unfulfilled follow-up task). The referral
 * card reveals only the three narrative fields; the logistics of a referral -
 * receiving facility, urgency, preferred doctor, and the DOC-14 provider gate -
 * stay on the dedicated referral step that follows, because that step's
 * submission gate depends on them.
 *
 * `scheduleNotice` lets a program suppress the date inputs with an explanation:
 * the EPI flow uses it when a record will complete the child's schedule and no
 * further visit is required.
 */
export default function NextActionSection({
  action,
  followUpDate,
  followUpTime,
  monitoringNotes,
  monitoringNotesLabel = "Monitoring and Follow-up Notes",
  monitoringNotesPlaceholder = "Write the monitoring plan or return-visit instructions...",
  referralForm = {},
  errors = {},
  disabled = false,
  requireFollowUpTime = false,
  requireFollowUpDate = true,
  // The RHU page records an onward-referral flag only: it has no referral form,
  // no referral step, and no followUpTime field to write to. These let it reuse
  // the same card grid without inventing state it never submits.
  showReferralFields = true,
  showFollowUpTime = true,
  referralTitle = "Referral",
  referralBody = "Refer to the RHU for further management.",
  scheduleNotice = null,
  legacyStatusNote = null,
  onActionChange,
  onFollowUpDateChange,
  onFollowUpTimeChange,
  onMonitoringNotesChange,
  onReferralFieldChange,
}) {
  const scheduling = action === NEXT_ACTION_SCHEDULE;
  const referring = action === NEXT_ACTION_REFERRAL && showReferralFields;
  const actionCards = buildActionCards({ referralTitle, referralBody });

  return (
    <div className="space-y-5">
      <div data-field="followUpStatus" tabIndex={errors.followUpStatus ? -1 : undefined}>
        <div className="grid gap-3 md:grid-cols-3">
          {actionCards.map((card) => (
            <ActionCard
              key={card.key}
              card={card}
              selected={action === card.key}
              disabled={disabled}
              onSelect={onActionChange}
            />
          ))}
        </div>
        {errors.followUpStatus && (
          <p className="mt-2 text-[11px] font-medium text-[#B91C1C]">
            {errors.followUpStatus}
          </p>
        )}
        {legacyStatusNote}
      </div>

      {scheduling && (
        <ClinicalFieldGroup
          title="Follow-up Schedule"
          subtitle="Set when this patient should return."
        >
          {scheduleNotice || (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <FieldInput
                  label="Follow-up Date"
                  type="date"
                  required={requireFollowUpDate}
                  name="followUpDate"
                  value={followUpDate}
                  error={errors.followUpDate}
                  disabled={disabled}
                  onChange={(event) => onFollowUpDateChange(event.target.value)}
                />
                {showFollowUpTime && (
                  <TimePickerField
                    label="Follow-up Time"
                    name="followUpTime"
                    required={requireFollowUpTime}
                    value={followUpTime}
                    error={errors.followUpTime}
                    onChange={onFollowUpTimeChange}
                  />
                )}
              </div>
              <div className="mt-4">
                <FieldTextarea
                  label={monitoringNotesLabel}
                  value={monitoringNotes}
                  onChange={(event) =>
                    onMonitoringNotesChange(event.target.value)
                  }
                  placeholder={monitoringNotesPlaceholder}
                  rows={3}
                />
              </div>
            </>
          )}
        </ClinicalFieldGroup>
      )}

      {action === NEXT_ACTION_NONE && (
        <ClinicalFieldGroup
          title="Visit Notes"
          subtitle="Optional closing notes for this visit."
        >
          <FieldTextarea
            label={monitoringNotesLabel}
            value={monitoringNotes}
            onChange={(event) => onMonitoringNotesChange(event.target.value)}
            placeholder={monitoringNotesPlaceholder}
            rows={3}
          />
        </ClinicalFieldGroup>
      )}

      {referring && (
        <ClinicalFieldGroup
          title="Referral Details"
          subtitle="Describe the case for the receiving RHU. Facility, urgency and preferred doctor are set on the next step."
        >
          <div className="space-y-4">
            <FieldTextarea
              label="Initial Diagnosis"
              name="initialDiagnosis"
              value={referralForm.initialDiagnosis || ""}
              error={errors.initialDiagnosis}
              onChange={(event) =>
                onReferralFieldChange("initialDiagnosis", event.target.value)
              }
              placeholder="Enter initial diagnosis..."
              rows={2}
            />
            <FieldTextarea
              label="Initial Actions Taken"
              name="initialActionsTaken"
              value={referralForm.initialActionsTaken || ""}
              error={errors.initialActionsTaken}
              onChange={(event) =>
                onReferralFieldChange("initialActionsTaken", event.target.value)
              }
              placeholder="Enter initial actions taken..."
              rows={3}
            />
            <FieldTextarea
              label="Reason for Referral"
              required
              name="reasonForReferral"
              value={referralForm.reasonForReferral || ""}
              error={errors.reasonForReferral}
              onChange={(event) =>
                onReferralFieldChange("reasonForReferral", event.target.value)
              }
              placeholder="State the reason or concern requiring RHU review..."
              rows={3}
            />
          </div>
        </ClinicalFieldGroup>
      )}
    </div>
  );
}
