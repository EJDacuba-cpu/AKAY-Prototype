# Approved TB case workflow

Approved in conversation on 2026-11-09. BHC screens and refers presumptive TB;
RHU evaluates laboratory evidence and diagnoses. Only an RHU physician may
confirm TB diagnosis, authorize treatment registration or outbound DR-TB
referral, and close/reopen a case. Nurses/encoders may prepare drafts.

Form 4B registration is an explicit action after consultation finalization,
eligible only for TB Disease plus drug-susceptible classification. Evaluation
and Active Patient Condition confirmation do not register a treatment case.
TB Infection clears resistance and cannot create Form 4B.

Use a shared treatment-case identity linking source consultation, registration,
endorsement, dated DOTS entries, laboratory evidence, and outcome. Finalized
consultations and historical tb_data snapshots remain immutable. BHC records
doses and weight directly on the endorsed case without a daily consultation.
RHU clinical classifications, regimen and outcome remain read-only at BHC.

RHU supplies or generates the case number at registration, unique within RHU
and reporting year. Proposed generated format: TB-YYYY-NNNN, allocated with
transactional uniqueness and idempotency.

DR-TB scope: RHU-side outbound disposition/status and printable referral slip
to an external PMDT/DR-TB facility; block Form 4B. No external facility portal,
no Form 4C module. Follow-up schedules/dosages require approved clinical rules;
do not infer a prescription or resistance classification from free text.

Approaches considered: patching per-visit JSON would leave treatment identity
and concurrent updates ambiguous. The approved shared-case approach adds
relational identity/events while preserving historical JSON for compatibility.

Execution: implement incrementally, starting with assessment persistence and
physician authorization (Steps 1 and 2). Test and build after each increment.
