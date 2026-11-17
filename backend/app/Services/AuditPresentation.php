<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Support\Str;

/** Read-only presentation: stored event identifiers and historical descriptions stay intact. */
class AuditPresentation
{
    // Historical handoff decisions share the `updated` code. Match only their
    // known, anchored message formats; never echo free-text notes into the table.
    public const DETAIL_VARIANTS = [
        ['module' => 'users', 'action' => 'updated', 'prefix' => 'Activated account ', 'action_label' => 'Account Activated', 'summary' => 'Activated a user account.'],
        ['module' => 'users', 'action' => 'updated', 'prefix' => 'Deactivated account ', 'action_label' => 'Account Deactivated', 'summary' => 'Deactivated a user account.'],
        ['module' => 'monitoring_handoff_requests', 'action' => 'updated', 'prefix' => 'Accepted monitoring handoff ', 'action_label' => 'Monitoring Handoff Accepted', 'summary' => 'Accepted a patient monitoring handoff.'],
        ['module' => 'monitoring_handoff_requests', 'action' => 'updated', 'prefix' => 'Declined monitoring handoff ', 'action_label' => 'Monitoring Handoff Declined', 'summary' => 'Declined a patient monitoring handoff.'],
    ];

    public const MODULES = [
        'auth' => ['Authentication', 'Authentication', 'Account'],
        'users' => ['Account Management', 'Account Management', 'Account'],
        'facility_assignments' => ['Staff Assignments', 'Account Management', 'Staff Assignment'],
        'providers' => ['Doctor Roster', 'Account Management', 'Doctor'],
        'health_record_drafts' => ['Consultations', 'Consultations', 'Consultation Draft'],
        'health_records' => ['Health Records', 'Consultations', 'Health Record'],
        'rhu_visit_queue' => ['Visit Queue', 'Consultations', 'Visit'],
        'patients' => ['Patient Management', 'Patient Management', 'Patient'],
        'households' => ['Households', 'Patient Management', 'Household'],
        'referrals' => ['Referrals', 'Referrals', 'Referral'],
        'referral_holds' => ['Referral Holds', 'Referrals', 'Referral Hold'],
        'follow_up_tasks' => ['Follow-ups', 'Consultations', 'Follow-up'],
        'monitoring_handoff_requests' => ['Monitoring Handoffs', 'Referrals', 'Monitoring Handoff'],
        'condition_monitorings' => ['Condition Monitoring', 'Patient Management', 'Condition Monitoring'],
        'monitoring_laboratory_evidence' => ['Monitoring Laboratory Results', 'Patient Management', 'Monitoring Laboratory Result'],
        'laboratory_tests' => ['Laboratory Tests', 'Consultations', 'Laboratory Test'],
        'laboratory_addenda' => ['Laboratory Corrections', 'Consultations', 'Laboratory Correction'],
        'tb_case_endorsements' => ['TB Case Endorsements', 'Referrals', 'TB Case Endorsement'],
        'tb_dr_referrals' => ['Drug-resistant TB Referrals', 'Referrals', 'Drug-resistant TB Referral'],
        'tb_case_clinical_events' => ['TB Case Follow-ups', 'Consultations', 'TB Case Follow-up'],
        'tb_monitoring' => ['TB Monitoring', 'Patient Management', 'TB Monitoring Entry'],
        'medicines' => ['Medicine and Supply', 'Medicine and Supply', 'Medicine'],
        'inventory' => ['Medicine and Supply', 'Medicine and Supply', 'Inventory'],
        'barangay_health_centers' => ['Barangay Health Centers', 'System', 'Barangay Health Center'],
        'rural_health_units' => ['Rural Health Units', 'System', 'Rural Health Unit'],
        'rhu_patient_volume' => ['RHU Patient Volume', 'System', 'RHU Patient Volume'],
        'reports' => ['Reports', 'System', 'Report'],
        'security' => ['Security', 'Security', 'Security Event'],
        'system' => ['System', 'System', 'System Event'],
    ];

    private const ACTIONS = [
        'login' => ['User Logged In', 'User successfully signed in to AKAY.'],
        'logout' => ['User Logged Out', 'User signed out of AKAY.'],
        'password changed' => ['Password Changed', 'Changed the account password.'],
        'password reset completed' => ['Password Reset Completed', 'Reset the account password.'],
        'password reset requested' => ['Password Reset Requested', 'Requested a password reset.'],
        'password reset approved' => ['Password Reset Approved', 'Approved a password reset request.'],
        'password reset rejected' => ['Password Reset Rejected', 'Rejected a password reset request.'],
        'account invite completed' => ['Account Invitation Accepted', 'Accepted the invitation and completed account setup.'],
        'account invite sent' => ['Account Invitation Sent', 'Created an account invitation; delivery status is recorded separately.'],
        'account invite resent' => ['Account Invitation Resent', 'Requested another account invitation delivery.'],
        'account invite email changed' => ['Invitation Email Changed', 'Changed the email address for an account invitation.'],
        'temporary password issued' => ['Temporary Password Issued', 'Issued a temporary account password.'],
        'reset link resent' => ['Password Reset Link Resent', 'Requested another password reset link delivery.'],
        'reset link copied' => ['Password Reset Link Copied', 'Retrieved a password reset link.'],
        'draft_created' => ['Consultation Draft Created', "Created a patient's consultation draft."],
        'draft_updated' => ['Consultation Draft Updated', "Updated a patient's consultation draft."],
        'draft_resumed' => ['Consultation Draft Resumed', 'Opened a saved consultation draft to continue work.'],
        'draft_discarded' => ['Consultation Draft Discarded', 'Discarded a consultation draft.'],
        'draft_consumed' => ['Consultation Draft Finalized', 'Used the draft to save a completed consultation record.'],
        'draft_claimed' => ['Consultation Draft Claimed', 'Started an editing session for a consultation draft.'],
        'draft_taken_over' => ['Consultation Draft Taken Over', 'Took over editing a consultation draft.'],
        'draft_submitted' => ['Consultation Draft Submitted', 'Submitted a consultation draft for review.'],
        'draft_returned' => ['Consultation Draft Returned', 'Returned a consultation draft for correction.'],
        'draft_expired' => ['Consultation Draft Expired', 'Automatically expired a saved consultation draft.'],
        'expired_drafts_pruned' => ['Old Consultation Draft Removed', 'Automatically removed an old draft after its retention period.'],
        'correction_added' => ['Record Correction Added', 'Added a correction to a saved health record.'],
        'medicine_created' => ['Medicine Added', 'Added a medicine inventory entry.'],
        'medicine_updated' => ['Medicine Updated', 'Updated medicine inventory information.'],
        'medicine_restocked' => ['Medicine Stock Added', 'Added stock to the medicine inventory.'],
        'medicine_dispensed' => ['Medicine Dispensed', 'Recorded medicine dispensing.'],
        'medicine_adjusted' => ['Medicine Stock Adjusted', 'Adjusted the medicine stock quantity.'],
        'medicine_disposed' => ['Medicine Stock Disposed', 'Recorded disposal of medicine stock.'],
        'medicine_quarantine' => ['Medicine Stock Quarantined', 'Moved medicine stock into quarantine.'],
        'medicine_release' => ['Medicine Stock Released', 'Released medicine stock from quarantine.'],
        'medicine_quarantine_disposal' => ['Quarantined Medicine Disposed', 'Recorded disposal of quarantined medicine stock.'],
        'medicine_verify_stock' => ['Medicine Stock Verified', 'Verified the recorded medicine stock quantities.'],
        'medicine_archived' => ['Medicine Archived', 'Archived a medicine inventory entry.'],
        'medicine_deleted' => ['Unused Medicine Deleted', 'Deleted an unused medicine inventory entry.'],
        'inventory_corrected' => ['Inventory Corrected', 'Corrected the recorded inventory quantity.'],
        'inventory_adjusted' => ['Inventory Adjusted', 'Adjusted the medicine inventory quantity.'],
        'service_usage_reconciled' => ['Service Supplies Reconciled', 'Reconciled supplies used for a service.'],
        'referral_rescheduled' => ['Referral Rescheduled', 'Rescheduled a patient referral.'],
        'status_updated' => ['Referral Status Updated', 'Updated the status of a patient referral.'],
        'feedback_completed' => ['Referral Completed', 'Completed a referral with RHU feedback.'],
        'late_arrival_received' => ['Late Arrival Received', 'Received a patient who arrived after being marked as no-show.'],
        'automatic_no_show' => ['Referral Marked No-show Automatically', 'Automatically marked a referral as no-show.'],
        'visit_closed' => ['Visit Closed', 'Closed a patient visit.'],
        'visit_completed' => ['Visit Completed', 'Completed a visit by finalizing the consultation.'],
        'assignment_created' => ['Staff Assignment Added', 'Assigned an account to a facility.'],
        'assignment_revoked' => ['Staff Assignment Revoked', 'Revoked a staff facility assignment.'],
        'provider_created' => ['Doctor Added to Roster', 'Added a doctor to the facility roster.'],
        'provider_updated' => ['Doctor Roster Updated', 'Updated doctor roster information.'],
        'provider_deactivated' => ['Doctor Deactivated', 'Deactivated a doctor roster entry.'],
        'provider_availability_changed' => ['Doctor Availability Changed', 'Changed a doctor’s availability.'],
        'provider_unavailability_created' => ['Doctor Unavailability Added', 'Recorded a period of doctor unavailability.'],
        'provider_unavailability_updated' => ['Doctor Unavailability Updated', 'Updated a period of doctor unavailability.'],
        'provider_unavailability_deleted' => ['Doctor Unavailability Removed', 'Removed a period of doctor unavailability.'],
        'follow_up_scheduled' => ['Follow-up Scheduled', 'Scheduled a patient follow-up.'],
    ];

    public static function title(?string $value): string
    {
        return Str::title(str_replace(['_', '-'], ' ', trim($value ?? ''))) ?: 'Unspecified';
    }

    public static function event(string $action, string $module): array
    {
        [$moduleLabel, $category, $subject] = self::MODULES[$module] ?? [self::title($module), 'Other', self::title($module)];
        [$label, $summary] = self::ACTIONS[$action] ?? [null, null];
        $special = match ($module.':'.$action) {
            'patients:created' => ['Patient Registered', 'Registered a patient in AKAY.'],
            'patients:updated' => ['Patient Information Updated', "Updated a patient's information."],
            'health_records:created' => ['Consultation Completed', "Completed and saved a patient's consultation record."],
            'referrals:submitted' => ['Referral Created', 'Created and submitted a patient referral.'],
            'referrals:acknowledged' => ['Shared Referral Acknowledged', 'Acknowledged shared referral information.'],
            'users:updated' => ['Account Updated', 'Updated account information or access settings.'],
            default => null,
        };
        if ($special) {
            [$label, $summary] = $special;
        }
        $label ??= in_array($action, ['created', 'updated', 'deactivated', 'discarded', 'generated', 'rescheduled', 'cancelled', 'verified', 'discontinued', 'no_show'], true)
            ? $subject.' '.self::title($action) : self::title($action);
        // Never echo arbitrary historical descriptions containing clinical data or technical metadata.
        $summary ??= $label.' ('.$moduleLabel.').';

        return ['action_label' => $label, 'module_label' => $moduleLabel, 'summary' => $summary, 'category' => $category];
    }

    public static function row(AuditLog $log): array
    {
        $presentation = self::event($log->action, $log->module);
        foreach (self::DETAIL_VARIANTS as $variant) {
            if ($log->module === $variant['module'] && $log->action === $variant['action']
                && str_starts_with($log->description ?? '', $variant['prefix'])) {
                $presentation['action_label'] = $variant['action_label'];
                $presentation['summary'] = $variant['summary'];
                break;
            }
        }
        $system = $log->user_id === null && (
            ($log->action === 'automatic_no_show' && $log->module === 'referrals')
            || (in_array($log->action, ['draft_expired', 'expired_drafts_pruned'], true) && $log->module === 'health_record_drafts')
        );
        $tier = match ($log->user?->role) {
            'admin' => 'Admin', 'bhc' => 'BHC', 'rhu' => 'RHU', default => null
        };
        $staff = StaffRoles::label($log->user?->staff_role);

        return [...$log->toArray(), ...$presentation,
            'actor_name' => $log->user?->name ?: ($system ? 'System' : 'Not recorded'),
            'role_label' => $tier ? ($staff ? $tier.' · '.$staff : $tier) : ($system ? 'System' : 'Not recorded'),
        ];
    }
}
