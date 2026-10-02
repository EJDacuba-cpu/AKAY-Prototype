<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TbRecordDetectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_tb_filter_matches_legacy_category_and_new_tb_data(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'TB RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'TB BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'TB BHW', 'email' => 'tb@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'TB', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $legacy = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'TB DOTS / TB Monitoring', 'barangay_health_center_id' => $bhc->id]);
        $new = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'TB-1']], 'barangay_health_center_id' => $bhc->id]);
        HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $ids = collect($this->getJson('/api/health-records?category='.urlencode('TB DOTS / TB Monitoring'))->assertOk()->json('data.data'))->pluck('id')->sort()->values()->all();

        $this->assertSame(collect([$legacy->id, $new->id])->sort()->values()->all(), $ids);
    }
}
