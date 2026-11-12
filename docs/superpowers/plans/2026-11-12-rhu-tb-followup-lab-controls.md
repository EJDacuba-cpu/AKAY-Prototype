# RHU TB Follow-up Lock + Lab Controls Plan

> Execute inline; no commit/push.

**Goal:** Lock physician-confirmed TB Disease diagnosis type on follow-up; keep drug susceptibility editable; surface latest labs with View/Update Result reusing existing workflows.

## Tasks
1. Detect established TB Disease from patient_conditions (active/controlled) + prior finalized records with tb_assessment_authority.
2. FE: seed/lock diagnosisType in care plan; BE: reject diagnosisType downgrade.
3. Supporting labs: sort by clinical date; View/Update for current draft vs addendum on record: refs.
