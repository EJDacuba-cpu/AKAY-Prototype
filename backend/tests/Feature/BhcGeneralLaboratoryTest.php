<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\LaboratoryTest;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BhcGeneralLaboratoryTest extends TestCase
{
    use RefreshDatabase;

    private User $worker;

    private User $rhuUser;

    private Patient $patient;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Laboratory RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Laboratory BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->worker = User::create([
            'name' => 'BHC Midwife', 'email' => 'bhc-lab@example.test', 'password' => 'password123',
            'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('midwife'),
        ]);
        $this->rhuUser = User::create([
            'name' => 'RHU Doctor', 'email' => 'rhu-lab@example.test', 'password' => 'password123',
            'role' => 'rhu', 'status' => 'active', 'staff_role' => 'doctor', 'rural_health_unit_id' => $rhu->id,
            'permissions' => array_unique([...StaffRoles::defaults('doctor'), 'consultations.encode', 'consultations.finalize', 'records.correct', 'clinical.history']),
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Liza', 'last_name' => 'Cruz', 'sex' => 'Female', 'birthdate' => '1994-04-02',
            'status' => 'active', 'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $rhu->id,
            'created_by' => $this->worker->id,
        ]);
        Sanctum::actingAs($this->worker, ['akay:access']);
    }

    private function entry(array $changes = []): array
    {
        return [
            'id' => (string) Str::uuid(),
            'testName' => 'CBC',
            'examinationDate' => now()->toDateString(),
            'resultStatus' => 'Result Available',
            'result' => 'Within normal limits',
            'resultSource' => 'Patient brought the laboratory slip',
            'remarks' => 'Fasting sample',
            ...$changes,
        ];
    }

    private function save(array $entries, array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', $extra['idempotency_key'] ?? (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
                'category' => 'General Consultation',
                'chief_complaint' => 'Cough for 3 days',
                'treatment_notes' => 'Wound care and counseling.',
                'laboratory_tests' => $entries,
                ...$extra,
            ]);
    }

    public function test_bhc_results_store_free_text_source_and_allow_repeated_names(): void
    {
        $first = $this->entry();
        $second = $this->entry(['result' => 'Repeated CBC the same day', 'resultSource' => 'RHU slip brought by the mother']);
        $response = $this->save([$first, $second])->assertCreated();
        $recordId = $response->json('data.id');
        $this->assertDatabaseCount('laboratory_tests', 2);
        $stored = LaboratoryTest::query()->orderBy('id')->get();
        $this->assertSame('Patient brought the laboratory slip', $stored[0]->data['resultSource']);
        $this->assertSame('Fasting sample', $stored[0]->data['remarks']);
        $this->assertSame('Result Available', $stored[0]->data['resultStatus']);
        $this->assertSame($this->worker->id, $stored[0]->created_by);
        $this->assertSame($recordId, $stored[0]->health_record_id);
        $this->assertNotSame($stored[0]->client_id, $stored[1]->client_id);
        $this->assertTrue(AuditLog::query()->where('module', 'laboratory_tests')->exists());

        $listed = $this->getJson('/api/laboratory-evidence/patients/'.$this->patient->id)
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->json('data');
        $this->assertSame('BHC', $listed[0]['facilityType']);
        $this->assertTrue($listed[0]['canAddendum']);
        $this->assertContains($listed[0]['resultSource'], [
            'Patient brought the laboratory slip',
            'RHU slip brought by the mother',
        ]);

        $this->getJson('/api/health-records/'.$recordId.'/laboratory-tests')
            ->assertOk()
            ->assertJsonPath('data.0.resultSource', 'Patient brought the laboratory slip')
            ->assertJsonPath('can_addendum', true);
    }

    public function test_bhc_rejects_pending_status_blank_source_and_a_future_date(): void
    {
        $this->save([$this->entry(['resultStatus' => 'Requested', 'result' => null])])->assertUnprocessable()
            ->assertJsonValidationErrors('laboratory_tests.0.resultStatus');
        $this->save([$this->entry(['resultStatus' => 'Awaiting Result'])])->assertUnprocessable();
        $this->save([$this->entry(['resultSource' => '   '])])->assertUnprocessable()
            ->assertJsonValidationErrors('laboratory_tests.0.resultSource');
        $this->save([$this->entry(['examinationDate' => now()->addDay()->toDateString()])])->assertUnprocessable()
            ->assertJsonValidationErrors('laboratory_tests.0.examinationDate');
        $this->assertDatabaseCount('laboratory_tests', 0);
    }

    public function test_retry_does_not_duplicate_rows_and_a_draft_does_not_finalize_them(): void
    {
        $entry = $this->entry();
        $key = (string) Str::uuid();
        $this->save([$entry], ['idempotency_key' => $key])->assertCreated();
        $this->save([$entry], ['idempotency_key' => $key])->assertSuccessful();
        $this->assertDatabaseCount('laboratory_tests', 1);

        $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id,
            'classification' => 'General Consultation',
            'payload' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
                'chiefComplaint' => 'Draft complaint.',
                'laboratoryTests' => [$this->entry(['testName' => 'Urinalysis', 'result' => ''])],
                'maternalData' => [
                    'laboratoryEntries' => [['test' => 'cbc', 'result' => 'Normal', 'datePerformed' => '2026-10-02']],
                    'ultrasound' => ['result' => 'Cephalic', 'dateDone' => '2026-10-02'],
                ],
            ],
        ])->assertCreated();
        $this->assertDatabaseCount('laboratory_tests', 1);
        $draft = $this->getJson('/api/health-record-drafts/'.\App\Models\HealthRecordDraft::query()->value('public_id'))
            ->assertOk();
        $draft->assertJsonPath('data.payload.laboratoryTests.0.resultSource', 'Patient brought the laboratory slip');
        $draft->assertJsonPath('data.payload.maternalData.laboratoryEntries.0.result', 'Normal');
        $draft->assertJsonPath('data.payload.maternalData.ultrasound.result', 'Cephalic');
    }

    public function test_bhc_addendum_is_limited_to_the_authoring_center(): void
    {
        $entry = $this->entry();
        $recordId = $this->save([$entry])->assertCreated()->json('data.id');
        $test = LaboratoryTest::query()->firstOrFail();
        $url = "/api/health-records/{$recordId}/laboratory-tests/{$test->id}/addenda";
        $corrected = $this->entry(['id' => $entry['id'], 'result' => 'Corrected hemoglobin narrative', 'resultSource' => 'Corrected slip from the patient']);
        $this->postJson($url, ['tests' => [$corrected], 'version' => 0, 'reason' => 'Wrong value was typed'])->assertCreated();
        $this->assertSame('Within normal limits', $test->fresh()->data['result']);
        $this->assertTrue(AuditLog::query()->where('module', 'laboratory_addenda')->exists());

        $other = BarangayHealthCenter::create(['name' => 'Other BHC', 'status' => 'active', 'rural_health_unit_id' => $this->bhc->rural_health_unit_id]);
        $otherUser = User::create([
            'name' => 'Other Midwife', 'email' => 'other-bhc@example.test', 'password' => 'password123',
            'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $other->id,
            'permissions' => StaffRoles::defaults('midwife'),
        ]);
        Sanctum::actingAs($otherUser, ['akay:access']);
        $this->postJson($url, ['tests' => [$corrected], 'version' => 1, 'reason' => 'Cross center'])->assertForbidden();

        Sanctum::actingAs($this->rhuUser, ['akay:access']);
        $this->postJson($url, ['tests' => [$corrected], 'version' => 1, 'reason' => 'RHU rewrite'])->assertForbidden();
        $this->getJson('/api/laboratory-evidence/patients/'.$this->patient->id)
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_historical_maternal_laboratory_rows_remain_on_the_record(): void
    {
        $record = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'created_by' => $this->worker->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->patient->rural_health_unit_id,
            'category' => 'Maternal',
            'maternal_data' => [
                'laboratoryEntries' => [['test' => 'hemoglobin', 'result' => '11.2 g/dL', 'datePerformed' => '2026-08-01']],
                'ultrasound' => ['result' => 'Single live fetus', 'dateDone' => '2026-08-01'],
            ],
            'monitoring_data' => ['consultationWorkflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2],
        ]);

        $this->getJson('/api/health-records/'.$record->id)
            ->assertOk()
            ->assertJsonPath('data.maternal_data.laboratoryEntries.0.result', '11.2 g/dL')
            ->assertJsonPath('data.maternal_data.ultrasound.result', 'Single live fetus');
    }
}
