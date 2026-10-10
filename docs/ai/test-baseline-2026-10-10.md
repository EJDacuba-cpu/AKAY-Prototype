# Test baseline - 2026-10-10

Baseline for the BHC General Consultation simplification (branch `bhc-general-consultation-simplification`, HEAD `3015cd0` at the time of the run; spec commit `76eeeba`). No application code or test was changed to produce it.

## Totals

| Suite | Result |
|---|---|
| Backend (PHPUnit) | 697 tests, 490 passed, **183 failed + 3 errors = 186 distinct failing/erroring names**, 21 skipped, 3 risky, 2963 assertions, about 62 s |
| Frontend `node --test` | 538 tests, 538 pass, 0 fail (handoff recorded 532; +6 since) |
| Frontend `npm run lint` | 0 errors, 1 warning (pre-existing, see below) |
| Frontend `npm run build` | passes (only the usual >500 kB chunk-size advisory) |

Comparison with the previous baseline (`.superpowers/sdd/2026-10-10-consultation-care-plan-workflow-revision/baseline-failures.txt`, 198 names): **0 new failures, 12 names no longer fail** (6 from `CarePlan*Test`/`MonitoringStartTest`, 6 from `HealthConcernBoundaryTest`). So the plan in `docs/ai/CURRENT.md` ("198") is now 186. Nothing in this branch has regressed the backend suite.

Lint warning: `src/pages/rhu/RHUAddHealthRecords.jsx:791:6 react-hooks/exhaustive-deps` (missing dependency `selectPatient`).

## How it was run

Isolation check first: `backend/phpunit.xml` forces `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`, `DB_URL=""`. `backend/.env` points at Supabase (`DB_CONNECTION=pgsql`, pooler host), so the run was made with the same values additionally exported on the command line (belt and braces) and `php artisan config:show database.default` confirmed `sqlite` / `:memory:` before any test ran. There is no `.env.testing` and no `DB_*` in the OS environment.

```
cd backend
export APP_ENV=testing DB_CONNECTION=sqlite DB_DATABASE=:memory: DB_URL=
php -d memory_limit=2G vendor/bin/phpunit --log-junit <scratchpad>/baseline-junit.xml     # full run
php -d memory_limit=2G vendor/bin/phpunit --filter 'ConsultationWorkflowRevisionTest::test_optional_hpi_and_vitals_do_not_block_finalization'   # Step 4
cd ../frontend
node --test ; npm run lint ; npm run build
```

(The JUnit file and raw outputs were kept outside the repository.)

## Step 4 gate: the `store()` test setup works

`ConsultationWorkflowRevisionTest::test_optional_hpi_and_vitals_do_not_block_finalization`: **PASSES** (1 test, 1 assertion). Its setUp creates a BHC `bhw` user with `'permissions' => ActionPermissions::PRESETS['clinical']` and `Sanctum::actingAs($user, ['akay:access'])`; POST `/api/health-records` returns 201. New Task 2-5 tests can use this setup. The reason it works while 150 other tests fail with 403 is explained below.

## Backend failures by cause

Every failing name is listed once. `@N` is the test-file line of the failing assertion.

### Group A (150 explicit + 5 masked = 155 names): 403 from the action-permission middleware

**Cause.** The test creates a `role = bhw` user without a `permissions` value (or with `null`). `ActionPermissions::home()` then falls back to `PRESETS['encoder']`, which holds only `patients.register`, `consultations.encode` and `inventory.view`. The route middleware asks for `consultations.finalize` (POST `/health-records`), `followups.manage` (follow-up writes), `referrals.submit`, `inventory.manage`, `items.dispense` or `clinical.history` (reads) and answers 403 "Your current facility assignment does not permit this action." First assertion in every case: `Expected response status code [N] but received 403` (N shown per test; the single error is the same 403 raised as an `HttpException`). Where a test does not assert the status (for example FollowUpRescheduleModelTest, NotificationRemediationTest) the 403 shows up only as a downstream symptom, such as `Attempt to read property "state" on null`, `Failed asserting that 'pending' is identical to 'rescheduled'` or `actual size 0 matches expected size 1`; those 5 names are listed in A2 below, because adding the permission clears them (verified, see below).

**Root cause analysis of the 403 group**

- The check that rejects: `backend/app/Http/Middleware/EnforceActionPermissions.php:40` calls `ActionPermissions::ensure()` (`backend/app/Services/ActionPermissions.php:38-41`), which aborts with 403 unless `allows()` (`ActionPermissions.php:33-36`) finds the permission in `$user->workingFacility['permissions'] ?? self::home($user)`. For a `bhw` with `permissions === null`, `home()` returns `PRESETS['encoder']` (`ActionPermissions.php:26-27`, deliberate: "A historical BHW role does not establish a clinical designation"). The path-to-permission map is `EnforceActionPermissions.php:16-35` (health-records write -> `consultations.finalize` on line 24).
- What the tests' setup lacks: an explicit `'permissions' => ActionPermissions::PRESETS['clinical']` on the `User::create([...])` of the BHW (the passing `ConsultationWorkflowRevisionTest` has exactly this). The failing files create users with no `permissions` key at all (0 mentions of `'permissions'` or `PRESETS` in AkayApiTest, ClinicalFlowEndToEndTest, ConsultationIdentityTest, FollowUpConcurrencyTest, HealthRecordIdempotencyTest, MedicineInventoryWorkflowTest, ReferralHoldTest, ReferralQrSecurityTest, FollowUpCalendarEndpointTest). They were written before the per-user action permissions existed. (Their Sanctum ability is fine; the 401s in group C are a different problem.)
- Smallest fix I would propose (NOT applied): in each affected test's user-creation helper, add `'permissions' => ActionPermissions::PRESETS['clinical']` for BHW users (and `PRESETS['rhu']` for `rhu_staff` users, since `home()` already gives RHU staff the `rhu` preset when `permissions` is null, leave them alone unless a test needs more). Tests that deliberately check denial (encoder, admin) keep `PRESETS['encoder']` or no permissions. This is a test-fixture change only; no production code changes.
- Evidence for the proposal (scratch copies outside the repo; repo untouched): adding the clinical preset to the users of a copy of each file made these files fully green: BrowserSessionPrivacyTest (3 names), FollowUpCalendarEndpointTest (4), FollowUpEpisodeTest (1), FollowUpRescheduleModelTest (3), FollowUpTaskSyncServiceTest (1), FormsFinalizationChecklistTest (3), NotificationRemediationTest (4), PrenatalFormFieldsTest (2). For HealthRecordIdempotencyTest the same change moved it from 1/12 to 7/12 passing: the remaining 5 are second-layer drift that the 403 hides (see below), so **fixing the setup will uncover further stale expectations, mainly the "BHC Assessment is required for follow-up or referral" 422 and stock quantities that now need `confirmed_given`**. Plan for a sweep, not a one-line fix. A blanket change across all files is NOT safe: it also gives clinical rights to RHU/admin test users and breaks denial tests (a crude all-users version made ReferralStatusStateMachineTest worse).

**Group A test names** (grouped by class; "expected N" is the status the test wanted):

<!-- 150 tests -->

**AkayApiTest** (5)
- `AkayApiTest::test_bhw_can_manage_assigned_bhc_medicine_inventory` (expected 201, @93)
- `AkayApiTest::test_empty_reports_return_zero_counts` (expected 200, @719)
- `AkayApiTest::test_family_planning_health_record_saves_json_payload_and_can_be_filtered` (expected 201, @661)
- `AkayApiTest::test_referral_creation_generates_tracking_notification_and_audit_log` (expected 201, @406)
- `AkayApiTest::test_referral_creation_is_idempotent_by_client_submission_id` (expected 201, @539)

**BrowserSessionPrivacyTest** (3)
- `BrowserSessionPrivacyTest::test_health_record_responses_disable_browser_and_proxy_caching` (expected 200, @53)
- `BrowserSessionPrivacyTest::test_referral_responses_disable_browser_and_proxy_caching` (expected 200, @60)
- `BrowserSessionPrivacyTest::test_report_source_responses_disable_browser_and_proxy_caching` (expected 200, @74)

**ClinicalFlowEndToEndTest** (5)
- `ClinicalFlowEndToEndTest::test_follow_up_visit_fulfils_the_task_and_links_to_the_parent_record` (expected 201, @122)
- `ClinicalFlowEndToEndTest::test_health_records_list_exposes_the_resolved_outcome` (expected 201, @196)
- `ClinicalFlowEndToEndTest::test_referral_disposition_creates_the_referral_and_reads_referred` (expected 201, @170)
- `ClinicalFlowEndToEndTest::test_routine_disposition_creates_no_follow_up_and_reads_routine` (expected 201, @70)
- `ClinicalFlowEndToEndTest::test_scheduled_follow_up_appears_in_the_follow_ups_module` (expected 201, @85)

**ConsultationIdentityTest** (7)
- `ConsultationIdentityTest::test_another_users_record_is_never_identified_by_a_shared_uuid` (expected 201, @335)
- `ConsultationIdentityTest::test_consultation_uuid_cannot_be_changed_on_an_existing_record` (expected 201, @364)
- `ConsultationIdentityTest::test_consultation_uuid_is_hidden_from_health_record_responses` (expected 201, @301)
- `ConsultationIdentityTest::test_final_record_receives_the_consultations_uuid_separate_from_idempotency_key` (expected 201, @275)
- `ConsultationIdentityTest::test_idempotent_replay_is_unchanged_and_ignores_consultation_uuid` (expected 201, @381)
- `ConsultationIdentityTest::test_records_without_an_identity_never_collide_with_each_other` (expected 201, @356)
- `ConsultationIdentityTest::test_the_same_consultation_cannot_become_two_records_under_a_new_key` (expected 201, @314)

**FacilityIsolationSecurityTest** (14)
- `FacilityIsolationSecurityTest::test_bhw_cannot_dispense_other_bhc_medicine_during_record_creation` (expected 422, @502)
- `FacilityIsolationSecurityTest::test_completed_follow_up_task_cannot_be_reused` (expected 409, @454)
- `FacilityIsolationSecurityTest::test_direct_dispense_endpoint_rejects_other_bhc_medicine` (expected 422, @531)
- `FacilityIsolationSecurityTest::test_existing_follow_up_record_can_be_edited_without_reusing_task` (expected 201, @484)
- `FacilityIsolationSecurityTest::test_explicit_follow_up_task_is_not_inferred_from_service_type` (expected 201, @427)
- `FacilityIsolationSecurityTest::test_follow_up_task_cannot_link_to_unrelated_parent_record` (expected 422, @441)
- `FacilityIsolationSecurityTest::test_follow_up_task_must_match_patient` (expected 422, @413)
- `FacilityIsolationSecurityTest::test_health_record_update_cannot_reassign_patient` (expected 422, @328)
- `FacilityIsolationSecurityTest::test_referral_health_record_must_match_submitted_patient` (expected 422, @362)
- `FacilityIsolationSecurityTest::test_referral_ignores_client_supplied_referring_bhc` (expected 201, @380)
- `FacilityIsolationSecurityTest::test_same_facility_health_record_creation_succeeds` (expected 201, @340)
- `FacilityIsolationSecurityTest::test_valid_same_bhc_medicine_selection_succeeds` (expected 201, @516)
- `FacilityIsolationSecurityTest::test_valid_same_facility_follow_up_linking_succeeds` (expected 201, @470)
- `FacilityIsolationSecurityTest::test_valid_same_facility_referral_creation_succeeds` (expected 201, @391)

**FollowUpCalendarEndpointTest** (4)
- `FollowUpCalendarEndpointTest::test_calendar_groups_tasks_by_due_date` (expected 200, @55)
- `FollowUpCalendarEndpointTest::test_calendar_includes_superseded_rows_on_their_original_day` (expected 200, @70)
- `FollowUpCalendarEndpointTest::test_calendar_is_facility_scoped` (expected 200, @104)
- `FollowUpCalendarEndpointTest::test_calendar_requires_a_date_range` (expected 422, @97)

**FollowUpConcurrencyTest** (9)
- `FollowUpConcurrencyTest::test_direct_non_follow_up_records_and_different_keys_remain_allowed` (expected 201, @323)
- `FollowUpConcurrencyTest::test_final_epi_follow_up_creates_no_next_task` (expected 201, @303)
- `FollowUpConcurrencyTest::test_fulfilled_task_returns_conflict_and_cannot_be_rescheduled_or_marked_no_show` (expected 409, @152)
- `FollowUpConcurrencyTest::test_medicine_failure_after_lock_leaves_task_active` (expected 409, @243)
- `FollowUpConcurrencyTest::test_one_different_key_submission_wins_and_the_second_has_no_effects` (expected 201, @54)
- `FollowUpConcurrencyTest::test_patient_and_facility_mismatches_create_no_effects` (expected 422, @193)
- `FollowUpConcurrencyTest::test_pending_no_show_and_rescheduled_are_the_only_processable_states` (expected 201, @125)
- `FollowUpConcurrencyTest::test_phase_2a_replay_and_payload_mismatch_take_precedence` (expected 201, @100)
- `FollowUpConcurrencyTest::test_referral_failure_after_lock_rolls_back_completion_and_next_task` (expected 422, @272)

**FollowUpEpisodeTest** (1)
- `FollowUpEpisodeTest::test_details_return_the_explicit_episode_in_visit_and_schedule_order` (expected 200, @19)

**FollowUpRescheduleModelTest** (2)
- `FollowUpRescheduleModelTest::test_a_superseded_task_is_no_longer_processable` (expected 200, @108)
- `FollowUpRescheduleModelTest::test_index_shows_only_the_current_task_after_reschedule` (expected 200, @93)

**FollowUpTaskSchedulingTest** (8)
- `FollowUpTaskSchedulingTest::test_active_patient_lookup_returns_all_unrelated_episodes_in_schedule_order` (expected 200, @165)
- `FollowUpTaskSchedulingTest::test_cancel_preserves_history_and_removes_task_from_active_lookup` (expected 200, @253)
- `FollowUpTaskSchedulingTest::test_follow_up_visit_requires_time_when_scheduling_another_visit` (expected 422, @114)
- `FollowUpTaskSchedulingTest::test_general_consultation_follow_up_required_needs_a_date_and_time` (expected 422, @44)
- `FollowUpTaskSchedulingTest::test_initial_health_record_save_creates_one_schedule_with_required_time` (expected 201, @91)
- `FollowUpTaskSchedulingTest::test_one_active_task_is_returned_without_auto_linking_a_new_consultation` (expected 200, @186)
- `FollowUpTaskSchedulingTest::test_referral_disposition_ignores_stale_follow_up_fields` (expected 201, @145)
- `FollowUpTaskSchedulingTest::test_reschedule_updates_date_time_notes_and_rejects_terminal_tasks` (expected 200, @221)

**FollowUpTaskSyncServiceTest** (1)
- `FollowUpTaskSyncServiceTest::test_resyncing_a_record_does_not_undo_a_reschedule` (expected 200, @58)

**FormsFinalizationChecklistTest** (3)
- `FormsFinalizationChecklistTest::test_maternal_td_doses_are_accepted_and_persisted_separately_from_tt` (expected 201, @56)
- `FormsFinalizationChecklistTest::test_pulse_and_spo2_vitals_are_accepted_and_persisted` (expected 201, @96)
- `FormsFinalizationChecklistTest::test_tb_comorbidity_screening_fields_are_accepted_and_persisted` (expected 201, @72)

**HealthRecordDraftTest** (1)
- `HealthRecordDraftTest::test_official_failure_keeps_draft_active_and_successful_commit_consumes_it` (expected 409, @387)

**HealthRecordIdempotencyTest** (11)
- `HealthRecordIdempotencyTest::test_another_user_cannot_replay_or_retrieve_a_submission_by_key` (expected 201, @117)
- `HealthRecordIdempotencyTest::test_different_keys_create_distinct_valid_visits` (expected 201, @280)
- `HealthRecordIdempotencyTest::test_final_epi_follow_up_creates_no_next_task_and_replays_once` (expected 201, @182)
- `HealthRecordIdempotencyTest::test_follow_up_completion_and_next_task_are_replayed_once` (expected 201, @163)
- `HealthRecordIdempotencyTest::test_follow_up_failure_after_medicine_deduction_rolls_back_everything` (expected 422, @261)
- `HealthRecordIdempotencyTest::test_late_referral_failure_rolls_back_record_stock_and_follow_up` (expected 422, @231)
- `HealthRecordIdempotencyTest::test_medicine_is_deducted_once_and_failure_rolls_back_record` (expected 201, @133)
- `HealthRecordIdempotencyTest::test_missing_and_malformed_keys_are_rejected` (expected 422, @103)
- `HealthRecordIdempotencyTest::test_referral_and_database_notifications_are_created_once` (expected 201, @205)
- `HealthRecordIdempotencyTest::test_same_key_and_payload_returns_one_record_and_replay_metadata` (expected 201, @51)
- `HealthRecordIdempotencyTest::test_same_key_rejects_material_payload_changes_without_mutation` (expected 201, @71)

**MedicineInventoryWorkflowTest** (13)
- `MedicineInventoryWorkflowTest::test_adjustment_actions_use_positive_input_and_record_signed_deltas` (expected 200, @154)
- `MedicineInventoryWorkflowTest::test_authorized_bhc_and_rhu_restock_increment_and_create_one_ledger_row` (expected 200, @109)
- `MedicineInventoryWorkflowTest::test_batch_key_supports_multiple_medicines_but_same_batch_cannot_repeat` (expected n/a (exception), @550)
- `MedicineInventoryWorkflowTest::test_creation_derives_facility_and_records_only_positive_opening_balance` (expected 201, @50)
- `MedicineInventoryWorkflowTest::test_expired_disposal_succeeds_but_invalid_or_excessive_outflow_does_not_mutate` (expected 200, @185)
- `MedicineInventoryWorkflowTest::test_generic_metadata_update_cannot_replace_quantity` (expected 200, @221)
- `MedicineInventoryWorkflowTest::test_history_is_paginated_newest_first_and_facility_scoped` (expected 200, @268)
- `MedicineInventoryWorkflowTest::test_negative_opening_balance_and_client_facility_override_fail_validation` (expected 422, @92)
- `MedicineInventoryWorkflowTest::test_non_correction_direction_is_rejected` (expected 422, @680)
- `MedicineInventoryWorkflowTest::test_restock_requires_reason_and_rejects_cross_facility_access` (expected 422, @136)
- `MedicineInventoryWorkflowTest::test_rhu_health_record_dispensing_is_rejected_and_rolled_back` (expected 422, @651)
- `MedicineInventoryWorkflowTest::test_rhu_history_is_available_only_to_its_own_rhu_staff` (expected 200, @443)
- `MedicineInventoryWorkflowTest::test_used_medicine_is_archived_while_unused_zero_stock_can_be_deleted` (expected 200, @240)

**MedicineStockConcurrencyTest** (14)
- `MedicineStockConcurrencyTest::test_all_rows_are_validated_before_any_multi_item_deduction` (expected 409, @146)
- `MedicineStockConcurrencyTest::test_authorized_submission_deducts_locked_stock_and_creates_one_normalized_history_row` (expected 201, @43)
- `MedicineStockConcurrencyTest::test_cross_facility_inventory_is_rejected_without_stock_details` (expected 422, @247)
- `MedicineStockConcurrencyTest::test_different_keys_use_current_stock_while_same_key_replays_without_another_deduction` (expected 201, @106)
- `MedicineStockConcurrencyTest::test_direct_dispense_endpoint_deducts_once_for_an_existing_record` (expected 200, @411)
- `MedicineStockConcurrencyTest::test_health_record_without_medicines_still_succeeds` (expected 201, @380)
- `MedicineStockConcurrencyTest::test_idempotency_hash_normalizes_reordered_and_combined_medicine_entries` (expected 201, @184)
- `MedicineStockConcurrencyTest::test_insufficient_stock_returns_safe_conflict_and_creates_no_official_effects` (expected 409, @74)
- `MedicineStockConcurrencyTest::test_invalid_unavailable_expired_and_missing_items_create_no_effects` (expected 422, @335)
- `MedicineStockConcurrencyTest::test_late_audit_failure_rolls_back_record_stock_and_history` (expected 500, @388)
- `MedicineStockConcurrencyTest::test_multiple_sufficient_items_deduct_once_regardless_of_browser_order` (expected 201, @167)
- `MedicineStockConcurrencyTest::test_pre_phase_2c_medicine_hash_remains_replayable` (expected 200, @215)
- `MedicineStockConcurrencyTest::test_processed_follow_up_conflict_precedes_stock_validation` (expected 409, @305)
- `MedicineStockConcurrencyTest::test_stock_conflict_leaves_linked_follow_up_active_and_creates_no_next_task` (expected 409, @277)

**NotificationRemediationTest** (2)
- `NotificationRemediationTest::test_mark_unread_persists_across_a_refetch` (expected 200, @169)
- `NotificationRemediationTest::test_trash_and_restore_round_trip` (expected 200, @148)

**PrenatalFormFieldsTest** (2)
- `PrenatalFormFieldsTest::test_official_record_keeps_the_new_prenatal_fields` (expected 201, @102)
- `PrenatalFormFieldsTest::test_official_record_validates_the_new_prenatal_fields` (expected 422, @124)

**ReferralAttentionTransitionTest** (8)
- `ReferralAttentionTransitionTest::test_direct_referral_accepts_priority` (expected 201, @72)
- `ReferralAttentionTransitionTest::test_direct_referral_accepts_routine` (expected 201, @64)
- `ReferralAttentionTransitionTest::test_direct_referral_rejects_every_retired_value` (expected 422, @83)
- `ReferralAttentionTransitionTest::test_direct_referral_requires_an_explicit_value` (expected 422, @95)
- `ReferralAttentionTransitionTest::test_embedded_referral_accepts_priority` (expected 201, @103)
- `ReferralAttentionTransitionTest::test_embedded_referral_rejects_retired_value` (expected 422, @117)
- `ReferralAttentionTransitionTest::test_embedded_referral_requires_an_explicit_value` (expected 422, @133)
- `ReferralAttentionTransitionTest::test_health_record_without_a_referral_is_unaffected` (expected 201, @147)

**ReferralHoldTest** (10)
- `ReferralHoldTest::test_blocked_submission_records_a_waiting_hold` (expected 422, @62)
- `ReferralHoldTest::test_discard_is_forbidden_for_another_bhws_hold` (expected 422, @151)
- `ReferralHoldTest::test_discard_rejects_an_already_resolved_hold` (expected 422, @165)
- `ReferralHoldTest::test_existing_waiting_hold_does_not_change_the_gate_decision` (expected 422, @82)
- `ReferralHoldTest::test_flip_to_available_notifies_waiting_holds` (expected 422, @181)
- `ReferralHoldTest::test_flip_to_unavailable_and_unrelated_edits_notify_nobody` (expected 201, @201)
- `ReferralHoldTest::test_index_returns_only_the_callers_waiting_holds` (expected 422, @138)
- `ReferralHoldTest::test_notification_cooldown_suppresses_rapid_repeat_notifications` (expected 422, @219)
- `ReferralHoldTest::test_resume_hold_id_is_scoped_to_its_creator` (expected 422, @118)
- `ReferralHoldTest::test_successful_resubmission_resolves_the_hold` (expected 422, @99)

**ReferralQrSecurityTest** (8)
- `ReferralQrSecurityTest::test_admin_keeps_existing_details_access_but_cannot_use_clinical_qr_workflows` (expected 200, @266)
- `ReferralQrSecurityTest::test_authorized_bhw_lazily_obtains_an_opaque_secure_qr_without_serializing_secrets` (expected 200, @54)
- `ReferralQrSecurityTest::test_authorized_rhu_resolves_qr_then_details_authorizes_again_and_audits_safely` (expected 200, @82)
- `ReferralQrSecurityTest::test_regeneration_replaces_token_without_changing_referral_identity_or_ownership` (expected 200, @211)
- `ReferralQrSecurityTest::test_repeated_display_reuses_one_active_token_and_one_generation_audit` (expected 200, @241)
- `ReferralQrSecurityTest::test_tracking_lookup_and_regeneration_have_independent_rate_limits` (expected 404, @307)
- `ReferralQrSecurityTest::test_tracking_lookup_is_authenticated_exact_and_facility_scoped` (expected 200, @180)
- `ReferralQrSecurityTest::test_valid_token_does_not_bypass_rhu_or_role_isolation` (expected 200, @133)

**ReferralRoutingSecurityTest** (5)
- `ReferralRoutingSecurityTest::test_changing_mapping_does_not_rewrite_existing_referral_destination` (expected 201, @231)
- `ReferralRoutingSecurityTest::test_client_destination_overrides_are_ignored` (expected 201, @160)
- `ReferralRoutingSecurityTest::test_inactive_mapped_rhu_blocks_referral_creation` (expected 422, @204)
- `ReferralRoutingSecurityTest::test_unmapped_bhc_cannot_create_a_referral` (expected 422, @182)
- `ReferralRoutingSecurityTest::test_valid_referral_is_routed_from_authenticated_bhc_to_mapped_rhu` (expected 201, @140)

**ReferralStatusStateMachineTest** (1)
- `ReferralStatusStateMachineTest::test_new_referral_forces_pending_and_creates_one_initial_history` (expected 201, @75)

**ReferralSubmissionGateTest** (8)
- `ReferralSubmissionGateTest::test_a_named_provider_is_ignored` (expected 201, @117)
- `ReferralSubmissionGateTest::test_availability_dropping_after_form_load_still_blocks` (expected 422, @104)
- `ReferralSubmissionGateTest::test_availability_snapshot_uses_the_canonical_shape` (expected 201, @130)
- `ReferralSubmissionGateTest::test_embedded_referral_path_is_gated_too` (expected 422, @173)
- `ReferralSubmissionGateTest::test_replay_of_an_existing_referral_is_not_blocked_by_the_gate` (expected 201, @154)
- `ReferralSubmissionGateTest::test_zero_available_blocks_even_with_no_preference_selected` (expected 422, @90)
- `ReferralSubmissionGateTest::test_zero_available_blocks_priority_identically` (expected 422, @78)
- `ReferralSubmissionGateTest::test_zero_available_blocks_routine` (expected 422, @66)

**SecureServerCacheTest** (5)
- `SecureServerCacheTest::test_official_dispensing_invalidates_bhc_display_after_commit` (expected 201, @248)
- `SecureServerCacheTest::test_referral_receive_feedback_and_no_show_each_invalidate_aggregate_cache` (expected 201, @352)
- `SecureServerCacheTest::test_report_cache_is_invalidated_by_committed_referral_for_affected_facilities_only` (expected 200, @278)
- `SecureServerCacheTest::test_rhu_medicine_and_patient_volume_mutations_invalidate_only_affected_report` (expected 200, @316)
- `SecureServerCacheTest::test_successful_and_failed_stock_mutations_handle_invalidation_and_database_authority` (expected 409, @206)

### Group A2 (5 names): masked 403s (the test never asserts the status)

Same cause as group A. The request is rejected with 403 but the test goes on and fails later. Verified: with the clinical preset added to a scratch copy, FollowUpRescheduleModelTest passes 6/6 and NotificationRemediationTest 11/11.

- `FollowUpRescheduleModelTest::test_rescheduling_a_pending_task_supersedes_it_with_a_new_row` @57: `Failed asserting that two strings are identical` ('rescheduled' expected, got 'pending'; the reschedule PATCH was rejected)
- `FollowUpRescheduleModelTest::test_a_superseded_and_its_active_replacement_can_coexist` @145: `table [follow_up_tasks] matches expected entries count of 2. Entries found: 1.`
- `FollowUpRescheduleModelTest::test_rescheduling_a_no_show_task_leaves_its_state_as_no_show` @77 (error): `Attempt to read property "state" on null`
- `NotificationRemediationTest::test_counts_reflects_true_totals_across_categories` @129: `Failed asserting that 1 is identical to 3.`
- `NotificationRemediationTest::test_search_matches_on_title_and_message` @194: `actual size 0 matches expected size 1`

### Group B (4 names): wrong Sanctum ability name in the test

**Cause.** `ApprovedFacilityPermissionsTest` authenticates with `Sanctum::actingAs($user, ['access'])` (lines 27, 43, 56, 62). `backend/app/Http/Middleware/EnsureAccessTokenAbility.php:16-21` requires the ability `akay:access` and answers 401 `SESSION_INVALID` otherwise. Fix is `['akay:access']` (as in ConsultationWorkflowRevisionTest). After that, the per-user permission setup of this file also needs to be re-checked.

- `ApprovedFacilityPermissionsTest::test_encoder_cannot_browse_clinical_history_or_finalize_via_direct_api` @23: `Expected response status code [200] but received 401.`
- `ApprovedFacilityPermissionsTest::test_rhu_nurse_can_select_a_dated_bhc_assignment_without_changing_home` @36: `Expected response status code [403] but received 401.`
- `ApprovedFacilityPermissionsTest::test_admin_has_no_automatic_clinical_finalization` @60: `Expected response status code [403] but received 401.`
- `ApprovedFacilityPermissionsTest::test_other_users_assignment_and_cross_facility_patient_are_denied` @51 (error): `UNIQUE constraint failed: barangay_health_centers.name` (value "Home"). Test-helper problem: `account()` (line 20) creates a BHC literally named `Home` every call and this test calls it twice. Not an authorization issue.

### Group C (13 names): user-admin API now requires `permissions` + `permissions_confirmed`

**Cause.** `backend/app/Http/Requests/UserRequest.php:33` (`permissions_confirmed` is `required_with:permissions` + `accepted`; `permissions` is required when creating a BHW/RHU staff). The tests PUT/POST users without them, so the response is 422 before the rule the test wants to see.

- `AuthenticationSessionSecurityTest::test_deactivation_revokes_all_tokens_and_reactivation_does_not_restore_them` @193: `Expected [200] but received 422` (permissions_confirmed must be accepted)
- `AuthenticationSessionSecurityTest::test_admin_password_change_revokes_existing_sessions` @298: same
- `AuthenticationSessionSecurityTest::test_role_and_facility_change_revokes_tokens_and_new_login_uses_new_context` @315: same
- `AuthenticationSessionSecurityTest::test_bhc_and_rhu_assignment_changes_revoke_existing_tokens` @335: same
- `AuthenticationSessionSecurityTest::test_correcting_a_mixed_assignment_revokes_existing_tokens` @361: same
- `AuthenticationSessionSecurityTest::test_harmless_profile_update_does_not_revoke_valid_tokens` @381: same
- `FacilityIsolationSecurityTest::test_rejects_bhw_without_bhc_assignment` @116: `Failed to find a validation error ... 'barangay_health_center_id'` (response only has `permissions` / `permissions_confirmed` errors)
- `FacilityIsolationSecurityTest::test_rejects_bhw_with_both_facility_assignments` @124: same, key `rural_health_unit_id`
- `FacilityIsolationSecurityTest::test_rejects_rhu_staff_without_rhu_assignment` @136: same, key `rural_health_unit_id`
- `FacilityIsolationSecurityTest::test_rejects_rhu_staff_with_both_facility_assignments` @144: same, key `barangay_health_center_id`
- `FacilityIsolationSecurityTest::test_rejects_clinical_account_assignment_to_inactive_facility` @178: same, key `barangay_health_center_id`
- `FacilityIsolationSecurityTest::test_rejects_update_that_removes_bhw_bhc_assignment` @191: same (only `permissions_confirmed`)
- `FacilityIsolationSecurityTest::test_rejects_update_that_adds_bhc_to_rhu_staff` @203: same

### Group D (3 names): `chief_complaint` is now required on POST

**Cause.** `HealthRecordRequest.php:281` (`chief_complaint` required for POST). The payload in these tests has none. Assertion: `Expected [201] but received 422` ("The chief complaint field is required").

- `ConsultationProgramsTest::test_secondary_program_data_round_trips_without_changing_primary_category` @30
- `ConsultationProgramsTest::test_patient_past_medical_history_is_untouched_by_record_writes` @343
- `HealthRecordDraftFinalizationTest::test_custom_header_validation_and_absent_header_ordinary_save_contract` @324

### Group E (6 names): draft/consultation-uuid lifecycle changed (409 / 500 / 422 instead of what the test expects)

**Cause.** `DraftConsultationExistsException` thrown at `backend/app/Services/HealthRecordDraftService.php:81`: an ordinary save for a consultation that already has an active draft is now answered 409 instead of being accepted. Plus one stale-payload case (`diagnosis` missing, `HealthRecordRequest.php:460`). These need a real diagnosis per test; I only read the first assertion line.

- `ConsultationIdentityTest::test_consultation_uuid_is_never_an_authorization_key` @179: `Expected [201] but received 409` (DraftConsultationExistsException)
- `HealthRecordDraftFinalizationTest::test_two_finalization_attempts_create_one_record_while_same_key_replays` @195: `Expected [201] but received 409`
- `HealthRecordDraftFinalizationTest::test_draft_consumption_failure_rolls_back_official_record_inventory_and_audits` @96: `Expected [500] but received 409`
- `HealthRecordDraftFinalizationTest::test_follow_up_failure_rolls_back_official_work_and_keeps_draft_active` @173: `Expected [500] but received 409`
- `HealthRecordDraftFinalizationTest::test_draft_binding_and_terminal_states_are_enforced_before_official_creation` @269: `Expected [422] but received 409`
- `HealthRecordDraftFinalizationTest::test_referral_failure_rolls_back_official_work_and_keeps_encrypted_draft` @143: `Expected [500] but received 422` ("BHC Assessment is required for follow-up or referral")

### Group F (the rest, 5 names): individual causes

- `AuthenticationSessionSecurityTest::test_active_and_facility_middleware_revoke_tokens_after_out_of_band_context_changes` @215: `Failed asserting that null is identical to 'SESSION_CONTEXT_INVALID'.` Not diagnosed; probably the same stale user-admin setup as group C (its sibling tests fail there), not confirmed.
- `ConsultationIdentityTest::test_a_discarded_draft_never_blocks_its_consultation_from_saving_again` @163: `Expected [201] but received 500`. Server error, not diagnosed; run it alone to see the exception.
- `HealthRecordDraftTest::test_other_users_roles_and_invalid_facility_assignments_cannot_access_draft` @149: `Expected [404] but received 200`. The test expects a user with an invalid/other-role setup to be refused (404), but the request succeeds; user setup lacks `permissions`, so it is not testing what it claims. Not confirmed.
- `MedicineInventoryWorkflowTest::test_history_response_uses_a_safe_allowlist_for_all_transaction_types` @292: allow-list key order/contents drifted: actual history rows include a `discrepancy` key the test's expected list does not have.
- `SecureServerCacheTest::test_medicine_cache_records_miss_then_hit_with_identical_allowlisted_response` @66: allow-list drift: actual medicine payload contains reconciliation fields (`reco...`) and not the expected `low_stock_threshold`, `unit`, `availability_status`, `expiration_date`, ... keys at those positions. Expectation list is stale.

## Frontend

- `node --test`: 538 tests, 538 pass, 0 fail, 0 skipped.
- `npm run lint`: `0 errors, 1 warning`: `src/pages/rhu/RHUAddHealthRecords.jsx:791:6 React Hook useEffect has a missing dependency: 'selectPatient'` (pre-existing).
- `npm run build`: success, built in 5.6 s; the only message is the large-chunk advisory (`index-*.js` 2,357 kB).

## Return-date sources (Step 4b)

Scope: the BHC workspace (`frontend/src/pages/bhc/ConsultationWorkspace.jsx`), its Care Plan helpers, and the server rules. The RHU add-record page is noted for contrast. Verdicts are "PROPOSES" (prefills or offers a date), "REQUIRES" (a save is refused without it) or "no field".

**The one underlying field is the visit's single `followUpDate`** (`ConsultationWorkspace.jsx:890`, sent as `followUpDate: effectiveFollowUpDate` at line 3230 into `monitoring_data.followUpDate`). Its status is derived from it, not chosen: `followUpStatus = followUpDate ? "Follow-up Required" : "Completed"` (effect at `ConsultationWorkspace.jsx:1303-1307`).

| # | Source | Proposes or requires | Frontend enforcement | Backend enforcement |
|---|---|---|---|---|
| 1 | **Health Concern whose Care Plan Action schedules a BHC follow-up** (action Follow-up, or Refer to RHU with the `bhcFollowUp` flag; also a stored legacy Recheck) | **REQUIRES** the date, and a reason | `carePlanFollowUpErrors` (`frontend/src/utils/carePlanWorkspace.js:127-136`): date error at 130, reason (when a kept follow-up has a date) at 133. Called on Review at `ConsultationWorkspace.jsx:2361` and on Continue at `ConsultationWorkspace.jsx:3718`. Field is marked required by `CarePlanSection.jsx:214` (`followUpDateRequired = concerns.some(schedulesBhcFollowUp)`) -> `:376`; the reason box shows at `CarePlanSection.jsx:159` | `HealthRecordRequest.php:509-519` (`$needsConcernDate`; POST only; error `monitoring_data.followUpDate` "Set the follow-up date for the concerns that schedule a BHC follow-up."), applies with or without a referral. Reason: `HealthRecordRequest.php:524-536` ("Follow-up reason is required."), skipped for a stale-tab Recheck concern. Predicate: `CarePlan::schedulesBhcFollowUp` (`CarePlan.php:67-77`) |
| 2 | **EPI next dose** (`immunizationData.vaccineEntries[].nextScheduleDate`, the `immunizationNextScheduleDate`) | **PROPOSES** only | No BHC input exists for `nextScheduleDate`: `ImmunizationVisitFields.jsx` has no date input for it. The field survives only as state (`ConsultationWorkspace.jsx:598`), draft pick (`:1544`) and, at Save, as a fallback date (`:3036-3038`): `followUpDate \|\| immunizationNextScheduleDate` feeds `followUpPlan` (`:3053-3059`) and `effectiveFollowUpDate` (`:3062-3064`), and `setFollowUpDate(...)` prefills the state (`:3068-3076`). So it can only matter for an old resumed draft. A "mandatory" EPI rule exists at `ConsultationWorkspace.jsx:2386-2389` ("Next follow-up date is required because there are still remaining EPI vaccines/services", with `epiNeedsNextFollowUp`, `:1370`) but it is **effectively unreachable**: it needs `followUpStatus === "Follow-up Required" && !followUpDate`, while the status is derived from the date (`:1305`), so the two never coexist | None. Server stores `nextScheduleDate` in the draft payload (`HealthRecordDraftPayloadService.php:202`, `:592` date format check) and the final `immunization_data` has no date rule. A status of "Follow-up Required" with no date is refused (row 7), but the BHC form never sends that combination |
| 3 | **Prenatal / Maternal** | **No return-date field at all.** There is no next-visit, return or next-ANC field in `EMPTY_MATERNAL_DATA` (`ConsultationWorkspace.jsx:330`) or in `maternal_data.*` rules (`HealthRecordRequest.php:74-138+`). `expectedDeliveryDate` (EDC, ~`:4419`) and the postpartum `deliveryDate` are clinical dates, not returns. The Care Plan only *labels* the single follow-up date as "Prenatal next visit" (`SERVICE_NEXT_VISIT_LABELS`, `ConsultationWorkspace.jsx:234-238`), display only | n/a (nothing proposed, nothing required) | n/a |
| 4 | **Family Planning next appointment** (`familyPlanningData.nextAppointmentDate`) | **PROPOSES** only, and in the BHC workspace nothing can set it | Same pattern as EPI: state (`ConsultationWorkspace.jsx:320`), draft pick (`:1563`), payload `next_appointment_date` (`:3169`). `handleFamilyPlanningChange("nextAppointmentDate", v)` would copy it into `followUpDate` (`:2561-2565`) but no BHC input calls it with that field (all call sites are other fields). The RHU page does have the input (`RHUAddHealthRecords.jsx:2327`) | Rules are `nullable|date` only (`HealthRecordRequest.php:188-189`); nothing requires it. Read side: `careTracking.js:258-276` shows it as "next visit" |
| 5 | **Monitoring continuation** (continued or newly started condition monitoring) | **No date required.** Date is optional; the follow-up box is merely offered | `CarePlanSection.jsx` header comment on `FollowUpFields` (lines 131-136): "otherwise (monitoring or a service visit only) the date stays optional"; `carePlanFollowUpErrors` ignores monitoring. Monitoring only affects acknowledgment/coverage text and the diagnosis rule below | `HealthRecordRequest.php:454-460` (`$keepsMonitoring`, `$followUpOfMonitoring`, then the diagnosis rule at 460) only lets a follow-up/referral go through without a typed diagnosis. `ConditionMonitoringService::linkFollowUpTask` (`:174`) links an existing task if one was scheduled; it does not require one |
| 6 | **Follow-up visit started from a scheduled task** (`visit_type = follow_up_visit`) | Requires the **task id**, not a date | n/a | `HealthRecordRequest.php:550-558` (`monitoring_data.followUpTaskId` required). A follow-up visit with its own empty `followUpDate` just fulfils the parent task (`FollowUpTaskSyncService.php:225-243`) |
| 7 | **Server rule: status says Follow-up Required** | **REQUIRES** `monitoring_data.followUpDate` when the client sends status "Follow-up Required" | Not reachable from the BHC form (status is derived from the date, `:1305`), so only API clients and the RHU page can hit it | `HealthRecordRequest.php:541-549` ("Follow-up date is required when status is Follow-up Required."), when `!$needsReferral || $keptWithReferral` and no concern already raised the row-1 error |
| 8 | **Referral keeps or clears the date** | Changes whether the date survives | `followUpPlan` (`carePlanWorkspace.js:34-40`): a plain referral clears the follow-up; kept when a concern schedules a follow-up, or a **service visit (a program selected) has a date set** | `CarePlan::keepsFollowUpWithReferral` (`CarePlan.php:97-112`) is the same rule; `HealthRecordController::normalizeReferralDisposition` (`:817-835`, called at `:171`) nulls `followUpDate/Time` when it is not kept; `FollowUpTaskSyncService.php:138-151` creates/cancels the task on the same rule |

Other places the date is only validated as a date: `HealthRecordRequest.php:148-149` (`followUpDate` / `follow_up_date` `nullable|date`), `HealthRecordDraftPayloadService.php:565` (`payload.followUpDate` `date_format:Y-m-d`). `MonitoringDetails.php` and `ConsultationPrograms.php` contain **no** follow-up date rule (grep for `followUp` / `follow_up` finds nothing in either).

**Difference from the plan's Task 7 assumption** (`returnRequirement`: `required = monitorsAny || Boolean(immunizationNextDate)`; `mandatoryDate = immunizationNextDate`; `reasonExempt = selectedPrograms.length > 0 || monitorsAny`):

1. Today **monitoring does not require a return date** (row 5) and **EPI next-dose is not a required date** in the BHC flow (row 2): there is no BHC input for it and the one rule that says "required" is dead. If Task 7 makes continued monitoring or an EPI next date *mandatory*, that is a new rule, on both frontend and server. The server has no matching rule today, so the plan would also need one (or accept a frontend-only rule).
2. The only mandatory-date rule that exists is a concern that schedules a follow-up (row 1), plus the API-only status rule (row 7).
3. `reasonExempt` already matches the server in spirit: the reason is required only when a concern schedules the follow-up (`HealthRecordRequest.php:524-536`); a service-only or monitoring-only visit is exempt on the server. On the frontend `carePlanFollowUpErrors` requires the reason for *any kept follow-up that has a date* (`carePlanWorkspace.js:133`), which is stricter than the server for service and monitoring visits. A mismatch exists today.
4. Prenatal and Family Planning: Prenatal has no return-date field at all; Family Planning's `nextAppointmentDate` has no BHC input. If the plan needs a service return date, the single `followUpDate` is the only field, labelled by `SERVICE_NEXT_VISIT_LABELS`.

## After Task 0.5 (targeted 403 test-setup sweep, tests only)

**This section supersedes the failing-name list above as the baseline that later tasks are compared against.** Only test files changed (`backend/tests/Feature/` x5) plus this document; no application code, config, migration or route was touched.

| Suite | Before (Task 0) | After Task 0.5 |
|---|---|---|
| Backend full run | 697 tests, 490 passed, 186 failing names (183 F + 3 E) | 697 tests, 532 passed, **144 failing names** (141 F + 3 E), 21 skipped |
| New failing names | | **none** |
| Names fixed | | 42 (all in the five classes) |

Per class (tests passing / total):

| Class | Before | After |
|---|---|---|
| HealthRecordIdempotencyTest | 1/12 | 11/12 |
| HealthRecordDraftFinalizationTest | 7/13 | 12/13 |
| FollowUpConcurrencyTest | 1/10 | 9/10 |
| ReferralSubmissionGateTest | 0/8 | 7/8 |
| FacilityIsolationSecurityTest | 24/45 | 36/45 |

### Setup fix (all five classes)

BHW test users created without `permissions` got the encoder preset and a 403. Each class's user helper now gives BHW users `ActionPermissions::PRESETS['clinical']` (RHU and admin users are unchanged). `HealthRecordDraftFinalizationTest` already had the preset; its failures were all second-layer drift.

### (a) Fixes: clearly obsolete test input or expectation

No assertion on security, facility isolation, idempotency, concurrency or stock was weakened or removed. Payload-only fixes keep every assertion exactly as written; they make the request valid under the current rules so the original assertions run for real.

| Where | Old | New | Current rule |
|---|---|---|---|
| HealthRecordIdempotencyTest: `same_key_rejects_material_payload_changes_without_mutation`, `follow_up_completion_and_next_task_are_replayed_once`, `referral_and_database_notifications_are_created_once`, `late_referral_failure_rolls_back_record_stock_and_follow_up` | follow-up or referral payload with no `diagnosis`; medicine entries with no `confirmed_given` | add `diagnosis`; add `confirmed_given: true` to the medicine entries whose stock the test asserts | `HealthRecordRequest.php:460` (BHC Assessment required for follow-up or referral); `HealthRecordController.php:298` (only `confirmed_given === true` items deduct stock) |
| FollowUpConcurrencyTest: `one_different_key_submission_wins_and_the_second_has_no_effects`, `referral_failure_after_lock_rolls_back_completion_and_next_task` | same | same | same |
| FacilityIsolationSecurityTest `followUpPayload()` helper (feeds 6 tests that failed, plus `bhw_cannot_fulfill_other_bhc_follow_up_task`, which only passed before because the preset 403 matched its expected 403) | no `chief_complaint` | add `chief_complaint` | `HealthRecordRequest.php:281` |
| FacilityIsolationSecurityTest `valid_same_bhc_medicine_selection_succeeds` | planned item (no flag), asserts 18 left | add `confirmed_given: true` | `HealthRecordController.php:298` |
| FacilityIsolationSecurityTest `existing_follow_up_record_can_be_edited_without_reusing_task` | PATCH expected 200 with the notes echoed | PATCH expected 409; the final "task still fulfilled by the original record" assertion is unchanged; the notes-echo assertion is dropped because no edit exists | `HealthRecordController.php:497` (`update()` always answers 409: saved records are read-only). The test name still says "can be edited"; kept so the name stays traceable |
| HealthRecordDraftFinalizationTest `finalize()` helper | no draft version header | send `X-Draft-Version` = the draft's current version (caller-supplied headers still win) | `HealthRecordDraftService.php:367` |
| HealthRecordDraftFinalizationTest `officialPayload()` | medicine without `confirmed_given` | add `confirmed_given: true` (the rollback and replay tests now deduct, and roll back, real stock) | `HealthRecordController.php:298` |
| HealthRecordDraftFinalizationTest `referral_failure_rolls_back_official_work_and_keeps_encrypted_draft` | referral payload with no `diagnosis` | add `diagnosis` | `HealthRecordRequest.php:460` |
| HealthRecordDraftFinalizationTest `follow_up_failure_rolls_back_official_work_and_keeps_draft_active` | mock had only `lockTaskForProcessing` and `syncRecord`; the 500 came from an unmocked call, not from the forced failure | add `lockAdditionalTasks` to the mock | `HealthRecordController.php:232` |
| HealthRecordDraftFinalizationTest `custom_header_validation_and_absent_header_ordinary_save_contract`, `draft_binding_and_terminal_states_are_enforced_before_official_creation` direct POST payloads | no `chief_complaint` | add `chief_complaint` | `HealthRecordRequest.php:281` |

### Open after Task 0.5 (b): left failing, unchanged (13 names)

1. `HealthRecordIdempotencyTest::test_medicine_is_deducted_once_and_failure_rolls_back_record` (stock). Fails with `Failed asserting that 10 is identical to 6` because its payload is a planned item. Even with `confirmed_given`, its last step expects a 409 `INSUFFICIENT_STOCK` when a given quantity exceeds stock; `MedicineStockService.php:455-468` now records a shortage (`discrepancy`, `reconciliation_required`) and clamps to 0 instead of refusing (`ConsultationWorkflowRevisionTest::test_shortage_records_actual_quantity_once_on_retry` pins the new rule). Needs a stock-assertion rewrite, so a human decision. Suspicion: obsolete expectation, not a bug.
2. `FollowUpConcurrencyTest::test_medicine_failure_after_lock_leaves_task_active` (stock): expects 409 `INSUFFICIENT_STOCK`; same cause as item 1 (plus a missing `diagnosis`). Same suspicion.
3. `ReferralSubmissionGateTest::test_embedded_referral_path_is_gated_too` (referral gate): expects 422 `NO_PROVIDER_AVAILABLE` and no record from the embedded health-record path. The payload also lacks `chief_complaint` and `diagnosis`, but the deeper change is behavioral: `HealthRecordController.php:325-333` now finalizes the record and parks the referral in a hold ("Awaiting Doctor Availability"), pinned by `ConsultationWorkflowRevisionTest::test_zero_doctors_finalizes_without_submitting_referral`. Needs an assertion rewrite, so a human decision. Suspicion: obsolete expectation.
4. `FacilityIsolationSecurityTest::test_bhw_cannot_dispense_other_bhc_medicine_during_record_creation` (facility isolation): the request returns **201** instead of 422; stock is unchanged. The payload is a planned item (no `confirmed_given`), and planned items are stored in `items_planned` (`HealthRecordController.php:190`) with **no facility-ownership check**; only given items go through the `MedicineStockService` ownership check. A scratch copy with `confirmed_given: true` returned 422 and left stock at 20 (checked, then deleted). **Possible real gap**: another BHC's medicine id can be saved as a planned item. No stock effect, and the stored value is only the id and quantity, but it deserves a decision. Not fixed here.
5. `FacilityIsolationSecurityTest::test_health_record_update_cannot_reassign_patient` (facility isolation): expects 422 on `patient_id`, receives 409 because `update()` always answers 409 (`HealthRecordController.php:497`). The reassignment still cannot happen. Left for a human decision. Suspicion: obsolete expectation; the new expectation would be 409.
6. `HealthRecordDraftFinalizationTest::test_draft_binding_and_terminal_states_are_enforced_before_official_creation` (draft ownership isolation): another BHW of the same BHC finalizing the owner's draft is expected to get 404 and now gets 409. Drafts are looked up by BHC, not owner (`HealthRecordDraftService.php:341-343`), and guarded by an editor lease (`assertEditor`, `:473`: "Your editing session ended or was taken over"). The user cannot finalize the other's draft (409), so there is no visible escalation, but the old "invisible to other users" contract is gone, and the expired, discarded and other-facility checks after that assertion are not executed. Suspicion: obsolete after the draft editor-lease redesign, but it is an ownership-isolation assertion, so a human decision (probably a rewrite around the lease).
7. Seven user-admin names in `FacilityIsolationSecurityTest` (not the `store()` path): `test_rejects_bhw_without_bhc_assignment`, `test_rejects_bhw_with_both_facility_assignments`, `test_rejects_rhu_staff_without_rhu_assignment`, `test_rejects_rhu_staff_with_both_facility_assignments`, `test_rejects_clinical_account_assignment_to_inactive_facility`, `test_rejects_update_that_removes_bhw_bhc_assignment`, `test_rejects_update_that_adds_bhc_to_rhu_staff`. Cause: `UserRequest.php:33` now needs `permissions` and `permissions_confirmed`, so the 422 lacks the expected key. These are account facility-assignment assertions outside the 403 sweep, so left. A scratch copy with `permissions: []` and `permissions_confirmed: true` in `userPayload()` made the 5 POST tests pass; the 2 PATCH tests need `permissions_confirmed: true` as well (not retried). Suspicion: stale payload only.

### Failing names after Task 0.5 (144): the new baseline

The Task 0 list minus the 42 names fixed above (all in the five classes). The group labels in the earlier sections still describe the cause of every other name.

**AkayApiTest** (5)
- `AkayApiTest::test_bhw_can_manage_assigned_bhc_medicine_inventory`
- `AkayApiTest::test_empty_reports_return_zero_counts`
- `AkayApiTest::test_family_planning_health_record_saves_json_payload_and_can_be_filtered`
- `AkayApiTest::test_referral_creation_generates_tracking_notification_and_audit_log`
- `AkayApiTest::test_referral_creation_is_idempotent_by_client_submission_id`

**ApprovedFacilityPermissionsTest** (4)
- `ApprovedFacilityPermissionsTest::test_admin_has_no_automatic_clinical_finalization`
- `ApprovedFacilityPermissionsTest::test_encoder_cannot_browse_clinical_history_or_finalize_via_direct_api`
- `ApprovedFacilityPermissionsTest::test_other_users_assignment_and_cross_facility_patient_are_denied`
- `ApprovedFacilityPermissionsTest::test_rhu_nurse_can_select_a_dated_bhc_assignment_without_changing_home`

**AuthenticationSessionSecurityTest** (7)
- `AuthenticationSessionSecurityTest::test_active_and_facility_middleware_revoke_tokens_after_out_of_band_context_changes`
- `AuthenticationSessionSecurityTest::test_admin_password_change_revokes_existing_sessions`
- `AuthenticationSessionSecurityTest::test_bhc_and_rhu_assignment_changes_revoke_existing_tokens`
- `AuthenticationSessionSecurityTest::test_correcting_a_mixed_assignment_revokes_existing_tokens`
- `AuthenticationSessionSecurityTest::test_deactivation_revokes_all_tokens_and_reactivation_does_not_restore_them`
- `AuthenticationSessionSecurityTest::test_harmless_profile_update_does_not_revoke_valid_tokens`
- `AuthenticationSessionSecurityTest::test_role_and_facility_change_revokes_tokens_and_new_login_uses_new_context`

**BrowserSessionPrivacyTest** (3)
- `BrowserSessionPrivacyTest::test_health_record_responses_disable_browser_and_proxy_caching`
- `BrowserSessionPrivacyTest::test_referral_responses_disable_browser_and_proxy_caching`
- `BrowserSessionPrivacyTest::test_report_source_responses_disable_browser_and_proxy_caching`

**ClinicalFlowEndToEndTest** (5)
- `ClinicalFlowEndToEndTest::test_follow_up_visit_fulfils_the_task_and_links_to_the_parent_record`
- `ClinicalFlowEndToEndTest::test_health_records_list_exposes_the_resolved_outcome`
- `ClinicalFlowEndToEndTest::test_referral_disposition_creates_the_referral_and_reads_referred`
- `ClinicalFlowEndToEndTest::test_routine_disposition_creates_no_follow_up_and_reads_routine`
- `ClinicalFlowEndToEndTest::test_scheduled_follow_up_appears_in_the_follow_ups_module`

**ConsultationIdentityTest** (9)
- `ConsultationIdentityTest::test_a_discarded_draft_never_blocks_its_consultation_from_saving_again`
- `ConsultationIdentityTest::test_another_users_record_is_never_identified_by_a_shared_uuid`
- `ConsultationIdentityTest::test_consultation_uuid_cannot_be_changed_on_an_existing_record`
- `ConsultationIdentityTest::test_consultation_uuid_is_hidden_from_health_record_responses`
- `ConsultationIdentityTest::test_consultation_uuid_is_never_an_authorization_key`
- `ConsultationIdentityTest::test_final_record_receives_the_consultations_uuid_separate_from_idempotency_key`
- `ConsultationIdentityTest::test_idempotent_replay_is_unchanged_and_ignores_consultation_uuid`
- `ConsultationIdentityTest::test_records_without_an_identity_never_collide_with_each_other`
- `ConsultationIdentityTest::test_the_same_consultation_cannot_become_two_records_under_a_new_key`

**ConsultationProgramsTest** (2)
- `ConsultationProgramsTest::test_patient_past_medical_history_is_untouched_by_record_writes`
- `ConsultationProgramsTest::test_secondary_program_data_round_trips_without_changing_primary_category`

**FacilityIsolationSecurityTest** (9)
- `FacilityIsolationSecurityTest::test_bhw_cannot_dispense_other_bhc_medicine_during_record_creation`
- `FacilityIsolationSecurityTest::test_health_record_update_cannot_reassign_patient`
- `FacilityIsolationSecurityTest::test_rejects_bhw_with_both_facility_assignments`
- `FacilityIsolationSecurityTest::test_rejects_bhw_without_bhc_assignment`
- `FacilityIsolationSecurityTest::test_rejects_clinical_account_assignment_to_inactive_facility`
- `FacilityIsolationSecurityTest::test_rejects_rhu_staff_with_both_facility_assignments`
- `FacilityIsolationSecurityTest::test_rejects_rhu_staff_without_rhu_assignment`
- `FacilityIsolationSecurityTest::test_rejects_update_that_adds_bhc_to_rhu_staff`
- `FacilityIsolationSecurityTest::test_rejects_update_that_removes_bhw_bhc_assignment`

**FollowUpCalendarEndpointTest** (4)
- `FollowUpCalendarEndpointTest::test_calendar_groups_tasks_by_due_date`
- `FollowUpCalendarEndpointTest::test_calendar_includes_superseded_rows_on_their_original_day`
- `FollowUpCalendarEndpointTest::test_calendar_is_facility_scoped`
- `FollowUpCalendarEndpointTest::test_calendar_requires_a_date_range`

**FollowUpConcurrencyTest** (1)
- `FollowUpConcurrencyTest::test_medicine_failure_after_lock_leaves_task_active`

**FollowUpEpisodeTest** (1)
- `FollowUpEpisodeTest::test_details_return_the_explicit_episode_in_visit_and_schedule_order`

**FollowUpRescheduleModelTest** (5)
- `FollowUpRescheduleModelTest::test_a_superseded_and_its_active_replacement_can_coexist`
- `FollowUpRescheduleModelTest::test_a_superseded_task_is_no_longer_processable`
- `FollowUpRescheduleModelTest::test_index_shows_only_the_current_task_after_reschedule`
- `FollowUpRescheduleModelTest::test_rescheduling_a_no_show_task_leaves_its_state_as_no_show`
- `FollowUpRescheduleModelTest::test_rescheduling_a_pending_task_supersedes_it_with_a_new_row`

**FollowUpTaskSchedulingTest** (8)
- `FollowUpTaskSchedulingTest::test_active_patient_lookup_returns_all_unrelated_episodes_in_schedule_order`
- `FollowUpTaskSchedulingTest::test_cancel_preserves_history_and_removes_task_from_active_lookup`
- `FollowUpTaskSchedulingTest::test_follow_up_visit_requires_time_when_scheduling_another_visit`
- `FollowUpTaskSchedulingTest::test_general_consultation_follow_up_required_needs_a_date_and_time`
- `FollowUpTaskSchedulingTest::test_initial_health_record_save_creates_one_schedule_with_required_time`
- `FollowUpTaskSchedulingTest::test_one_active_task_is_returned_without_auto_linking_a_new_consultation`
- `FollowUpTaskSchedulingTest::test_referral_disposition_ignores_stale_follow_up_fields`
- `FollowUpTaskSchedulingTest::test_reschedule_updates_date_time_notes_and_rejects_terminal_tasks`

**FollowUpTaskSyncServiceTest** (1)
- `FollowUpTaskSyncServiceTest::test_resyncing_a_record_does_not_undo_a_reschedule`

**FormsFinalizationChecklistTest** (3)
- `FormsFinalizationChecklistTest::test_maternal_td_doses_are_accepted_and_persisted_separately_from_tt`
- `FormsFinalizationChecklistTest::test_pulse_and_spo2_vitals_are_accepted_and_persisted`
- `FormsFinalizationChecklistTest::test_tb_comorbidity_screening_fields_are_accepted_and_persisted`

**HealthRecordDraftFinalizationTest** (1)
- `HealthRecordDraftFinalizationTest::test_draft_binding_and_terminal_states_are_enforced_before_official_creation`

**HealthRecordDraftTest** (2)
- `HealthRecordDraftTest::test_official_failure_keeps_draft_active_and_successful_commit_consumes_it`
- `HealthRecordDraftTest::test_other_users_roles_and_invalid_facility_assignments_cannot_access_draft`

**HealthRecordIdempotencyTest** (1)
- `HealthRecordIdempotencyTest::test_medicine_is_deducted_once_and_failure_rolls_back_record`

**MedicineInventoryWorkflowTest** (14)
- `MedicineInventoryWorkflowTest::test_adjustment_actions_use_positive_input_and_record_signed_deltas`
- `MedicineInventoryWorkflowTest::test_authorized_bhc_and_rhu_restock_increment_and_create_one_ledger_row`
- `MedicineInventoryWorkflowTest::test_batch_key_supports_multiple_medicines_but_same_batch_cannot_repeat`
- `MedicineInventoryWorkflowTest::test_creation_derives_facility_and_records_only_positive_opening_balance`
- `MedicineInventoryWorkflowTest::test_expired_disposal_succeeds_but_invalid_or_excessive_outflow_does_not_mutate`
- `MedicineInventoryWorkflowTest::test_generic_metadata_update_cannot_replace_quantity`
- `MedicineInventoryWorkflowTest::test_history_is_paginated_newest_first_and_facility_scoped`
- `MedicineInventoryWorkflowTest::test_history_response_uses_a_safe_allowlist_for_all_transaction_types`
- `MedicineInventoryWorkflowTest::test_negative_opening_balance_and_client_facility_override_fail_validation`
- `MedicineInventoryWorkflowTest::test_non_correction_direction_is_rejected`
- `MedicineInventoryWorkflowTest::test_restock_requires_reason_and_rejects_cross_facility_access`
- `MedicineInventoryWorkflowTest::test_rhu_health_record_dispensing_is_rejected_and_rolled_back`
- `MedicineInventoryWorkflowTest::test_rhu_history_is_available_only_to_its_own_rhu_staff`
- `MedicineInventoryWorkflowTest::test_used_medicine_is_archived_while_unused_zero_stock_can_be_deleted`

**MedicineStockConcurrencyTest** (14)
- `MedicineStockConcurrencyTest::test_all_rows_are_validated_before_any_multi_item_deduction`
- `MedicineStockConcurrencyTest::test_authorized_submission_deducts_locked_stock_and_creates_one_normalized_history_row`
- `MedicineStockConcurrencyTest::test_cross_facility_inventory_is_rejected_without_stock_details`
- `MedicineStockConcurrencyTest::test_different_keys_use_current_stock_while_same_key_replays_without_another_deduction`
- `MedicineStockConcurrencyTest::test_direct_dispense_endpoint_deducts_once_for_an_existing_record`
- `MedicineStockConcurrencyTest::test_health_record_without_medicines_still_succeeds`
- `MedicineStockConcurrencyTest::test_idempotency_hash_normalizes_reordered_and_combined_medicine_entries`
- `MedicineStockConcurrencyTest::test_insufficient_stock_returns_safe_conflict_and_creates_no_official_effects`
- `MedicineStockConcurrencyTest::test_invalid_unavailable_expired_and_missing_items_create_no_effects`
- `MedicineStockConcurrencyTest::test_late_audit_failure_rolls_back_record_stock_and_history`
- `MedicineStockConcurrencyTest::test_multiple_sufficient_items_deduct_once_regardless_of_browser_order`
- `MedicineStockConcurrencyTest::test_pre_phase_2c_medicine_hash_remains_replayable`
- `MedicineStockConcurrencyTest::test_processed_follow_up_conflict_precedes_stock_validation`
- `MedicineStockConcurrencyTest::test_stock_conflict_leaves_linked_follow_up_active_and_creates_no_next_task`

**NotificationRemediationTest** (4)
- `NotificationRemediationTest::test_counts_reflects_true_totals_across_categories`
- `NotificationRemediationTest::test_mark_unread_persists_across_a_refetch`
- `NotificationRemediationTest::test_search_matches_on_title_and_message`
- `NotificationRemediationTest::test_trash_and_restore_round_trip`

**PrenatalFormFieldsTest** (2)
- `PrenatalFormFieldsTest::test_official_record_keeps_the_new_prenatal_fields`
- `PrenatalFormFieldsTest::test_official_record_validates_the_new_prenatal_fields`

**ReferralAttentionTransitionTest** (8)
- `ReferralAttentionTransitionTest::test_direct_referral_accepts_priority`
- `ReferralAttentionTransitionTest::test_direct_referral_accepts_routine`
- `ReferralAttentionTransitionTest::test_direct_referral_rejects_every_retired_value`
- `ReferralAttentionTransitionTest::test_direct_referral_requires_an_explicit_value`
- `ReferralAttentionTransitionTest::test_embedded_referral_accepts_priority`
- `ReferralAttentionTransitionTest::test_embedded_referral_rejects_retired_value`
- `ReferralAttentionTransitionTest::test_embedded_referral_requires_an_explicit_value`
- `ReferralAttentionTransitionTest::test_health_record_without_a_referral_is_unaffected`

**ReferralHoldTest** (10)
- `ReferralHoldTest::test_blocked_submission_records_a_waiting_hold`
- `ReferralHoldTest::test_discard_is_forbidden_for_another_bhws_hold`
- `ReferralHoldTest::test_discard_rejects_an_already_resolved_hold`
- `ReferralHoldTest::test_existing_waiting_hold_does_not_change_the_gate_decision`
- `ReferralHoldTest::test_flip_to_available_notifies_waiting_holds`
- `ReferralHoldTest::test_flip_to_unavailable_and_unrelated_edits_notify_nobody`
- `ReferralHoldTest::test_index_returns_only_the_callers_waiting_holds`
- `ReferralHoldTest::test_notification_cooldown_suppresses_rapid_repeat_notifications`
- `ReferralHoldTest::test_resume_hold_id_is_scoped_to_its_creator`
- `ReferralHoldTest::test_successful_resubmission_resolves_the_hold`

**ReferralQrSecurityTest** (8)
- `ReferralQrSecurityTest::test_admin_keeps_existing_details_access_but_cannot_use_clinical_qr_workflows`
- `ReferralQrSecurityTest::test_authorized_bhw_lazily_obtains_an_opaque_secure_qr_without_serializing_secrets`
- `ReferralQrSecurityTest::test_authorized_rhu_resolves_qr_then_details_authorizes_again_and_audits_safely`
- `ReferralQrSecurityTest::test_regeneration_replaces_token_without_changing_referral_identity_or_ownership`
- `ReferralQrSecurityTest::test_repeated_display_reuses_one_active_token_and_one_generation_audit`
- `ReferralQrSecurityTest::test_tracking_lookup_and_regeneration_have_independent_rate_limits`
- `ReferralQrSecurityTest::test_tracking_lookup_is_authenticated_exact_and_facility_scoped`
- `ReferralQrSecurityTest::test_valid_token_does_not_bypass_rhu_or_role_isolation`

**ReferralRoutingSecurityTest** (5)
- `ReferralRoutingSecurityTest::test_changing_mapping_does_not_rewrite_existing_referral_destination`
- `ReferralRoutingSecurityTest::test_client_destination_overrides_are_ignored`
- `ReferralRoutingSecurityTest::test_inactive_mapped_rhu_blocks_referral_creation`
- `ReferralRoutingSecurityTest::test_unmapped_bhc_cannot_create_a_referral`
- `ReferralRoutingSecurityTest::test_valid_referral_is_routed_from_authenticated_bhc_to_mapped_rhu`

**ReferralStatusStateMachineTest** (1)
- `ReferralStatusStateMachineTest::test_new_referral_forces_pending_and_creates_one_initial_history`

**ReferralSubmissionGateTest** (1)
- `ReferralSubmissionGateTest::test_embedded_referral_path_is_gated_too`

**SecureServerCacheTest** (6)
- `SecureServerCacheTest::test_medicine_cache_records_miss_then_hit_with_identical_allowlisted_response`
- `SecureServerCacheTest::test_official_dispensing_invalidates_bhc_display_after_commit`
- `SecureServerCacheTest::test_referral_receive_feedback_and_no_show_each_invalidate_aggregate_cache`
- `SecureServerCacheTest::test_report_cache_is_invalidated_by_committed_referral_for_affected_facilities_only`
- `SecureServerCacheTest::test_rhu_medicine_and_patient_volume_mutations_invalidate_only_affected_report`
- `SecureServerCacheTest::test_successful_and_failed_stock_mutations_handle_invalidation_and_database_authority`


## After Task 5 (BHC General Consultation v2, backend complete)

Full backend run at the end of Task 5 (junit kept outside the repository): 765 tests, 600 passed, **144 failing names** (141 F + 3 E), 21 skipped. The 68 added tests since Task 0.5 are the new v2 tests in `BhcGeneralConsultationV2Test` (51 in that class, all passing) and the Task 4 draft tests.

Comparison by name against the 144 names under "Failing names after Task 0.5": **no new failing name**, and the failing set is identical.

Noted, not credited (baseline names that now pass): none.

## After implementation (Task 12)

Branch `bhc-general-consultation-simplification`, full verification after Task 11. No application code was changed in this task.

### Backend

Command (from `backend/`): `php -d memory_limit=2G vendor/bin/phpunit --log-junit <scratchpad>/after-junit.xml`

| Suite | After Task 0.5 (baseline) | After implementation |
|---|---|---|
| Backend full run | 697 tests, 532 passed, 144 failing names (141 F + 3 E), 21 skipped | 766 tests, 601 passed, **144 failing names** (141 F + 3 E), 21 skipped |
| New failing names | | **none** |
| Baseline names now passing | | none (the 144 names are exactly the same set) |

The failing names were taken from the junit file (every `<testcase>` holding a `<failure>` or `<error>`, as `Class::method`) and compared one by one against the 144 names under "Failing names after Task 0.5". The sets are identical: 0 new, 0 changed. The 69 added tests (766 vs 697) all pass. The 144 remain the pre-existing failures described above (stale 403 preset/payload drift and the open items (b) 1-7); none was touched or masked.

### Frontend

| Command (from `frontend/`) | Result |
|---|---|
| `node --test` | 603 tests, 603 pass, 0 fail, 0 skipped |
| `npm run lint` | 0 errors, 1 warning (the pre-existing `react-hooks/exhaustive-deps` in `src/pages/rhu/RHUAddHealthRecords.jsx:791`) |
| `npm run build` | passes (`built in 2.13s`; only the usual >500 kB chunk-size notice) |

### Responsive check (harness only)

A throwaway Vite entry rendered the real `NextStepsSection`, `ReportingEntriesField`, `ReferralFacilityField` and `ConsultationReviewStep` (inside `NextActionStep`) with stubbed props and data, at 1366x768 and 390x844 in headless Microsoft Edge via DevTools device-metrics override. The harness was written to a temporary folder in `frontend/` and deleted afterwards; `git status` shows no leftover files, and `package.json` was not touched. Results are **harness only**: they are not a check of the real workspace page (no login, no DashboardLayout sidebar, no sticky action bar).

All five states, at both widths: no horizontal scroll (document scrollWidth never exceeded the viewport), no element past the viewport edge, no clipped control, the UI copy matched the plan's "UI copy (exact)" list, and no card sits inside a card. In step 3 the one wizard card holds flat sections divided by thin rules; the only bordered box inside it is the amber non-blocking date warning, which is an inline notice, not a card. Review shows one bordered block per group, side by side in a stack, none nested, and the Patient row is first.

Not covered: `DispensedMedicinesSection` (Medicines / Supplies Dispensed) was replaced by the Actions Taken field, so its layout is UNVERIFIED. Step 3 runs full width by design (the right-hand services column appears on Patient Interview only), so there is no services sidebar to check on step 3.

Minor finding (cosmetic, not a defect to block on): at 390 px the required asterisk of "Reported Health Problem / Suspected Case" wraps to its own line, because the Remove button takes width beside the input (`ReportingEntriesField.jsx`, the `flex items-start gap-3` row at line 59).
