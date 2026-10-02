<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Per-diagnosis surveillance (diagnoses[].includeInSurveillance feeds the
 * Surveillance Report), with the legacy HFMD fields on monitoring_data
 * (hfmdSurveillance/surveillanceCategory, and surveillanceTags from older
 * clients and drafts) preserved so old records and drafts keep working, per
 * docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 */
class SurveillanceRegistryTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Surv RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Surv BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Surv BHW', 'email' => 'surv@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'AA', 'last_name' => 'BB', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function store(array $monitoringDataExtra)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Rash and fever',
            'monitoring_data' => $monitoringDataExtra,
        ]);
    }

    public function test_omitting_surveillancetags_entirely_leaves_legacy_fields_untouched(): void
    {
        // An older client that still only sends the legacy boolean directly -
        // nothing here should be inferred backwards or overwritten.
        $id = $this->store(['hfmdSurveillance' => true])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertArrayNotHasKey('surveillanceTags', $record->monitoring_data);
        $this->assertTrue($record->monitoring_data['hfmdSurveillance']);
    }

    public function test_include_in_surveillance_is_stored_on_the_diagnosis(): void
    {
        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Rash and fever',
            'diagnoses' => [['id' => 'd1', 'name' => 'HFMD', 'includeInSurveillance' => true]],
        ])->assertCreated()->json('data.id');

        $this->assertTrue(HealthRecord::findOrFail($id)->diagnoses[0]['includeInSurveillance']);
    }

    public function test_a_legacy_client_sending_surveillancetags_still_saves_with_the_hfmd_mirrors(): void
    {
        // The registry is gone, but an older client may still send the tags;
        // they are no longer validated against a registry.
        $id = $this->store(['surveillanceTags' => ['hfmd']])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertTrue($record->monitoring_data['hfmdSurveillance']);
        $this->assertSame('hfmd', $record->monitoring_data['surveillanceCategory']);
    }

    public function test_a_legacy_draft_carrying_surveillancetags_still_saves_and_opens(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => [
                'chiefComplaint' => 'Rash',
                'surveillanceTags' => ['hfmd'],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.chiefComplaint', 'Rash')
            ->assertJsonMissingPath('data.payload.surveillanceTags');
    }
}
