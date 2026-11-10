<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\TbTreatmentCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TbTreatmentCaseAccessTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private RuralHealthUnit $otherRhu;

    private BarangayHealthCenter $bhc;

    private Patient $patient;

    private User $doctor;

    private User $nurse;

    private User $bhcUser;

    private User $otherDoctor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Case RHU', 'status' => 'active']);
        $this->otherRhu = RuralHealthUnit::create(['name' => 'Other Case RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Case BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->patient = Patient::create([
            'first_name' => 'Shared', 'last_name' => 'Case', 'sex' => 'Male', 'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $this->rhu->id,
        ]);
        foreach (['doctor', 'nurse', 'otherDoctor', 'bhcUser'] as $key) {
            $isBhc = $key === 'bhcUser';
            $this->$key = User::create([
                'name' => $key, 'email' => "$key@tb-cases.example.test", 'password' => 'password123',
                'role' => $isBhc ? 'bhc' : 'rhu', 'staff_role' => $key === 'nurse' ? 'nurse' : ($isBhc ? 'midwife' : 'doctor'),
                'status' => 'active', 'permissions' => ['clinical.history'],
                'barangay_health_center_id' => $isBhc ? $this->bhc->id : null,
                'rural_health_unit_id' => $isBhc ? null : ($key === 'otherDoctor' ? $this->otherRhu->id : $this->rhu->id),
            ]);
        }
    }

    private function createCase(?RuralHealthUnit $rhu = null, array $overrides = []): TbTreatmentCase
    {
        $rhu ??= $this->rhu;
        $source = HealthRecord::create([
            'patient_id' => $this->patient->id, 'rural_health_unit_id' => $rhu->id, 'category' => 'General Consultation',
            'finalized_by' => $this->doctor->id, 'finalized_at' => now(),
        ]);

        return TbTreatmentCase::create([
            'patient_id' => $this->patient->id, 'rural_health_unit_id' => $rhu->id, 'source_health_record_id' => $source->id,
            'reporting_year' => 2026, 'case_number' => 'TB-2026-0001', 'registered_by' => $this->doctor->id,
            'registered_at' => now(), 'diagnosis_snapshot' => ['name' => 'TB'],
            'card_data' => ['diagnosis' => ['tbCaseNumber' => 'TB-2026-0001']], ...$overrides,
        ]);
    }

    private function listUrl(): string
    {
        return "/api/patients/{$this->patient->id}/tb-cases";
    }

    public function test_owning_rhu_clinical_staff_can_read_stable_case_identity_and_card(): void
    {
        $case = $this->createCase();
        foreach ([$this->doctor, $this->nurse] as $staff) {
            $this->actingAs($staff, 'sanctum')->getJson($this->listUrl())
                ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.id', $case->id)
                ->assertJsonMissingPath('data.data.0.card_data');
            $this->getJson("/api/tb-cases/{$case->id}")->assertOk()
                ->assertJsonPath('data.id', $case->id)
                ->assertJsonPath('data.source_health_record_id', $case->source_health_record_id)
                ->assertJsonPath('data.reporting_year', 2026)
                ->assertJsonPath('data.card_data.diagnosis.tbCaseNumber', 'TB-2026-0001');
        }
    }

    public function test_referral_visibility_does_not_expose_another_rhus_case(): void
    {
        $own = $this->createCase(overrides: ['status' => 'closed']);
        $foreign = $this->createCase($this->otherRhu);
        Referral::create([
            'tracking_id' => 'TB-CASE-ACCESS', 'qr_code_value' => 'TB-CASE-ACCESS', 'reason_for_referral' => 'Evaluation',
            'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->otherRhu->id, 'created_by' => $this->bhcUser->id,
            'status' => 'Pending', 'referral_datetime' => now(),
        ]);
        $this->actingAs($this->doctor, 'sanctum')->getJson($this->listUrl())
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.id', $own->id);
        $this->getJson("/api/tb-cases/{$foreign->id}")->assertNotFound();
        $this->actingAs($this->otherDoctor, 'sanctum')->getJson($this->listUrl())
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.id', $foreign->id);
        $this->getJson("/api/tb-cases/{$own->id}")->assertNotFound();
    }

    public function test_case_owner_can_read_walk_in_case_without_changing_patient_facility_or_creating_a_referral(): void
    {
        $this->patient->update(['rural_health_unit_id' => null]);
        $case = $this->createCase();
        $this->actingAs($this->doctor, 'sanctum')->getJson($this->listUrl())
            ->assertOk()->assertJsonPath('data.data.0.id', $case->id);
        $this->getJson("/api/tb-cases/{$case->id}")->assertOk();
        $this->assertNull($this->patient->fresh()->rural_health_unit_id);
        $this->assertDatabaseCount('referrals', 0);
    }

    public function test_bhc_cannot_read_unendorsed_cases_even_for_its_own_patient(): void
    {
        $case = $this->createCase();
        $this->actingAs($this->bhcUser, 'sanctum')->getJson($this->listUrl())
            ->assertOk()->assertJsonPath('data.total', 0);
        $this->getJson("/api/tb-cases/{$case->id}")->assertNotFound();
    }

    public function test_unrelated_patient_and_case_are_not_accessible(): void
    {
        $case = $this->createCase();
        $this->actingAs($this->otherDoctor, 'sanctum')->getJson($this->listUrl())->assertForbidden();
        $this->getJson("/api/tb-cases/{$case->id}")->assertNotFound();
    }

    public function test_clinical_permission_and_active_facility_are_required_for_both_reads(): void
    {
        $case = $this->createCase();
        $this->nurse->update(['permissions' => ['patients.register']]);
        $this->actingAs($this->nurse, 'sanctum')->getJson($this->listUrl())->assertForbidden();
        $this->getJson("/api/tb-cases/{$case->id}")->assertForbidden();
        $this->rhu->update(['status' => 'inactive']);
        $this->actingAs($this->doctor, 'sanctum')->getJson($this->listUrl())->assertForbidden();
        $this->getJson("/api/tb-cases/{$case->id}")->assertForbidden();
    }

    public function test_unauthenticated_requests_cannot_read_cases(): void
    {
        $case = $this->createCase();
        $this->getJson($this->listUrl())->assertUnauthorized();
        $this->getJson("/api/tb-cases/{$case->id}")->assertUnauthorized();
    }

    public function test_admin_retains_clinical_read_access(): void
    {
        $case = $this->createCase();
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@tb-cases.example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->getJson($this->listUrl())->assertOk()->assertJsonPath('data.total', 1);
        $this->getJson("/api/tb-cases/{$case->id}")->assertOk();
    }

    public function test_list_is_paginated_by_registration_date_and_page_size_is_bounded(): void
    {
        $this->createCase(overrides: ['status' => 'closed', 'registered_at' => '2026-01-01']);
        $second = $this->createCase(overrides: ['case_number' => 'TB-2026-0002', 'status' => 'closed', 'registered_at' => '2026-02-01']);
        $third = $this->createCase(overrides: ['case_number' => 'TB-2026-0003', 'registered_at' => '2026-03-01']);
        $this->actingAs($this->doctor, 'sanctum')->getJson($this->listUrl().'?per_page=1')
            ->assertOk()->assertJsonPath('data.total', 3)->assertJsonPath('data.data.0.id', $third->id);
        $this->getJson($this->listUrl().'?per_page=1&page=2')->assertOk()->assertJsonPath('data.data.0.id', $second->id);
        foreach ([0, -1, 101, 'invalid'] as $size) {
            $this->getJson($this->listUrl().'?per_page='.$size)->assertUnprocessable()->assertJsonValidationErrors('per_page');
        }
    }

    public function test_legacy_consultations_remain_readable_without_automatic_case_conversion(): void
    {
        $legacy = ['diagnosis' => ['tbCaseNumber' => 'OLD-1'], 'doseCalendar' => ['months' => [['days' => ['AB']]]]];
        $record = HealthRecord::create([
            'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id, 'category' => 'General Consultation', 'tb_data' => $legacy,
        ]);
        foreach ([$this->doctor, $this->bhcUser] as $staff) {
            $this->actingAs($staff, 'sanctum')->getJson("/api/health-records/{$record->id}")
                ->assertOk()->assertJsonPath('data.tb_data', $legacy);
            $this->getJson($this->listUrl())->assertOk()->assertJsonPath('data.total', 0);
        }
        $this->assertDatabaseCount('tb_treatment_cases', 0);
    }

    public function test_read_endpoints_do_not_accept_case_mutations(): void
    {
        $case = $this->createCase();
        $this->actingAs($this->doctor, 'sanctum')->postJson($this->listUrl(), ['case_number' => 'FORGED'])->assertStatus(405);
        $this->patchJson("/api/tb-cases/{$case->id}", ['case_number' => 'FORGED'])->assertStatus(405);
        $this->deleteJson("/api/tb-cases/{$case->id}")->assertStatus(405);
        $this->assertSame('TB-2026-0001', $case->fresh()->case_number);
        $this->assertDatabaseCount('tb_treatment_cases', 1);
    }
}
