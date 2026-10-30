# Account, facilities, assignments and routing revision

Approved 2026-09-23. Supersedes the earlier single-page account form, general additional-facility assignment design, and fixed single receiving RHU rule.

- Account setup: Account Type → Personal Details → Home Facility → Access & Permissions → Review & Create. Admin accounts skip clinical facility/access steps. MHO explicitly confirms permissions. No assignments in account creation.
- Facilities owns BHC/RHU details and referral destinations. Existing BHC `rural_health_unit_id` remains the default; `bhc_referral_destinations` holds approved alternatives. Historical referral rows are unchanged.
- Staff Assignments owns additional BHC access for active RHU-based nurses only. Required start; temporary requires end; ongoing ends on revocation. No automatic assignment or routing changes.
- Assignment rows retain revocation history. Existing undated rows are retained but revoked for explicit review. Existing accounts are not promoted to clinical access.
- Referral preparation selects a receiving RHU from the approved list. Provider availability, submission, receiving staff notifications, holds, and slips follow that selected RHU. No automatic destination switch or submission.
- Account Directory: Account, Designation, Access Profile, Home Facility, Additional Assignments, Status, Actions; equivalent mobile cards. Receiving RHU belongs only to facility configuration.
- No cross-municipality administration or doctor-account requirement is implied.

Implementation: additive migration `2026_09_23_000003`; `StaffAssignmentController`, `NurseAssignmentPolicy`, `WorkingFacilityService`, `ReferralRoutingService`, referral/hold/provider controllers, account/facility requests, admin pages, and shared referral destination selector.

Verification and migration application are recorded after completion; this document is not a claim that validation has passed.
