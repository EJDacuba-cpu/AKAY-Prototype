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
 * monitoring_data.surveillanceTags (registry-driven Community-Based
 * Surveillance) and its legacy hfmdSurveillance/surveillanceCategory
 * mirrors, per
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md.
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

    public function test_saving_with_hfmd_tagged_derives_the_legacy_mirror_fields(): void
    {
        $id = $this->store(['surveillanceTags' => ['hfmd']])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame(['hfmd'], $record->monitoring_data['surveillanceTags']);
        $this->assertTrue($record->monitoring_data['hfmdSurveillance']);
        $this->assertTrue($record->monitoring_data['hfmd_surveillance']);
        $this->assertSame('hfmd', $record->monitoring_data['surveillanceCategory']);
        $this->assertSame('hfmd', $record->monitoring_data['diseaseSurveillanceCategory']);
    }

    public function test_saving_with_no_tags_ticked_derives_false_and_null(): void
    {
        $id = $this->store(['surveillanceTags' => []])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame([], $record->monitoring_data['surveillanceTags']);
        $this->assertFalse($record->monitoring_data['hfmdSurveillance']);
        $this->assertNull($record->monitoring_data['surveillanceCategory']);
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

    public function test_an_unregistered_surveillance_key_is_rejected(): void
    {
        $this->store(['surveillanceTags' => ['dengue']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['monitoring_data.surveillanceTags.0']);
    }

    public function test_surveillance_tags_round_trip_through_a_draft(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => [
                'chiefComplaint' => 'Rash',
                'surveillanceTags' => ['hfmd'],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.surveillanceTags.0', 'hfmd');
    }
}
