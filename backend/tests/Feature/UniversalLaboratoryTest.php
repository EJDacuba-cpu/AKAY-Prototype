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
use App\Services\LaboratoryAttachmentStorage;
use App\Services\LaboratoryEvidenceService;
use App\Services\StaffRoles;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Psr7\Response;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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

    private function fakeDurableDisk(): void
    {
        Storage::fake('laboratory-test');
        $this->mock(LaboratoryAttachmentStorage::class, function ($mock) {
            $mock->shouldReceive('ready')->andReturn(true);
            $mock->shouldReceive('ensureReady')->andReturn('laboratory-test');
            $mock->shouldReceive('purge')->andReturnUsing(function ($attachment) {
                if (! $attachment->health_record_id) {
                    Storage::disk($attachment->disk)->delete($attachment->getRawOriginal('path'));
                    $attachment->update(['purged_at' => now()]);
                }
            });
        });
    }

    private function report(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('report.pdf', "%PDF-1.4\nSynthetic laboratory report\n%%EOF");
    }

    private function isolatedS3(?string $endpoint = 'https://objects.example.test', bool $pathStyle = true): object
    {
        // Exercise the actual Laravel/Flysystem/AWS driver with an isolated HTTP
        // transport. No network requests or operational credentials are used.
        $state = (object) ['objects' => [], 'requests' => [], 'failWrites' => false, 'failReads' => false];
        Storage::forgetDisk('s3');
        config(['laboratory.disk' => 's3', 'filesystems.disks.s3' => [
            'driver' => 's3', 'key' => 'synthetic-test-key', 'secret' => 'synthetic-test-secret',
            'region' => 'us-east-1', 'bucket' => 'private-test-bucket', 'endpoint' => $endpoint,
            'use_path_style_endpoint' => $pathStyle, 'visibility' => 'private', 'throw' => true, 'retries' => 0,
            'http_handler' => static function ($request) use ($state) {
                $state->requests[] = $request;
                $path = $request->getUri()->getPath();
                $method = $request->getMethod();
                if (($method === 'PUT' && $state->failWrites) || ($method === 'GET' && $state->failReads)) {
                    return Create::rejectionFor([
                        'exception' => new \RuntimeException('synthetic-provider-detail'),
                        'response' => new Response(503, [], '<Error><Code>ServiceUnavailable</Code><Message>synthetic-provider-detail</Message></Error>'),
                        'connection_error' => false,
                    ]);
                }
                if ($method === 'PUT') {
                    $state->objects[$path] = (string) $request->getBody();
                } elseif ($method === 'DELETE') {
                    unset($state->objects[$path]);
                }
                $body = $method === 'GET' ? ($state->objects[$path] ?? '') : '';

                return Create::promiseFor(new Response(200, [
                    'Content-Type' => 'application/pdf', 'Content-Length' => strlen($body), 'ETag' => '"synthetic-etag"',
                ], $body));
            },
        ]]);

        return $state;
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

    public function test_draft_edit_remove_resume_conflict_and_finalize_use_existing_pipeline(): void
    {
        $first = $this->laboratoryEntry();
        $second = $this->laboratoryEntry();
        $payload = ['laboratoryTests' => [$first, $second], 'diagnoses' => [$this->diagnosis([
            'laboratoryEvidence' => [['reference' => 'current:'.$first['id'], 'version' => 0, 'attachmentIds' => []]],
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

    public function test_upload_validation_and_local_storage_blocker(): void
    {
        $context = $this->context((string) Str::uuid());
        $this->post('/api/laboratory-attachments', [...$context, 'file' => UploadedFile::fake()->create('bad.txt', 1, 'text/plain')], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post('/api/laboratory-attachments', [...$context, 'file' => UploadedFile::fake()->create('large.pdf', 10241, 'application/pdf')], ['Accept' => 'application/json'])->assertUnprocessable();
        config(['laboratory.disk' => 'local']);
        $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertStatus(503);
        $this->assertDatabaseCount('laboratory_attachments', 0);
    }

    public function test_private_attachment_resume_finalization_sharing_and_retrieval(): void
    {
        $this->fakeDurableDisk();
        $entry = $this->laboratoryEntry();
        $context = $this->context($entry['id']);
        $uploaded = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated();
        $id = $uploaded->json('data.id');
        $uploaded->assertJsonMissingPath('data.path')->assertJsonMissingPath('data.disk');
        $this->getJson('/api/laboratory-attachments?'.http_build_query($context))->assertOk()->assertJsonPath('data.0.id', $id);
        $this->get('/api/laboratory-attachments/'.$id.'?'.http_build_query($context))->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->finalize([$entry], ['diagnoses' => [$this->diagnosis([
            'laboratoryEvidence' => [['reference' => 'current:'.$entry['id'], 'version' => 0, 'attachmentIds' => [$id]]], 'laboratoryEvidenceConfirmed' => true,
        ])]])->assertCreated();
        $attachment = LaboratoryAttachment::findOrFail($id);
        $this->assertNotNull($attachment->health_record_id);
        $handoff = MonitoringHandoffRequest::firstOrFail();
        $this->as($this->bhcUser);
        $this->get('/api/laboratory-attachments/'.$id)->assertForbidden();
        $this->get('/api/laboratory-attachments/'.$id.'?handoff_id='.$handoff->id)->assertOk();
        $this->deleteJson('/api/laboratory-attachments/'.$id, ['reason' => 'BHC remove'])->assertForbidden();
        $handoff->update(['status' => 'linkage_needed', 'linked_patient_id' => null]);
        $this->get('/api/laboratory-attachments/'.$id.'?handoff_id='.$handoff->id)->assertForbidden();
    }

    public function test_removed_draft_files_are_purged_and_discard_marks_remaining_files_for_cleanup(): void
    {
        $this->fakeDurableDisk();
        $entry = $this->laboratoryEntry();
        $context = $this->context($entry['id']);
        $id = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $attachment = LaboratoryAttachment::findOrFail($id);
        $this->deleteJson('/api/laboratory-attachments/'.$id, $context)->assertNoContent();
        Storage::disk('laboratory-test')->assertMissing($attachment->getRawOriginal('path'));
        $this->assertNotNull($attachment->fresh()->purged_at);
        $next = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $draft = $this->postJson('/api/health-record-drafts', $this->draftInput(['laboratoryTests' => [$entry]]))->assertCreated();
        $this->deleteJson('/api/health-record-drafts/'.$draft->json('data.id'), ['version' => $draft->json('data.version')])->assertNoContent();
        $this->assertNotNull(LaboratoryAttachment::findOrFail($next)->removed_at);
    }

    public function test_unselected_attachment_patient_and_facility_access_are_denied(): void
    {
        $this->fakeDurableDisk();
        $private = $this->laboratoryEntry(['testName' => 'Private evidence']);
        $shared = $this->laboratoryEntry();
        $context = $this->context($private['id']);
        $id = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $wrongPatient = $context;
        $wrongPatient['patient_id']++;
        $this->get('/api/laboratory-attachments/'.$id.'?'.http_build_query($wrongPatient))->assertForbidden();
        $this->finalize([$shared, $private], ['diagnoses' => [$this->diagnosis([
            'laboratoryEvidence' => [['reference' => 'current:'.$shared['id'], 'version' => 0]], 'laboratoryEvidenceConfirmed' => true,
        ])]])->assertCreated();
        $handoff = MonitoringHandoffRequest::firstOrFail();
        $this->as($this->bhcUser);
        $this->get('/api/laboratory-attachments/'.$id.'?handoff_id='.$handoff->id)->assertForbidden();
        $otherBhc = BarangayHealthCenter::create(['name' => 'Other BHC', 'status' => 'active', 'rural_health_unit_id' => $this->clinician->rural_health_unit_id]);
        $this->bhcUser->update(['barangay_health_center_id' => $otherBhc->id]);
        $this->as($this->bhcUser->fresh());
        $this->getJson('/api/monitoring-handoff-requests/'.$handoff->id)->assertForbidden();
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

    public function test_a_new_late_attachment_requires_explicit_sharing_and_removal_preserves_shared_evidence(): void
    {
        $this->fakeDurableDisk();
        $entry = $this->laboratoryEntry();
        $this->finalize([$entry], ['diagnoses' => [$this->diagnosis([
            'laboratoryEvidence' => [['reference' => 'current:'.$entry['id'], 'version' => 0]], 'laboratoryEvidenceConfirmed' => true,
        ])]])->assertCreated();
        $handoff = MonitoringHandoffRequest::firstOrFail();
        $test = LaboratoryTest::firstOrFail();
        $record = HealthRecord::firstOrFail();
        $context = ['health_record_id' => $record->id, 'test_client_id' => $entry['id'], 'reason' => 'Supporting report arrived'];
        $id = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->as($this->bhcUser);
        $this->getJson('/api/monitoring-handoff-requests/'.$handoff->id)->assertOk()->assertJsonCount(0, 'data.laboratory_evidence.0.attachments');
        $this->get('/api/laboratory-attachments/'.$id.'?handoff_id='.$handoff->id)->assertForbidden();
        $this->as($this->clinician);
        $share = ['selected' => [['reference' => 'record:'.$test->id, 'version' => 0]], 'confirmed' => true,
            'sharingRevision' => $handoff->laboratory_evidence_revision, 'reason' => 'Share report'];
        $url = '/api/laboratory-evidence/handoffs/'.$handoff->id.'/share';
        $this->postJson($url, $share)->assertUnprocessable();
        $share['selected'][0]['attachmentIds'] = [$id];
        $this->postJson($url, $share)->assertOk();
        $this->deleteJson('/api/laboratory-attachments/'.$id, $context)->assertNoContent();
        $this->assertNull(LaboratoryAttachment::findOrFail($id)->purged_at);
        $this->as($this->bhcUser);
        $this->get('/api/laboratory-attachments/'.$id.'?handoff_id='.$handoff->id)->assertOk();
    }

    public function test_failed_upload_is_tracked_and_cleaned_up(): void
    {
        $this->fakeDurableDisk();
        $disk = \Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('putFileAs')->once()->andReturn(false);
        $disk->shouldReceive('delete')->once()->andReturn(true);
        Storage::shouldReceive('disk')->with('laboratory-test')->andReturn($disk);
        $this->post('/api/laboratory-attachments', [...$this->context((string) Str::uuid()), 'file' => $this->report()], ['Accept' => 'application/json'])->assertStatus(503);
        $row = LaboratoryAttachment::firstOrFail();
        $this->assertNotNull($row->removed_at);
        $this->assertNotNull($row->purged_at);
        $this->assertNull($row->uploaded_at);
    }

    public function test_storage_cleanup_survives_a_failed_database_completion(): void
    {
        $this->fakeDurableDisk();
        AuditLog::creating(function () {
            throw new \RuntimeException('Synthetic audit failure');
        });
        $this->post('/api/laboratory-attachments', [...$this->context((string) Str::uuid()), 'file' => $this->report()], ['Accept' => 'application/json'])->assertStatus(500);
        $row = LaboratoryAttachment::firstOrFail();
        Storage::disk('laboratory-test')->assertMissing($row->getRawOriginal('path'));
        $this->assertNull($row->uploaded_at);
        $this->assertNotNull($row->purged_at);
    }

    public function test_attachment_count_limit_and_ended_draft_editor_are_enforced(): void
    {
        $this->fakeDurableDisk();
        $entry = $this->laboratoryEntry();
        $context = $this->context($entry['id']);
        config(['laboratory.max_files_per_test' => 1]);
        $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated();
        $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertUnprocessable();
        $draft = $this->postJson('/api/health-record-drafts', $this->draftInput(['laboratoryTests' => [$entry]]))->assertCreated();
        DB::table('health_record_drafts')->where('public_id', $draft->json('data.id'))->update(['editor_expires_at' => now()->subMinute()]);
        $this->post('/api/laboratory-attachments', [...$this->context((string) Str::uuid()), 'file' => $this->report()], ['Accept' => 'application/json'])->assertConflict();
        $this->assertDatabaseCount('laboratory_attachments', 1);
    }

    public function test_device_only_discard_and_cleanup_retry_leave_no_untracked_files(): void
    {
        $this->fakeDurableDisk();
        $context = $this->context((string) Str::uuid());
        $id = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $input = ['form_type' => 'consultation', 'mode' => 'edit', 'context_key' => 'visit:'.$this->visit->id, 'transaction_uuid' => $this->uuid];
        $key = $this->postJson('/api/form-drafts/device-key', $input)->assertOk()->json('data');
        $this->postJson('/api/form-drafts/clinical-discard', [...$input, 'key_id' => $key['key_id']])->assertNoContent();
        $row = LaboratoryAttachment::findOrFail($id);
        $this->assertNotNull($row->removed_at);
        $row->update(['removed_at' => now()->subHours(2)]);
        $this->artisan('laboratory-attachments:prune')->assertSuccessful();
        $this->assertNotNull($row->fresh()->purged_at);
        Storage::disk('laboratory-test')->assertMissing($row->getRawOriginal('path'));
    }

    public function test_replacement_is_atomic_at_the_attachment_limit_and_keeps_association(): void
    {
        $this->fakeDurableDisk();
        config(['laboratory.max_files_per_test' => 1]);
        $context = $this->context((string) Str::uuid());
        $first = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $replacement = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report(), 'replace_attachment_id' => $first], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $this->assertNotSame($first, $replacement);
        $this->assertNotNull(LaboratoryAttachment::findOrFail($first)->purged_at);
        $this->getJson('/api/laboratory-attachments?'.http_build_query($context))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $replacement);
        $this->assertTrue(AuditLog::where('module', 'laboratory_attachments')->where('action', 'replaced')->exists());
        $this->post('/api/laboratory-attachments', [...$this->context((string) Str::uuid()), 'file' => $this->report(), 'replace_attachment_id' => $replacement], ['Accept' => 'application/json'])->assertNotFound();
    }

    public function test_finalization_during_an_upload_cleans_the_uncommitted_file(): void
    {
        $this->fakeDurableDisk();
        $entry = $this->laboratoryEntry();
        $realDisk = Storage::disk('laboratory-test');
        $disk = \Mockery::mock(FilesystemAdapter::class);
        $disk->shouldReceive('putFileAs')->once()->andReturnUsing(function (...$arguments) use ($realDisk, $entry) {
            $path = $realDisk->putFileAs(...$arguments);
            // Deterministically interleave finalization after the durable write
            // and before the attachment's metadata completion transaction.
            $this->finalize([$entry])->assertCreated();

            return $path;
        });
        $disk->shouldReceive('delete')->once()->andReturnUsing(fn ($path) => $realDisk->delete($path));
        Storage::shouldReceive('disk')->with('laboratory-test')->andReturn($disk);
        $this->post('/api/laboratory-attachments', [...$this->context($entry['id']), 'file' => $this->report()], ['Accept' => 'application/json'])->assertConflict();
        $attachment = LaboratoryAttachment::firstOrFail();
        $realDisk->assertMissing($attachment->getRawOriginal('path'));
        $this->assertNotNull($attachment->purged_at);
        $this->assertNull($attachment->health_record_id);
        $this->assertDatabaseCount('laboratory_tests', 1);
    }

    public function test_real_s3_driver_upload_and_authorized_retrieval_without_object_acls(): void
    {
        $state = $this->isolatedS3();
        $context = $this->context((string) Str::uuid());
        $response = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated();
        $attachment = LaboratoryAttachment::findOrFail($response->json('data.id'));
        $this->assertSame('s3', $attachment->disk);
        $this->assertStringStartsWith('laboratory/', $attachment->path);
        $response->assertJsonMissingPath('data.path')->assertJsonMissingPath('data.disk');
        $put = $state->requests[0];
        $this->assertSame('PUT', $put->getMethod());
        $this->assertSame('https', $put->getUri()->getScheme());
        $this->assertSame('objects.example.test', $put->getUri()->getHost());
        $this->assertStringStartsWith('/private-test-bucket/laboratory/', $put->getUri()->getPath());
        $this->assertFalse($put->hasHeader('x-amz-acl'));
        $preview = $this->get('/api/laboratory-attachments/'.$attachment->id.'?'.http_build_query($context))->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringContainsString('Synthetic laboratory report', $preview->streamedContent());
        $reads = count($state->requests);
        $this->as($this->bhcUser);
        $this->getJson('/api/laboratory-attachments/'.$attachment->id.'?'.http_build_query($context))->assertForbidden();
        $this->assertCount($reads, $state->requests, 'Unauthorized access must not contact storage.');
    }

    public function test_aws_default_endpoint_and_virtual_host_addressing_are_supported(): void
    {
        $state = $this->isolatedS3(null, false);
        $this->post('/api/laboratory-attachments', [...$this->context((string) Str::uuid()), 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated();
        $request = $state->requests[0];
        $this->assertStringStartsWith('private-test-bucket.', $request->getUri()->getHost());
        $this->assertStringContainsString('.amazonaws.com', $request->getUri()->getHost());
        $this->assertStringStartsWith('/laboratory/', $request->getUri()->getPath());
        $this->assertFalse($request->hasHeader('x-amz-acl'));
    }

    public function test_storage_failure_returns_clear_production_error_and_preserves_draft(): void
    {
        $state = $this->isolatedS3();
        $entry = $this->laboratoryEntry(['result' => 'Preserve this draft text']);
        $draft = $this->postJson('/api/health-record-drafts', $this->draftInput(['laboratoryTests' => [$entry]]))->assertCreated()->json('data.id');
        config(['app.env' => 'production']);
        $state->failWrites = true;
        $response = $this->post('/api/laboratory-attachments', [...$this->context($entry['id']), 'file' => $this->report()], ['Accept' => 'application/json'])->assertStatus(503);
        $this->assertStringContainsString('Your laboratory text and draft have not been changed', $response->json('message'));
        $this->assertStringNotContainsString('synthetic-provider-detail', $response->getContent());
        $this->getJson('/api/health-record-drafts/'.$draft)->assertOk()->assertJsonPath('data.payload.laboratoryTests.0.result', 'Preserve this draft text');
        $this->assertNotNull(LaboratoryAttachment::firstOrFail()->purged_at);
        $this->assertSame([], $state->objects);
        $this->assertDatabaseCount('laboratory_tests', 0);
    }

    public function test_missing_configuration_and_read_failure_return_clear_production_errors(): void
    {
        $state = $this->isolatedS3();
        config(['app.env' => 'production', 'filesystems.disks.s3.bucket' => '']);
        $context = $this->context((string) Str::uuid());
        $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertStatus(503)
            ->assertJsonPath('message', 'Laboratory uploads require configured durable private storage. Contact your administrator.');
        $this->assertDatabaseCount('laboratory_attachments', 0);
        $this->assertSame([], $state->requests);
        config(['filesystems.disks.s3.bucket' => 'private-test-bucket']);
        $id = $this->post('/api/laboratory-attachments', [...$context, 'file' => $this->report()], ['Accept' => 'application/json'])->assertCreated()->json('data.id');
        $state->failReads = true;
        $response = $this->getJson('/api/laboratory-attachments/'.$id.'?'.http_build_query($context))->assertStatus(503);
        $this->assertStringContainsString('Unable to retrieve this laboratory report', $response->json('message'));
        $this->assertStringNotContainsString('synthetic-provider-detail', $response->getContent());
        $this->assertNotNull(LaboratoryAttachment::findOrFail($id)->uploaded_at);
    }
}
