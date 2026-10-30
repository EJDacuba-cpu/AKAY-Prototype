AKAY: Implement the Approved Workflow and UI/UX Rework
Act as a senior full-stack developer and systems architect. Proceed with implementation, using this handoff as the approved plan. Inspect the current repository before editing. Do not restart the completed design interview.
Project: D:\Projects\AKAY-Prototype
Stack: Laravel backend, React frontend.
Communication: Casual Taglish; explain unfamiliar technical terms briefly. Ask one question at a time only for genuine blockers. Continue independent work while resolving uncertainties.
Important: The previous conversation performed read-only code inspection and finalized the decisions below. No application code or database changes were made. Reverify the current checkout.
1. Scope and design direction
AKAY is a BHC–RHU electronic health record and referral system serving 14 barangays.
Barangays have different staffing. Some have only a midwife; some have an encoder.
Encoders are optional, never a required workflow step.
Authorized midwives/nurses can register patients, encode, review, and finalize their own consultations.
RHU-based nurses may work at authorized BHC assignments using their own accounts.
Doctors do not need login accounts unless they directly use AKAY. Doctor Availability roster entries are distinct from user accounts.
RHU staff assignment scheduling as a full operational module is not required now; authorized facility access is required.
Visual direction: minimalist, modern, calm medical design. Preserve red-and-white branding and reuse existing components, layouts, design tokens, tables, forms, modals, and navigation wherever practical. Enhance rather than replace everything.
2. Accounts and permissions
Centralized management is the approved first-version approach:
Admin/MHO creates accounts, assigns facilities and permissions, and handles existing password-reset approvals.
Do not implement local BHC account-lead management now. That was discussed but superseded.
Personal accounts; no shared facility credentials.
Separate professional designation, facility assignment, and action permissions. Do not blindly create a different dashboard for every job title.
User/access
Approved responsibility
Admin/MHO
Account and access administration; no automatic clinical finalization solely because admin
Authorized midwife/nurse
Register patients; create/continue drafts; assess, review, finalize, manage follow-ups, submit referrals; documented corrections
Encoder/BHW encoding access
Register patients, start consultations, encode/continue current queue drafts, submit for review
Logistics/inventory staff
Inventory and availability management within explicitly assigned facilities; no automatic clinical editing
Existing RHU staff
Preserve incoming referrals, doctor availability, feedback, and other existing authorized RHU workflows

Dispensing is a separate permission. Midwife administration/dispensing is confirmed. Nurse dispensing and the geographic coverage of logistics staff remain unconfirmed: keep configurable and restricted by default.
MHO account-creation UI
One form with:
Personal Details
Facility Assignment
Access & Permissions
Approved preset cards:
Clinical Staff
Encoder
Inventory Staff
RHU Staff
Use short descriptions and a collapsed Additional Permissions section for exceptions such as dispensing. Preserve admin account management.
Facility assignment and switching
Home Facility visible by default.
Add Facility Assignment for optional additional authorized access.
Additional assignments support permissions and optional start/end dates.
One account can work at RHU and an assigned BHC; no duplicate account per facility.
One authorized facility: direct entry.
Multiple authorized facilities: explicit duty-location selection.
Persistent header: Working at: [Facility].
Only valid authorized facilities appear.
Backend verifies assignment and permission on every relevant request.
Switching does not move existing records to another facility.
Protect unsaved work when switching; avoid context changes during active editing.
3. BHC consultation queue and privacy
Approved queue tabs:
For Encoding
For Review
Completed
Desktop: reuse table components. Mobile: compact cards with equivalent actions.
Encoder access
Encoders may register patients and start consultations; no clinician initiation requirement.
They can access the current-consultation queue of their assigned BHC, rather than requiring individual manual assignment first.
Limit access to:
Minimum patient identification needed for accurate registration/matching.
Current consultation information needed for encoding.
Upcoming appointment date/time and service label for the intercept.
Restrict by default:
Full historical medical timeline.
Previous diagnoses and clinical notes.
Unrestricted old referrals, clinical reports, and exports.
Completed-record browsing.
Service labels can themselves be sensitive; restrict them to authorized users.
Enforce response filtering and authorization in the backend, not just by hiding tabs. Review previews, search, related records, downloads, cached data, and notification content for bypasses.
“Current consultation” does not mean today only: an unfinished draft can continue on a later date.
Shared drafts and editing
Authorized coworkers can continue facility drafts.
One active editor per consultation.
Show Being edited by [Name].
Explicit confirmed takeover for authorized staff, recorded in history.
Prevent the previous editor from overwriting after takeover.
Preserve original creator and subsequent editor attribution.
Handle stale editing sessions and version conflicts safely.
Review
Summary-first review using existing consultation sections:
Patient details
Findings
Selected services/programs
Items given
Outcome
Follow-ups
Per-section Edit actions.
Actions:
Return for Correction — required note.
Finalize Consultation — authorized clinical staff only.
Encoder: Submit for Review.
Midwife/nurse: Review & Finalize, including when they encoded the record themselves.
4. Patient entry and purpose of visit
Patient Profile has one primary Start Consultation button.
Appointment intercept
If pending appointments exist, show selection with:
Date/time and service label.
Multiple appointment selection.
New concern only
May bagong concern din, allowing follow-up plus new concern.
Starting a consultation does not fulfill an appointment.
New concern only leaves existing appointments pending.
Selected appointments link to the consultation.
Clinician confirms which appointments were actually addressed.
Only confirmed appointments are fulfilled; others remain pending.
Purpose of visit
Use compact multi-select selection cards, not visible checkbox controls or oversized tiles.
Primary services:
General Consultation
Prenatal
Postpartum
EPI
Family Planning
Separate Program Monitoring selection populated from the database.
Styling:
White surface and subtle border when unselected.
Light red background, red border, small selected indicator.
Responsive grid: typically two columns on mobile, adapt to narrow screens.
Accessible keyboard and touch interaction.
Selected services reveal collapsible form sections with:
Incomplete
Ready for Review
During consultation:
Add Service / Program without restarting or losing data.
Persistent Refer to RHU action that preserves the draft.
Clinical staff may revise initial purpose selections after assessment.
5. Dynamic programs
Approved Option A, not a full form builder:
Admin/MHO can register approved program names, descriptions, and active status.
New programs use a standard monitoring form.
TB DOTS and NCD retain specialized forms.
(2026-09-27: the NCD / Hypertension / Diabetes program was since removed; TB DOTS keeps its specialized form.)
New specialized forms may require development.
Do not claim that a database-driven dropdown automatically supports arbitrary disease-specific forms.
Initial scope:
General Consultation/Morbidity
Prenatal and Postpartum
EPI
Family Planning
Long-term TB DOTS and NCD monitoring
Adding a program form is separate from confirmed enrollment.
Preserve existing consultation data when adding forms.
Clinical reviewer confirms enrollment during final review.
Opening a TB form must not automatically imply confirmed TB or treatment enrollment.
Existing required-field logic must accommodate this distinction.
6. Consultation outcome and follow-ups
One shared outcome section:
Care Completed
Enroll / Continue Program
Refer to RHU
These are not three mutually exclusive outcomes.
Program enrollment/continuation and referral may coexist.
Referral does not automatically terminate program enrollment.
Care Completed describes today’s care; it is distinct from finalizing the record.
Follow-up scheduler
One scheduling section with Add Another Follow-up.
Each entry includes:
Service/reason
Date
Optional time
Remove action before submission
Each scheduled follow-up creates its own record.
Support:
Multiple future appointments per patient.
Multiple appointments generated by one consultation.
Multiple existing appointments addressed by one consultation.
Selective fulfillment.
Independent status and rescheduling history.
Do not retain a one-appointment-per-consultation assumption.
7. Referral workflow
Scope: non-emergency BHC-to-RHU referrals. Do not add an emergency module.
Do not infer clinical urgency from ability to walk, and do not automatically refer solely based on a disease name.
Approved attention UI:
Label: Referral Attention
Values: Routine / Priority
Priority reason required, enforced server-side.
Authorized midwife/nurse confirms and submits.
Encoder may prepare information but cannot submit the official referral.
Priority is a request for attention, not an emergency classification or guaranteed appointment.
Preserve the existing doctor-availability workflow:
No available RHU provider → referral submission blocked; record/hold preserved.
Actual availability change → notify waiting staff.
Staff reviews and submits.
Staff contacts patient and provides slip.
Availability changes do not auto-submit referrals or guarantee appointment booking. Routine and Priority both use the current availability gate. A referral hold is an administrative state, not a clinical assurance that waiting is safe.
8. Medicines and health supplies
Keep basic BHC stock tracking and dispensing deduction.
Approved module naming direction: Medicines & Health Supplies.
BHC inventory represents actual local stock.
BHC views RHU availability separately.
BHC dispensing must not deduct RHU stock.
Logistics access is restricted to assigned facilities.
Do not expand into procurement or full warehouse management.
Approved UI:
Record Items Given
Item
Quantity
Unit
Confirm Given for authorized dispenser
Rules:
Draft entry does not deduct stock.
Confirmation of actual release deducts stock once.
Track patient, item, quantity, facility, actor, and time.
Dispensing permission does not grant prescribing authority.
Vaccines use the immunization entry linked to the same release, avoiding duplicate entry/deduction.
Important unresolved technical detail: inspect stock units before implementing vaccine deduction. Do not equate doses with vials. If current data cannot support the conversion safely, ask one focused question; continue other work.
Condom availability was not fully confirmed; support appropriate supply categories without fabricating stock.
9. Finalized records and corrections
Approved:
Drafts are editable.
Review precedes finalization.
Finalized clinical records are read-only.
No normal-workflow hard deletion or silent overwriting of finalized records.
Add Correction panel:
Original entry
Corrected value/addendum
Required reason
Author and timestamp
Original finalizer or another authorized midwife/nurse at the assigned BHC may correct.
Preserve:
Original creator/encoder
Actual assessor
Finalizer
Correction author
Actual dispenser independently
Display a compact Correction History section. Retain original record history.
Do not mistake this application policy for a legal claim that every record must be stored forever.
10. Findings from the previous code inspection
Reverify before implementation.
Roles and facility access
backend/app/Models/User.php
Current roles: admin, bhw, rhu_staff.
backend/app/Services/FacilityAccessService.php
BHW currently requires one BHC and no RHU assignment.
RHU staff requires one RHU and no BHC assignment.
Many reads/actions depend on these role/facility assumptions.
BHC patient/record access already has facility filtering.
backend/routes/api.php
Several actions are explicitly role:bhw or role:rhu_staff.
frontend/src/components/layout/sidebar/sidebarData.js
Existing separate BHC/RHU/admin navigation.
Do not merely add frontend role labels; update backend authorization consistently.
Drafts
backend/app/Services/HealthRecordDraftService.php
Owner-user restrictions appear throughout listing, editing, and finalization.
Existing version/conflict protections.
backend/app/Models/HealthRecordDraft.php
Owner, facility, encrypted payload, version, lifecycle fields.
Existing statuses are storage lifecycle states, not the proposed review queue.
Review encryption, expiration, local draft storage, consultation identity, and finalization retries before converting drafts to shared workflows.
Programs and purpose
backend/app/Services/ConsultationPrograms.php
Hardcoded classifications.
backend/app/Services/VisitPurpose.php
Hardcoded services, program matching, eligibility, and required fields.
Frontend consultation/purpose utilities also exist.
Preserve existing records while evolving validation.
Follow-ups
backend/app/Services/FollowUpTaskSyncService.php
Single follow-up task identifier and parent-record assumptions.
Synchronizes a current task against a health record.
Existing cancellation and referral interactions need review.
backend/app/Models/FollowUpTask.php
Fulfillment and rescheduling fields/history already exist.
Dispensing
backend/app/Services/MedicineStockService.php
BHW-role-based dispensing authorization.
Existing stock transactions, actor tracking, and dispensed_by.
backend/app/Http/Controllers/Api/HealthRecordController.php
Record creation can currently trigger dispensing.
Separate dispensing endpoint exists.
Existing duplicate-dispensing protection.
Preserve stock concurrency and retry protections while separating confirmation from draft/finalization.
Referrals
backend/app/Services/ReferralSubmissionGate.php
Zero available providers blocks submission for both Routine and Priority.
backend/app/Http/Controllers/Api/RhuProviderController.php
Availability transition triggers waiting-hold notifications.
Existing referral_holds table.
RHU staff currently manages availability; admin is read-only for this feature.
Backend field urgency_level already supports Routine/Priority. A UI label change alone does not require renaming the column.
Inspect whether a suitable Priority reason field already exists.
Historical migration warning:
2026_08_17_000001_transition_referrals_to_routine_priority.php contains historical test-data deletion. Do not rerun destructive reset workflows or treat old comments as current authorization to delete data.
11. Implementation approach
Inspect repository instructions, current changes, schema/migrations, components, and relevant tests.
Save this consolidated plan in the repository and map changes to files/tables.
Implement in coherent phases:
Accounts, permissions, authorized facility context.
Shared queue, editing ownership, encoder privacy, review/finalization, corrections.
Consultation entry, purposes, dynamic programs, outcomes.
Multi-appointment scheduling/fulfillment and referral updates.
Inventory permissions and explicit item-release confirmation.
Use additive, data-preserving migrations and deliberate legacy mapping.
Preserve existing functionality unless this plan explicitly changes it.
Review stored database functions as well as Laravel code.
Test meaningful boundaries:
Cross-facility denial and expired assignments.
Encoder history restrictions and direct API attempts.
Draft takeover and stale saves.
Review/finalization permissions and correction preservation.
Multiple follow-ups and selective completion.
Required Priority reason and existing referral holds.
No stock changes from drafts; no duplicate deductions.
Verify mobile and desktop UI against existing styling.
No fresh permissions discussion is needed for settled decisions. For genuinely unresolved details, ask one focused question and continue unaffected implementation. Do not claim deployment, migrations, tests, or compliance are complete without verification.
Start implementation now by inspecting the repository and recording the approved plan.

