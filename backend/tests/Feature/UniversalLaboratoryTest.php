<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\LaboratoryAddendum;
use App\Models\LaboratoryAttachment;
use App\Models\LaboratoryTest;
use App\Models\MonitoringHandoffRequest;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\LaboratoryEvidenceService;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UniversalLaboratoryTest extends TestCase
{
    use RefreshDatabase;

    private User $clinician;

    private User $bhcUser;

    private Patient $patient;

    private RhuVisitQueueEntry $visit;

    private string $uuid;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Laboratory RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Laboratory BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->clinician = User::create([
            'name' => 'Lab Clinician', 'email' => 'lab@example.test', 'password' => 'password123',
            'status' => 'active', 'role' => 'rhu', 'staff_role' => 'doctor', 'rural_health_unit_id' => $rhu->id,
            'permissions' => array_unique([...StaffRoles::defaults('doctor'), 'consultations.encode', 'consultations.finalize', 'records.correct', 'clinical.history']),
        ]);
        $this->bhcUser = User::create([
            'name' => 'Lab BHC Staff', 'email' => 'bhclab@example.test', 'password' => 'password123',
            'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $bhc->id,
            'permissions' => StaffRoles::defaults('midwife'),
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Synthetic', 'last_name' => 'Laboratory', 'sex' => 'Female', 'status' => 'active',
            'rural_health_unit_id' => $rhu->id, 'barangay_health_center_id' => $bhc->id,
        ]);
        $this->visit = RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $rhu->id, 'patient_id' => $this->patient->id, 'source' => 'walk_in',
            'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => 'lab-'.Str::uuid(),
        ]);
        $this->as($this->clinician);
        $this->uuid = $this->postJson("/api/rhu-visits/{$this->visit->id}/start")->assertOk()->json('data.consultation_uuid');
    }

    private function as(User $user): void
    {
        Sanctum::actingAs($user, ['akay:access']);
    }

    private function laboratoryEntry(array $changes = []): array
    {
        return ['id' => (string) Str::uuid(), 'testName' => 'Any repeated test', 'collectionDate' => '2026-11-01',
            'examinationDate' => null, 'resultStatus' => 'Requested', 'result' => null, ...$changes];
    }

    private function finalize(array $entries, array $extra = [])
    {
        return $this->withHeaders(['Idempotency-Key' => (string) Str::uuid()])->postJson('/api/health-records', [
            'consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1, 'consultation_uuid' => $this->uuid,
            'rhu_visit_id' => $this->visit->id, 'patient_id' => $this->patient->id, 'category' => 'General Consultation',
            'chief_complaint' => 'Laboratory review', 'physical_exam' => 'Original examination',
            'laboratory_tests' => $entries, ...$extra,
        ]);
    }

    private function draftInput(array $payload): array
    {
        return ['patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'consultation_uuid' => $this->uuid, 'rhu_visit_id' => $this->visit->id,
            'payload' => ['consultationWorkflow' => HealthRecord::WORKFLOW_RHU_ITR_V1, 'chiefComplaint' => 'Laboratory review', ...$payload]];
    }

    private function context(string $testId): array
    {
        return ['patient_id' => $this->patient->id, 'rhu_visit_id' => $this->visit->id,
            'consultation_uuid' => $this->uuid, 'test_client_id' => $testId];
    }

    private function diagnosis(array $changes = []): array
    {
        return ['id' => 'd1', 'name' => 'Hypertension', 'activate' => true, 'nextAction' => 'manage_to_bhc',
            'receivingBhcId' => $this->bhcUser->barangay_health_center_id, 'monitoringRecommendation' => 'Monitor as directed', ...$changes];
    }

    public function test_repeated_tests_persist_and_available_result_is_required(): void
    {
        $entry = $this->laboratoryEntry(['resultStatus' => 'Result Available', 'result' => ' ']);
        $this->finalize([$entry])->assertUnprocessable()->assertJsonValidationErrors('laboratory_tests.0.result');
        $this->finalize([$this->laboratoryEntry(['testName' => ' '])])->assertUnprocessable();
        $this->finalize([$this->laboratoryEntry(['resultStatus' => 'invalid'])])->assertUnprocessable();
        $this->finalize([$this->laboratoryEntry(['collectionDate' => 'invalid'])])->assertUnprocessable();
        $entry['result'] = 'Clinical result in free text';
        $this->finalize([$entry, $this->laboratoryEntry(), $this->laboratoryEntry(['resultStatus' => 'Awaiting Result'])])->assertCreated();
        $this->assertDatabaseCount('laboratory_tests', 3);
        $this->assertDatabaseHas('laboratory_tests', ['patient_id' => $this->patient->id, 'created_by' => $this->clinician->id]);
        $record = HealthRecord::firstOrFail();
        $this->getJson("/api/health-records/{$record->id}/laboratory-tests")->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_patient_laboratory_listing_includes_visit_context_and_addendum_capability(): void
    {
        $this->finalize([
            $this->laboratoryEntry(['testName' => 'GeneXpert', 'resultStatus' => 'Awaiting Result']),
            $this->laboratoryEntry(['testName' => 'CBC', 'resultStatus' => 'Requested']),
        ])->assertCreated();

        $payload = $this->getJson('/api/laboratory-evidence/patients/'.$this->patient->id)
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->json('data');
        $this->assertNotEmpty($payload[0]['facilityName'] ?? null);
        $this->assertSame('RHU', $payload[0]['facilityType']);
        $this->assertTrue($payload[0]['canAddendum']);
        $this->assertNotEmpty($payload[0]['visitDate'] ?? null);
        $this->assertContains($payload[0]['testName'], ['GeneXpert', 'CBC']);

        $this->as($this->bhcUser);
        $this->getJson('/api/laboratory-evidence/patients/'.$this->patient->id)
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->bhcUser->update(['permissions' => ['patients.register']]);
        $this->as($this->bhcUser);
        $this->getJson('/api/laboratory-evidence/patients/'.$this->patient->id)->assertForbidden();
    }

    public function test_supporting_laboratory_tests_remap_without_sharing_or_deleting_source_rows(): void
    {
        $first = $this->laboratoryEntry(['testName' => 'Xpert MTB/RIF', 'resultStatus' => 'Awaiting Result']);
        $second = $this->laboratoryEntry(['testName' => 'Serum Creatinine']);
        $presumptive = [
            'id' => 'tb', 'name' => 'TB', 'activate' => true, 'nextAction' => 'none',
            'tbManagement' => ['diagnosisType' => 'presumptive_tb', 'drugResistance' => '', 'openTreatmentCard' => false],
            'supportingLaboratoryTests' => [['reference' => 'current:'.$first['id']]],
        ];
        $hypertension = [
            'id' => 'htn', 'name' => 'Hypertension', 'activate' => false, 'nextAction' => 'none',
            'supportingLaboratoryTests' => [
                ['reference' => 'current:'.$first['id']],
                ['reference' => 'current:'.$second['id']],
            ],
        ];
        $this->finalize([$first, $second], ['diagnoses' => [$presumptive, $hypertension]])->assertCreated();
        $record = HealthRecord::sole();
        $firstId = LaboratoryTest::query()->where('client_id', strtolower($first['id']))->value('id');
        $secondId = LaboratoryTest::query()->where('client_id', strtolower($second['id']))->value('id');
        $this->assertSame([['reference' => 'record:'.$firstId]], $record->diagnoses[0]['supportingLaboratoryTests']);
        $this->assertSame([
            ['reference' => 'record:'.$firstId],
            ['reference' => 'record:'.$secondId],
        ], $record->diagnoses[1]['supportingLaboratoryTests']);
        $this->assertArrayNotHasKey('laboratoryEvidence', $record->diagnoses[0]);
        $this->assertDatabaseCount('laboratory_tests', 2);
        $this->assertDatabaseCount('monitoring_laboratory_evidence', 0);
        $this->assertDatabaseHas('patient_conditions', [
            'patient_id' => $this->patient->id,
            'condition_identity' => 'tuberculosis',
            'status' => 'under_evaluation',
        ]);
    }

    public function test_service_supporting_labs_remap_current_references_into_monitoring_data(): void
    {
        $first = $this->laboratoryEntry(['testName' => 'CBC', 'resultStatus' => 'Awaiting Result']);
        $second = $this->laboratoryEntry(['testName' => 'Urinalysis']);
        $this->finalize([$first, $second], [
            'care_plan' => [
                'service_supporting_labs' => [
                    [
                        'program' => 'Family Planning',
                        'supporting_laboratory_tests' => [
                            ['reference' => 'current:'.$first['id']],
                            ['reference' => 'current:'.$second['id']],
                        ],
                    ],
                    [
                        'program' => 'EPI',
                        'supporting_laboratory_tests' => [
                            ['reference' => 'current:'.$first['id']],
                        ],
                    ],
                ],
            ],
            'diagnoses' => [$this->diagnosis([
                'nextAction' => 'none',
                'receivingBhcId' => null,
                'monitoringRecommendation' => null,
                'supportingLaboratoryTests' => [['reference' => 'current:'.$first['id']]],
            ])],
        ])->assertCreated();

        $record = HealthRecord::sole();
        $firstId = LaboratoryTest::query()->where('client_id', strtolower($first['id']))->value('id');
        $secondId = LaboratoryTest::query()->where('client_id', strtolower($second['id']))->value('id');
        $this->assertSame([
            [
                'program' => 'Family Planning',
                'supportingLaboratoryTests' => [
                    ['reference' => 'record:'.$firstId],
                    ['reference' => 'record:'.$secondId],
                ],
            ],
            [
                'program' => 'EPI',
                'supportingLaboratoryTests' => [
                    ['reference' => 'record:'.$firstId],
                ],
            ],
        ], $record->monitoring_data['serviceSupportingLabs']);
        $this->assertSame([['reference' => 'record:'.$firstId]], $record->diagnoses[0]['supportingLaboratoryTests']);
        $this->assertDatabaseCount('laboratory_tests', 2);
        $this->assertDatabaseCount('monitoring_laboratory_evidence', 0);
    }

    public function test_draft_allows_service_supporting_labs_under_care_plan(): void
    {
        $entry = $this->laboratoryEntry();
        $payload = [
            'laboratoryTests' => [$entry],
            'carePlan' => [
                'serviceSupportingLabs' => [
                    [
                        'program' => 'Maternal',
                        'supportingLaboratoryTests' => [['reference' => 'current:'.$entry['id']]],
                    ],
                ],
            ],
        ];
        $created = $this->postJson('/api/health-record-drafts', $this->draftInput($payload))->assertCreated();
        $labs = $this->getJson('/api/health-record-drafts/'.$created->json('data.id'))
            ->assertOk()
            ->json('data.payload.carePlan.serviceSupportingLabs');
        $this->assertIsArray($labs);
        $this->assertSame('Maternal', $labs[0]['program'] ?? null);
        $this->assertSame(
            'current:'.$entry['id'],
            $labs[0]['supportingLaboratoryTests'][0]['reference'] ?? null
        );
    }

    public function test_draft_edit_remove_resume_conflict_and_finalize_use_existing_pipeline(): void
    {
        $first = $this->laboratoryEntry();
        $second = $this->laboratoryEntry();
        $payload = ['laboratoryTests' => [$first, $second], 'diagnoses' => [$this->diagnosis([
            'laboratoryEvidence' => [['reference' => 'current:'.$first['id'], 'version' => 0]],
            'laboratoryEvidenceConfirmed' => true,
        ])]];
        $created = $this->postJson('/api/health-record-drafts', $this->draftInput($payload))->assertCreated();
        $id = $created->json('data.id');
        $version = $created->json('data.version');
        $this->assertDatabaseCount('laboratory_tests', 0);
        $this->assertDatabaseCount('monitoring_laboratory_evidence', 0);
        $this->getJson('/api/health-record-drafts/'.$id)->assertOk()->assertJsonPath('data.payload.laboratoryTests.1.id', $second['id']);
        $first['resultStatus'] = 'Result Available';
        $first['result'] = 'Updated draft result';
        $payload['laboratoryTests'] = [$first];
        $updated = $this->putJson('/api/health-record-drafts/'.$id, [...$this->draftInput($payload), 'version' => $version])->assertOk();
        $this->putJson('/api/health-record-drafts/'.$id, [...$this->draftInput($payload), 'version' => $version])->assertConflict();
        $this->getJson('/api/health-record-drafts/'.$id)->assertOk()->assertJsonCount(1, 'data.payload.laboratoryTests')->assertJsonPath('data.payload.laboratoryTests.0.result', 'Updated draft result');
        $this->withHeaders(['X-Health-Record-Draft-ID' => $id, 'X-Draft-Version' => (string) $updated->json('data.version')]);
        $this->finalize([$first], ['diagnoses' => $payload['diagnoses']])->assertCreated();
        $this->assertDatabaseHas('health_record_drafts', ['public_id' => $id, 'status' => 'consumed']);
        $this->assertDatabaseCount('laboratory_tests', 1);
        $this->assertDatabaseCount('monitoring_laboratory_evidence', 1);
    }

    public function test_old_and_incomplete_drafts_remain_recoverable_and_unknown_fields_rejected(): void
    {
        $created = $this->postJson('/api/health-record-drafts', $this->draftInput([]))->assertCreated();
        $id = $created->json('data.id');
        $this->getJson('/api/health-record-drafts/'.$id)->assertOk()->assertJsonMissingPath('data.payload.laboratoryTests');
        $entry = $this->laboratoryEntry(['testName' => '', 'resultStatus' => 'Result Available']);
        $updated = $this->putJson('/api/health-record-drafts/'.$id, [...$this->draftInput(['laboratoryTests' => [$entry]]), 'version' => $created->json('data.version')])->assertOk();
        $entry['unsafe'] = 'rejected';
        $this->putJson('/api/health-record-drafts/'.$id, [...$this->draftInput(['laboratoryTests' => [$entry]]), 'version' => $updated->json('data.version')])->assertUnprocessable();
        $this->deleteJson('/api/health-record-drafts/'.$id, ['version' => $updated->json('data.version')])->assertNoContent();
        $this->assertDatabaseCount('laboratory_tests', 0);
    }

    public function test_addendum_is_authorized_audited_and_never_rewrites_original_or_shared_version(): void
    {
        $entry = $this->laboratoryEntry();
        $this->finalize([$entry], ['diagnoses' => [$this->diagnosis([
            'laboratoryEvidence' => [['reference' => 'current:'.$entry['id'], 'version' => 0]], 'laboratoryEvidenceConfirmed' => true,
        ])]])->assertCreated();
        $test = LaboratoryTest::firstOrFail();
        $record = HealthRecord::firstOrFail();
        $handoff = MonitoringHandoffRequest::firstOrFail();
        $entry['resultStatus'] = 'Result Available';
        $entry['result'] = 'Late result';
        $url = "/api/health-records/{$record->id}/laboratory-tests/{$test->id}/addenda";
        $this->postJson($url, ['tests' => [$entry], 'version' => 0, 'reason' => 'Report received today'])->assertCreated();
        $this->assertNull($test->fresh()->data['result']);
        $this->assertSame('Original examination', $record->fresh()->physical_exam);
        $this->assertTrue(AuditLog::where('module', 'laboratory_addenda')->exists());
        $this->postJson($url, ['tests' => [$entry], 'version' => 0, 'reason' => 'Stale update'])->assertConflict();
        $this->as($this->bhcUser);
        $this->getJson('/api/monitoring-handoff-requests/'.$handoff->id)->assertOk()->assertJsonPath('data.laboratory_evidence.0.resultStatus', 'Requested');
        $this->postJson($url, ['tests' => [$entry], 'version' => 0, 'reason' => 'BHC edit'])->assertForbidden();
        $this->getJson("/api/health-records/{$record->id}/laboratory-tests")->assertForbidden();
        $this->as($this->clinician);
        $this->postJson("/api/laboratory-evidence/handoffs/{$handoff->id}/share", [
            'selected' => [['reference' => 'record:'.$test->id, 'version' => LaboratoryAddendum::firstOrFail()->id]],
            'confirmed' => true, 'reason' => 'Reviewed late report for BHC',
            'sharingRevision' => (int) $handoff->laboratory_evidence_revision,
        ])->assertOk();
        $this->as($this->bhcUser);
        $this->getJson('/api/monitoring-handoff-requests/'.$handoff->id)->assertOk()->assertJsonPath('data.laboratory_evidence.0.result', 'Late result');
    }

    public function test_only_selected_evidence_is_shared_and_confirmation_is_required(): void
    {
        $first = $this->laboratoryEntry();
        $second = $this->laboratoryEntry(['testName' => 'Private test']);
        $diagnosis = $this->diagnosis(['laboratoryEvidence' => [['reference' => 'current:'.$first['id'], 'version' => 0]]]);
        $this->finalize([$first, $second], ['diagnoses' => [$diagnosis]])->assertUnprocessable();
        $this->assertDatabaseCount('health_records', 0);
        $diagnosis['laboratoryEvidenceConfirmed'] = true;
        $this->finalize([$first, $second], ['diagnoses' => [$diagnosis]])->assertCreated();
        $handoff = MonitoringHandoffRequest::firstOrFail();
        $this->as($this->bhcUser);
        $this->getJson('/api/monitoring-handoff-requests/'.$handoff->id)->assertOk()->assertJsonCount(1, 'data.laboratory_evidence')->assertJsonPath('data.laboratory_evidence.0.id', $first['id']);
        $this->postJson('/api/monitoring-handoff-requests/'.$handoff->id.'/accept')->assertOk();
        $this->getJson('/api/laboratory-evidence/monitoring/'.$this->patient->id)->assertOk()->assertJsonCount(1, 'data');
        $this->postJson('/api/laboratory-evidence/handoffs/'.$handoff->id.'/share', ['selected' => [], 'confirmed' => true, 'reason' => 'BHC attempt'])->assertForbidden();
        $handoff->update(['status' => 'declined']);
        $this->getJson('/api/monitoring-handoff-requests/'.$handoff->id)->assertOk()->assertJsonCount(0, 'data.laboratory_evidence');
    }

    public function test_retired_attachment_endpoints_are_unavailable(): void
    {
        $context = $this->context((string) Str::uuid());
        $id = (string) Str::uuid();
        $this->getJson('/api/laboratory-attachments?'.http_build_query($context))->assertNotFound();
        $this->post('/api/laboratory-attachments', [
            ...$context,
            'file' => UploadedFile::fake()->create('report.pdf', 100, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertNotFound();
        $this->assertDatabaseCount('laboratory_attachments', 0);
        $this->deleteJson('/api/laboratory-attachments/'.$id, $context)->assertNotFound();
    }

    public function test_structured_sharing_does_not_require_attachment_ids(): void
    {
        $entry = $this->laboratoryEntry(['resultStatus' => 'Result Available', 'result' => 'Structured share result']);
        $this->finalize([$entry], ['diagnoses' => [$this->diagnosis([
            'laboratoryEvidence' => [['reference' => 'current:'.$entry['id'], 'version' => 0]],
            'laboratoryEvidenceConfirmed' => true,
        ])]])->assertCreated();
        $shareRow = DB::table('monitoring_laboratory_evidence')->sole();
        $this->assertSame([], json_decode($shareRow->attachment_ids, true, 512, JSON_THROW_ON_ERROR));
        $handoff = MonitoringHandoffRequest::firstOrFail();
        $this->as($this->bhcUser);
        $response = $this->getJson('/api/monitoring-handoff-requests/'.$handoff->id)->assertOk();
        $response->assertJsonCount(1, 'data.laboratory_evidence')
            ->assertJsonPath('data.laboratory_evidence.0.result', 'Structured share result')
            ->assertJsonMissingPath('data.laboratory_evidence.0.attachments');
        $this->as($this->clinician);
        $this->postJson('/api/laboratory-evidence/handoffs/'.$handoff->id.'/share', [
            'selected' => [['reference' => 'record:'.LaboratoryTest::firstOrFail()->id, 'version' => 0]],
            'confirmed' => true,
            'reason' => 'Reconfirm structured evidence',
            'sharingRevision' => (int) $handoff->laboratory_evidence_revision,
        ])->assertOk();
        $this->assertSame([], json_decode(
            DB::table('monitoring_laboratory_evidence')->whereNull('withdrawn_at')->value('attachment_ids'),
            true,
            512,
            JSON_THROW_ON_ERROR
        ));
    }

    public function test_historical_share_attachment_ids_are_preserved_but_not_returned(): void
    {
        $entry = $this->laboratoryEntry(['resultStatus' => 'Result Available', 'result' => 'Legacy row result']);
        $this->finalize([$entry], ['diagnoses' => [$this->diagnosis([
            'laboratoryEvidence' => [['reference' => 'current:'.$entry['id'], 'version' => 0]],
            'laboratoryEvidenceConfirmed' => true,
        ])]])->assertCreated();
        $handoff = MonitoringHandoffRequest::firstOrFail();
        $test = LaboratoryTest::firstOrFail();
        $record = HealthRecord::firstOrFail();
        $legacyAttachmentId = (string) Str::uuid();
        LaboratoryAttachment::create([
            'id' => $legacyAttachmentId,
            'patient_id' => $this->patient->id,
            'health_record_id' => $record->id,
            'consultation_uuid' => $this->uuid,
            'test_client_id' => strtolower($entry['id']),
            'disk' => 'historical',
            'path' => 'laboratory/historical/'.$legacyAttachmentId,
            'name' => 'legacy-report.pdf',
            'mime_type' => 'application/pdf',
            'size' => 128,
            'created_by' => $this->clinician->id,
            'uploaded_at' => now(),
        ]);
        $legacyIds = [$legacyAttachmentId, (string) Str::uuid()];
        DB::table('monitoring_laboratory_evidence')->where('monitoring_handoff_request_id', $handoff->id)
            ->whereNull('withdrawn_at')
            ->update(['attachment_ids' => json_encode($legacyIds, JSON_THROW_ON_ERROR)]);
        $this->as($this->bhcUser);
        $this->postJson('/api/monitoring-handoff-requests/'.$handoff->id.'/accept')->assertOk();
        $this->getJson('/api/monitoring-handoff-requests/'.$handoff->id)
            ->assertOk()
            ->assertJsonPath('data.laboratory_evidence.0.result', 'Legacy row result')
            ->assertJsonMissingPath('data.laboratory_evidence.0.attachments');
        $this->getJson('/api/laboratory-evidence/monitoring/'.$this->patient->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonMissingPath('data.0.attachments');
        $stored = json_decode(
            DB::table('monitoring_laboratory_evidence')->where('laboratory_test_id', $test->id)->whereNull('withdrawn_at')->value('attachment_ids'),
            true,
            512,
            JSON_THROW_ON_ERROR
        );
        $this->assertSame($legacyIds, $stored);
    }

    public function test_unauthorized_bhc_cannot_read_rhu_source_laboratory_listing(): void
    {
        $this->finalize([$this->laboratoryEntry(['testName' => 'RHU-only listing'])])->assertCreated();
        $this->as($this->bhcUser);
        $this->getJson('/api/laboratory-evidence/patients/'.$this->patient->id)
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $otherBhc = BarangayHealthCenter::create([
            'name' => 'Foreign BHC', 'status' => 'active', 'rural_health_unit_id' => $this->clinician->rural_health_unit_id,
        ]);
        $this->bhcUser->update(['barangay_health_center_id' => $otherBhc->id]);
        $this->as($this->bhcUser->fresh());
        $this->getJson('/api/laboratory-evidence/patients/'.$this->patient->id)->assertForbidden();
    }

    public function test_historical_maternal_tb_and_form_4b_results_stay_readable(): void
    {
        $record = HealthRecord::create([
            'patient_id' => $this->patient->id, 'created_by' => $this->clinician->id,
            'rural_health_unit_id' => $this->clinician->rural_health_unit_id, 'category' => 'General Consultation',
            'maternal_data' => ['laboratoryEntries' => [['test' => 'cbc', 'result' => 'Historical maternal result']]],
            'tb_data' => ['laboratory' => ['xpert' => ['result' => 'Historical TB result']]],
        ]);
        $this->getJson('/api/health-records/'.$record->id)->assertOk()->assertJsonPath('data.maternal_data.laboratoryEntries.0.result', 'Historical maternal result');
        LaboratoryTest::create(['patient_id' => $this->patient->id, 'health_record_id' => $record->id,
            'client_id' => (string) Str::uuid(), 'created_by' => $this->clinician->id,
            'data' => $this->laboratoryEntry(['testName' => 'Universal TB reference', 'result' => 'Universal result', 'resultStatus' => 'Result Available'])]);
        $html = view('pdf.tb-treatment-card', ['record' => $record, 'patient' => $this->patient, 'tb' => $record->tb_data,
            'universalLaboratoryTests' => app(LaboratoryEvidenceService::class)->present($record)])->render();
        $this->assertStringContainsString('Historical TB result', $html);
        $this->assertStringContainsString('Universal result', $html);
        $universal = LaboratoryTest::firstOrFail();
        LaboratoryAddendum::create([
            'laboratory_test_id' => $universal->id,
            'data' => [...$universal->data, 'result' => 'Revised universal result'],
            'reason' => 'Report correction', 'created_by' => $this->clinician->id,
        ]);
        $revised = view('pdf.tb-treatment-card', ['record' => $record, 'patient' => $this->patient, 'tb' => $record->tb_data,
            'universalLaboratoryTests' => app(LaboratoryEvidenceService::class)->present($record)])->render();
        $this->assertStringContainsString('Laboratory addendum #', $revised);
        $this->assertStringContainsString('Revised universal result', $revised);
        $this->assertStringContainsString('Universal result', $revised);
        $this->get('/api/health-records/'.$record->id.'/tb-card-pdf')->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_stale_sharing_versions_and_cross_patient_evidence_are_rejected(): void
    {
        $entry = $this->laboratoryEntry();
        $this->finalize([$entry], ['diagnoses' => [$this->diagnosis()]])->assertCreated();
        $handoff = MonitoringHandoffRequest::firstOrFail();
        $test = LaboratoryTest::firstOrFail();
        $url = '/api/laboratory-evidence/handoffs/'.$handoff->id.'/share';
        $selection = ['selected' => [['reference' => 'record:'.$test->id, 'version' => 0]],
            'confirmed' => true, 'sharingRevision' => (int) $handoff->laboratory_evidence_revision, 'reason' => 'Reviewed evidence'];
        $this->postJson($url, [...$selection, 'confirmed' => false])->assertUnprocessable();
        $this->postJson($url, $selection)->assertOk();
        $this->postJson($url, $selection)->assertConflict();
        $otherPatient = $this->patient->replicate();
        $otherPatient->save();
        $test->update(['patient_id' => $otherPatient->id]);
        $this->postJson($url, [...$selection, 'sharingRevision' => $handoff->fresh()->laboratory_evidence_revision])->assertUnprocessable();
        $this->assertSame(1, DB::table('monitoring_laboratory_evidence')->whereNull('withdrawn_at')->count());
    }
}
