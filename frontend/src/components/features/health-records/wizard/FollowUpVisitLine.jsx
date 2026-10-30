import { formatDate } from '../../../../utils/formatters';
import { CARE_OUTCOMES } from '../../../../utils/conditionCards';
import { continuedPurposeKey } from '../../../../utils/continuedConcerns';
import { isScheduledServiceFollowUp } from '../../../../utils/followUpSchedules';
import { Button } from '../../../ui/button';
import { TimePickerField } from '../../../common/forms/DatePickerField';
import { FieldError, FieldInput, FieldTextarea, RadioChoiceGroup } from '../fields/ClinicalFields';

const OPTIONS = Object.entries(CARE_OUTCOMES).map(([value, label]) => ({ value, label }));

/** A saved decision completes the selected task only when the visit finalizes. */
export default function FollowUpVisitLine({ followUps = [], decisions = [], schedules = [], errors = {}, legacyConditionNames = [], onRemove, onOutcomeChange, onScheduleChange, disabled = false }) {
  const serviceFollowUps = followUps.filter(isScheduledServiceFollowUp);
  const concernFollowUps = followUps.filter((task) => !isScheduledServiceFollowUp(task));
  if (followUps.length === 0) return null;
  return (
    <>
      {serviceFollowUps.length > 0 ? (
        <section aria-label="Linked scheduled follow-ups" className="space-y-4">
          {serviceFollowUps.map((task) => (
            <section key={task.id} aria-labelledby={`linked-follow-up-${task.id}`} className="min-w-0 space-y-2 border-t border-border pt-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 id={`linked-follow-up-${task.id}`} className="text-sm font-semibold text-foreground">Linked Scheduled Follow-up · FU-{task.id}</h3>
                  <p className="mt-1 break-words text-sm text-foreground">{task.purpose || task.reason || 'Scheduled follow-up'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Previous consultation: {formatDate(task.sourceDate, 'Not recorded')}</p>
                </div>
                {onRemove ? (
                  <Button type="button" variant="link" size="sm" disabled={disabled} onClick={() => onRemove(task.id)} aria-label={`Remove link to follow-up FU-${task.id}`}>Remove link</Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Next action for this service is under Selected Health Services. Finalizing fulfills FU-{task.id}. This does not mark a condition recovered, complete a pregnancy, or end ongoing monitoring.
              </p>
            </section>
          ))}
        </section>
      ) : null}
      {concernFollowUps.length > 0 ? (
        <section aria-label="Continued concerns" className="space-y-4" data-field="care_plan.continued_concerns">
          <FieldError error={errors['care_plan.continued_concerns']} />
          {concernFollowUps.map((task) => {
            const key = continuedPurposeKey(task.id);
            const field = `continuedConcern.${task.id}.careOutcome`;
            const outcome = decisions.find((item) => Number(item.taskId) === Number(task.id))?.careOutcome || '';
            const schedule = schedules.find((item) => item.purposeKey === key) || { date: '', time: '', purpose: '' };
            return (
              <section key={task.id} aria-labelledby={`continued-${task.id}`} className="min-w-0 space-y-3 border-t border-border pt-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 id={`continued-${task.id}`} className="text-sm font-semibold text-foreground">Continued Concern · FU-{task.id}</h3>
                    <p className="mt-1 break-words text-sm text-foreground">{task.purpose || task.reason || 'Follow-up visit'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Previous consultation: {formatDate(task.sourceDate, 'Not recorded')}</p>
                  </div>
                  {onRemove ? (
                    <Button type="button" variant="link" size="sm" disabled={disabled} onClick={() => onRemove(task.id)} aria-label={`Remove link to follow-up FU-${task.id}`}>Remove link</Button>
                  ) : null}
                </div>
                <dl className="space-y-1 text-xs text-muted-foreground">
                  <div className="break-words"><dt className="inline font-medium">Previous Chief Complaint: </dt><dd className="inline whitespace-pre-wrap">{task.sourceChiefComplaint || 'Not recorded'}</dd></div>
                  <div className="break-words"><dt className="inline font-medium">Previous findings: </dt><dd className="inline whitespace-pre-wrap">{task.sourceAssessment || 'Not recorded'}</dd></div>
                </dl>
                <fieldset disabled={disabled} data-field={field}>
                  <RadioChoiceGroup label="Care Outcome" name={field} required inline options={OPTIONS} value={outcome} error={errors[field]} onChange={(value) => onOutcomeChange?.(task.id, value)} />
                </fieldset>
                {outcome === 'managed_at_bhc' && <p className="text-xs text-muted-foreground">No additional follow-up for this concern. This does not mark a condition recovered or end ongoing monitoring.</p>}
                {outcome === 'refer_to_rhu' && <p className="text-xs text-muted-foreground">Included in the RHU referral below. Complete the shared referral details.</p>}
                {outcome === 'bhc_follow_up' && (
                  <fieldset disabled={disabled} className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <FieldInput label="Follow-up Date" required type="date" name={`followUpSchedule.${key}.date`} value={schedule.date} error={errors[`followUpSchedule.${key}.date`]} onChange={(event) => onScheduleChange(task.id, { ...schedule, date: event.target.value })} />
                      <TimePickerField label="Follow-up Time (optional)" name={`followUpSchedule.${key}.time`} value={schedule.time || ''} error={errors[`followUpSchedule.${key}.time`]} disabled={disabled} onChange={(time) => onScheduleChange(task.id, { ...schedule, time })} />
                    </div>
                    <FieldTextarea label="Follow-up Reason" required maxLength={150} rows={2} name={`followUpSchedule.${key}.purpose`} value={schedule.purpose} error={errors[`followUpSchedule.${key}.purpose`]} onChange={(event) => onScheduleChange(task.id, { ...schedule, purpose: event.target.value })} />
                  </fieldset>
                )}
                <p className="text-xs text-muted-foreground">Finalizing saves this decision and fulfills FU-{task.id}. Unselected follow-ups stay pending.</p>
              </section>
            );
          })}
        </section>
      ) : null}
      {legacyConditionNames.map((name) => <p key={name} className="text-xs text-muted-foreground">{name} (Legacy — Pending RHU Verification) is not continued as monitoring.</p>)}
    </>
  );
}
