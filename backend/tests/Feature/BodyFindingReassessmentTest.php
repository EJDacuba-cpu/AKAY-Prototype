<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\HealthRecordDraftPayloadService;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BodyFindingReassessmentTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;
    private User $worker;
    private HealthRecord $source;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Body RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Body BHC', 'rural_health_unit_id' => $rhu->id]);
        $this->worker = User::create(['name' => 'Body Worker', 'email' => 'body@example.test', 'password' => 'password123', 'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        $this->patient = Patient::create(['first_name' => 'Body', 'last_name' => 'Test', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id, 'rural_health_unit_id' => $rhu->id, 'created_by' => $this->worker->id]);
        $this->source = HealthRecord::create(['patient_id' => $this->patient->id, 'created_by' => $this->worker->id, 'barangay_health_center_id' => $bhc->id, 'rural_health_unit_id' => $rhu->id, 'category' => 'General Consultation', 'date_recorded' => now()->subWeek(), 'body_findings' => [
            ['region' => 'chest', 'finding' => 'Tenderness'],
            ['region' => 'chest', 'finding' => 'Tenderness'],
        ]]);
        Sanctum::actingAs($this->worker, ['akay:access']);
    }

    private function decision(array $extra = []): array
    {
        return [...['sourceRecordId' => $this->source->id, 'sourceFindingIndex' => 0, 'expectedRevision' => 0, 'status' => 'still_present'], ...$extra];
    }

    private function save(array $decisions, array $extra = [], ?string $key = null)
    {
        return $this->withHeader('Idempotency-Key', $key ?? (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id, 'category' => 'General Consultation',
            'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
            'chief_complaint' => 'Review', 'treatment_notes' => 'Findings reassessed.', 'monitoring_data' => ['bodyFindingReassessments' => $decisions], ...$extra,
        ]);
    }

    public function test_finalization_appends_canonical_snapshot_and_keeps_original_and_new_findings_independent(): void
    {
        $before = $this->source->fresh()->getAttributes();
        $id = $this->save([$this->decision(['finding' => ['finding' => 'Forged']])], [
            'body_findings' => [['region' => 'chest', 'finding' => 'New finding']],
        ])->assertCreated()->json('data.id');
        $record = HealthRecord::findOrFail($id);
        $event = $record->monitoring_data['bodyFindingReassessments'][0];
        $this->assertSame('Tenderness', $event['finding']['finding']);
        $this->assertSame(0, $event['sourceFindingIndex']);
        $this->assertSame('New finding', $record->body_findings[0]['finding']);
        $this->assertSame($before, $this->source->fresh()->getAttributes());
        $this->assertDatabaseCount('patient_conditions', 0);
        $this->assertDatabaseCount('follow_up_tasks', 0);
        $this->assertSame([], $record->diagnoses);
    }

    public function test_duplicate_legacy_findings_can_be_reassessed_separately(): void
    {
        $id = $this->save([$this->decision(), $this->decision(['sourceFindingIndex' => 1, 'status' => 'no_longer_present'])])->assertCreated()->json('data.id');
        $this->assertCount(2, HealthRecord::findOrFail($id)->monitoring_data['bodyFindingReassessments']);
    }

    public function test_stale_revision_and_reopening_closed_findings_are_rejected(): void
    {
        $id = $this->save([$this->decision(['status' => 'no_longer_present'])])->assertCreated()->json('data.id');
        $this->save([$this->decision()])->assertUnprocessable()->assertJsonValidationErrors('monitoring_data.bodyFindingReassessments.0');
        $this->save([$this->decision(['expectedRevision' => $id])])->assertUnprocessable();
        $this->assertDatabaseCount('health_records', 2);
    }

    public function test_unknown_cross_patient_and_duplicate_references_fail_atomically(): void
    {
        $this->save([$this->decision(['sourceFindingIndex' => 8])])->assertUnprocessable();
        $this->save([$this->decision(), $this->decision()])->assertUnprocessable();
        $other = $this->patient->replicate();
        $other->save();
        $this->save([$this->decision()], ['patient_id' => $other->id])->assertUnprocessable();
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_inaccessible_source_and_invalid_status_fail(): void
    {
        $otherBhc = BarangayHealthCenter::create(['name' => 'Other BHC']);
        $this->source->update(['barangay_health_center_id' => $otherBhc->id]);
        $this->save([$this->decision()])->assertUnprocessable();
        $this->save([$this->decision(['status' => 'resolved'])])->assertUnprocessable();
    }

    public function test_replay_is_idempotent_and_draft_sanitization_preserves_pending_choices_only(): void
    {
        $payload = ['bodyFindingReassessments' => [$this->decision()]];
        $draft = app(HealthRecordDraftPayloadService::class)->sanitize($payload);
        $this->assertSame($payload, $draft);
        $this->assertDatabaseCount('health_records', 1);
        $key = (string) Str::uuid();
        $this->save([$this->decision()], key: $key)->assertCreated();
        $this->save([$this->decision()], key: $key)->assertOk()->assertJsonPath('idempotent_replay', true);
        $this->assertDatabaseCount('health_records', 2);
    }

    public function test_malformed_event_lists_are_validation_errors_not_server_errors(): void
    {
        $this->save(['named' => $this->decision()])->assertUnprocessable();
        $this->save([null])->assertUnprocessable();
        $this->save([['status' => 'still_present']])->assertUnprocessable();
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_failed_finalization_keeps_server_draft_and_original_unchanged(): void
    {
        $before = $this->source->fresh()->getAttributes();
        $decision = $this->decision(['status' => 'no_longer_present']);
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => ['bodyFindingReassessments' => [$decision]],
        ])->assertCreated()->json('data');
        $this->getJson('/api/health-record-drafts/'.$draft['id'])->assertOk()
            ->assertJsonPath('data.payload.bodyFindingReassessments.0.status', 'no_longer_present');
        $this->mock(\App\Services\FollowUpTaskSyncService::class, function ($mock): void {
            $mock->shouldReceive('lockTaskForProcessing')->once()->andReturnNull();
            $mock->shouldReceive('lockAdditionalTasks')->once()->andReturn(collect());
            $mock->shouldReceive('syncRecord')->once()->andThrow(new \RuntimeException('Forced post-insert failure'));
        });
        $this->withHeaders(['X-Health-Record-Draft-ID' => $draft['id'], 'X-Draft-Version' => (string) $draft['version']]);
        $this->save([$decision])->assertStatus(500);
        $this->assertDatabaseCount('health_records', 1);
        $this->assertSame($before, $this->source->fresh()->getAttributes());
        $this->getJson('/api/health-record-drafts/'.$draft['id'])->assertOk()
            ->assertJsonPath('data.payload.bodyFindingReassessments.0.status', 'no_longer_present');
    }
}
