import { CalendarClock, Check, CircleSlash, Share2 } from "lucide-react";

import { TimePickerField } from "../../common/forms/DatePickerField";
import {
  ClinicalFieldGroup,
  FieldInput,
  FieldTextarea,
  RadioChoiceGroup,
} from "./fields/ClinicalFields";
import {
  ATTENTION_LEVELS,
  DEFAULT_ATTENTION,
} from "../../../utils/referralAttention";
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
      title: "No Follow-up or Referral Required",
      body: "No follow-up needed at this time.",
    },
    {
      key: NEXT_ACTION_SCHEDULE,
      icon: CalendarClock,
      title: "Follow-up Required",
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
  followUpReason = "",
  showFollowUpReason = false,
  monitoringNotes,
  monitoringNotesLabel = "Monitoring and Follow-up Notes",
  monitoringNotesPlaceholder = "Write the monitoring plan or return-visit instructions...",
  referralForm = {},
  // Receiving-facility picker plus its read-only availability panel; supplied
  // by the page because it owns the facility state.
  referralFacilityField = null,
  errors = {},
  disabled = false,
  requireFollowUpTime = false,
  requireFollowUpDate = true,
  // The RHU page records an onward-referral flag only: it has no referral form,
  // no referral step, and no followUpTime field to write to. These let it reuse
  // the same card grid without inventing state it never submits.
  showReferralFields = true,
  showFollowUpTime = true,
  referralTitle = "Refer to RHU",
  referralBody = "Refer to the RHU for further management.",
  scheduleNotice = null,
  legacyStatusNote = null,
  onActionChange,
  onFollowUpDateChange,
  onFollowUpTimeChange,
  onFollowUpReasonChange,
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
          title="Follow-up Details"
          subtitle="Set when and why this patient should return."
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
              {showFollowUpReason && (
                <div className="mt-4">
                  <FieldTextarea
                    label="Follow-up Reason"
                    required
                    name="followUpReason"
                    value={followUpReason}
                    error={errors.followUpReason}
                    disabled={disabled}
                    onChange={(event) =>
                      onFollowUpReasonChange(event.target.value)
                    }
                    placeholder="Why should the patient return?"
                    rows={2}
                  />
                </div>
              )}
            </>
          )}
        </ClinicalFieldGroup>
      )}

      {referring && (
        <ClinicalFieldGroup
          title="Referral Details"
          subtitle="The RHU receives the referral and assigns the practitioner. RHU staff determine queue order."
        >
          <div className="space-y-4">
            {referralFacilityField}
            <RadioChoiceGroup
              label="Referral Priority"
              name="urgencyLevel"
              required
              inline
              options={ATTENTION_LEVELS}
              value={referralForm.urgencyLevel || DEFAULT_ATTENTION}
              error={errors.urgencyLevel}
              onChange={(value) => onReferralFieldChange("urgencyLevel", value)}
              helperText="Workflow handling only. The RHU decides queue order."
            />
            <FieldTextarea
              label="Reason for Referral"
              required
              name="reasonForReferral"
              value={referralForm.reasonForReferral || ""}
              error={errors.reasonForReferral}
              disabled={disabled}
              onChange={(event) =>
                onReferralFieldChange("reasonForReferral", event.target.value)
              }
              placeholder="State the reason or concern requiring RHU review..."
              rows={3}
            />
          </div>
        </ClinicalFieldGroup>
      )}

      {action && (
        <ClinicalFieldGroup
          title="Additional Clinical Notes"
          subtitle="Optional internal notes for this consultation."
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
    </div>
  );
}
