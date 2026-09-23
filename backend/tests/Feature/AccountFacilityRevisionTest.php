<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\WorkingFacilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountFacilityRevisionTest extends TestCase
{
    use RefreshDatabase;

    private function user(array $data = []): User
    {
        return User::create([...['name' => 'Staff', 'email' => uniqid().'@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []], ...$data]);
    }

    public function test_nurse_assignment_has_dates_retains_home_and_does_not_change_referral_routing(): void
    {
        $home = RuralHealthUnit::create(['name' => 'Home RHU']);
        $receiving = RuralHealthUnit::create(['name' => 'Receiving RHU']);
        $bhc = BarangayHealthCenter::create(['name' => 'Pitpitan', 'rural_health_unit_id' => $receiving->id]);
        $nurse = $this->user(['role' => 'rhu_staff', 'professional_designation' => 'Nurse', 'rural_health_unit_id' => $home->id]);
        Sanctum::actingAs($this->user(), ['*']);
        $data = ['user_id' => $nurse->id, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical'], 'starts_on' => today()->toDateString(), 'assignment_type' => 'temporary'];
        $this->postJson('/api/staff-assignments', $data)->assertUnprocessable()->assertJsonValidationErrors('ends_on');
        $response = $this->postJson('/api/staff-assignments', [...$data, 'ends_on' => today()->addDays(3)->toDateString()])->assertCreated();
        $this->assertSame($home->id, $nurse->fresh()->rural_health_unit_id);
        $this->assertSame($receiving->id, $bhc->fresh()->rural_health_unit_id);
        $this->assertCount(2, app(WorkingFacilityService::class)->available($nurse));
        $this->postJson('/api/staff-assignments/'.$response->json('data.id').'/revoke')->assertOk();
        $this->assertCount(1, app(WorkingFacilityService::class)->available($nurse));
    }

    public function test_non_nurses_and_future_or_expired_assignments_do_not_gain_bhc_access(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Home RHU']);
        $bhc = BarangayHealthCenter::create(['name' => 'BHC']);
        Sanctum::actingAs($this->user(), ['*']);
        foreach (['Midwife', 'Encoder', 'Logistics'] as $designation) {
            $staff = $this->user(['role' => 'rhu_staff', 'professional_designation' => $designation, 'rural_health_unit_id' => $rhu->id]);
            $this->postJson('/api/staff-assignments', ['user_id' => $staff->id, 'barangay_health_center_id' => $bhc->id, 'permissions' => ['consultations.encode'], 'starts_on' => today()->toDateString(), 'assignment_type' => 'ongoing'])->assertUnprocessable();
        }
        $nurse = $this->user(['role' => 'rhu_staff', 'professional_designation' => 'Nurse', 'rural_health_unit_id' => $rhu->id]);
        $nurse->facilityAssignments()->create(['barangay_health_center_id' => $bhc->id, 'permissions' => ['consultations.encode'], 'starts_on' => today()->addDay(), 'assignment_type' => 'ongoing']);
        $nurse->facilityAssignments()->create(['barangay_health_center_id' => $bhc->id, 'permissions' => ['consultations.encode'], 'starts_on' => today()->subDays(3), 'ends_on' => today()->subDay(), 'assignment_type' => 'temporary']);
        $this->assertCount(1, app(WorkingFacilityService::class)->available($nurse));
    }

    public function test_selected_authorized_alternative_receives_referral_and_default_is_unchanged(): void
    {
        $default = RuralHealthUnit::create(['name' => 'Default unavailable']);
        $alternative = RuralHealthUnit::create(['name' => 'Alternative available']);
        $rogue = RuralHealthUnit::create(['name' => 'Not approved']);
        $bhc = BarangayHealthCenter::create(['name' => 'Pitpitan', 'rural_health_unit_id' => $default->id]);
        $bhc->alternativeRhus()->attach($alternative);
        $this->seedAvailableProvider($alternative);
        $this->seedAvailableProvider($rogue);
        $user = $this->user(['role' => 'bhw', 'professional_designation' => 'Midwife', 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'Sample', 'last_name' => 'Patient', 'sex' => 'Female', 'created_by' => $user->id, 'barangay_health_center_id' => $bhc->id]);
        Sanctum::actingAs($user, ['*']);
        $data = ['patient_id' => $patient->id, 'urgency_level' => 'Routine', 'reason_for_referral' => 'Clinical review'];
        $this->postJson('/api/referrals', [...$data, 'rural_health_unit_id' => $rogue->id])->assertUnprocessable();
        $this->postJson('/api/referrals', [...$data, 'rural_health_unit_id' => $alternative->id])->assertCreated()->assertJsonPath('data.rural_health_unit_id', $alternative->id);
        $this->assertSame($default->id, $bhc->fresh()->rural_health_unit_id);
        $this->assertSame($bhc->id, $patient->fresh()->barangay_health_center_id);
        $this->assertDatabaseCount('facility_assignments', 0);
    }

    public function test_hold_and_availability_use_selected_destination_and_recheck_at_submission(): void
    {
        $default = RuralHealthUnit::create(['name' => 'Default available']);
        $alternative = RuralHealthUnit::create(['name' => 'Alternative unavailable']);
        $bhc = BarangayHealthCenter::create(['name' => 'Pitpitan', 'rural_health_unit_id' => $default->id]);
        $bhc->alternativeRhus()->attach($alternative);
        $this->seedAvailableProvider($default);
        $user = $this->user(['role' => 'bhw', 'professional_designation' => 'Midwife', 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'Sample', 'last_name' => 'Patient', 'sex' => 'Female', 'created_by' => $user->id, 'barangay_health_center_id' => $bhc->id]);
        Sanctum::actingAs($user, ['*']);
        $this->getJson('/api/rhu-providers/availability?rural_health_unit_id='.$alternative->id)->assertOk()->assertJsonPath('data.can_submit_referral', false);
        $this->postJson('/api/referral-holds', ['patient_id' => $patient->id, 'rural_health_unit_id' => $alternative->id])->assertCreated()->assertJsonPath('data.rural_health_unit_id', $alternative->id);
        $this->assertDatabaseCount('referrals', 0);
        $provider = $this->seedAvailableProvider($alternative);
        $this->getJson('/api/rhu-providers/availability?rural_health_unit_id='.$alternative->id)->assertOk()->assertJsonPath('data.can_submit_referral', true);
        $provider->update(['availability_status' => 'Unavailable']);
        $this->postJson('/api/referrals', ['patient_id' => $patient->id, 'rural_health_unit_id' => $alternative->id, 'urgency_level' => 'Routine', 'reason_for_referral' => 'Review'])->assertStatus(422);
        $this->assertDatabaseCount('referrals', 0);
    }

    public function test_account_setup_requires_permission_confirmation_and_cannot_create_assignments(): void
    {
        Sanctum::actingAs($this->user(), ['*']);
        $rhu = RuralHealthUnit::create(['name' => 'Home']);
        $data = ['name' => 'Nurse', 'email' => 'nurse@example.test', 'password' => 'password123', 'role' => 'rhu_staff', 'professional_designation' => 'Nurse', 'rural_health_unit_id' => $rhu->id, 'permissions' => ActionPermissions::PRESETS['rhu']];
        $this->postJson('/api/users', $data)->assertUnprocessable()->assertJsonValidationErrors('permissions_confirmed');
        $this->postJson('/api/users', [...$data, 'permissions_confirmed' => true, 'facility_assignments' => [['barangay_health_center_id' => 1]]])->assertUnprocessable()->assertJsonValidationErrors('facility_assignments');
        $this->postJson('/api/users', [...$data, 'permissions_confirmed' => true])->assertCreated();
        $this->assertDatabaseCount('facility_assignments', 0);
    }

    public function test_facility_configuration_does_not_grant_receiving_staff_bhc_access(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'RHU']);
        $other = RuralHealthUnit::create(['name' => 'Alternative']);
        $bhc = BarangayHealthCenter::create(['name' => 'BHC', 'rural_health_unit_id' => $rhu->id]);
        $nurse = $this->user(['role' => 'rhu_staff', 'professional_designation' => 'Nurse', 'rural_health_unit_id' => $other->id]);
        Sanctum::actingAs($this->user(), ['*']);
        $this->patchJson('/api/barangay-health-centers/'.$bhc->id, ['rural_health_unit_id' => $rhu->id, 'alternative_rhu_ids' => [$other->id]])->assertOk();
        $this->assertCount(1, app(WorkingFacilityService::class)->available($nurse));
        $this->assertDatabaseCount('facility_assignments', 0);
    }

    public function test_assignment_management_is_admin_only_and_overlaps_are_rejected(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'Home']);
        $bhc = BarangayHealthCenter::create(['name' => 'BHC']);
        $nurse = $this->user(['role' => 'rhu_staff', 'professional_designation' => 'Nurse', 'rural_health_unit_id' => $rhu->id]);
        $data = ['user_id' => $nurse->id, 'barangay_health_center_id' => $bhc->id, 'starts_on' => today()->toDateString(), 'assignment_type' => 'ongoing', 'permissions' => ['patients.register', 'consultations.encode']];
        Sanctum::actingAs($nurse, ['*']);
        $this->postJson('/api/staff-assignments', $data)->assertForbidden();
        Sanctum::actingAs($this->user(), ['*']);
        $assignment = $this->postJson('/api/staff-assignments', $data)->assertCreated()->json('data.id');
        $this->postJson('/api/staff-assignments', $data)->assertUnprocessable();
        Sanctum::actingAs($nurse->fresh(), ['*']);
        $this->withHeader('X-Working-Facility', (string) $assignment)->getJson('/api/patients')->assertOk();
        \App\Models\FacilityAssignment::find($assignment)->update(['revoked_at' => now()]);
        $this->withHeader('X-Working-Facility', (string) $assignment)->getJson('/api/patients')->assertForbidden();
    }

    public function test_hold_notifications_follow_selected_rhu_and_authorized_working_bhc(): void
    {
        $home = RuralHealthUnit::create(['name' => 'Home']);
        $selected = RuralHealthUnit::create(['name' => 'Selected']);
        $bhc = BarangayHealthCenter::create(['name' => 'BHC', 'rural_health_unit_id' => $selected->id]);
        $nurse = $this->user(['role' => 'rhu_staff', 'professional_designation' => 'Nurse', 'rural_health_unit_id' => $home->id, 'permissions' => ActionPermissions::PRESETS['rhu']]);
        $assignment = $nurse->facilityAssignments()->create(['barangay_health_center_id' => $bhc->id, 'starts_on' => today(), 'assignment_type' => 'ongoing', 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'Test', 'last_name' => 'Patient', 'sex' => 'Female', 'created_by' => $nurse->id, 'barangay_health_center_id' => $bhc->id]);
        $holds = app(\App\Services\ReferralHoldService::class);
        $holds->recordBlockedAttempt($nurse, $patient, $bhc->id, $selected, []);
        $holds->notifyWaitingHolds($home);
        $this->assertDatabaseCount('notifications', 0);
        $holds->notifyWaitingHolds($selected);
        $this->assertDatabaseCount('notifications', 1);
        Sanctum::actingAs($nurse, ['*']);
        $this->withHeader('X-Working-Facility', (string) $assignment->id)->getJson('/api/notifications')->assertOk()->assertJsonCount(1, 'data.data');
        $this->withHeader('X-Working-Facility', 'home')->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data.data');
        $this->assertDatabaseCount('referrals', 0);
    }

    public function test_changing_approved_destinations_preserves_historical_referrals(): void
    {
        $old = RuralHealthUnit::create(['name' => 'Old']);
        $next = RuralHealthUnit::create(['name' => 'New']);
        $bhc = BarangayHealthCenter::create(['name' => 'BHC', 'rural_health_unit_id' => $old->id]);
        $user = $this->user(['role' => 'bhw', 'professional_designation' => 'Midwife', 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'Test', 'last_name' => 'Patient', 'sex' => 'Female', 'created_by' => $user->id, 'barangay_health_center_id' => $bhc->id]);
        $this->seedAvailableProvider($old);
        Sanctum::actingAs($user, ['*']);
        $id = $this->postJson('/api/referrals', ['patient_id' => $patient->id, 'rural_health_unit_id' => $old->id, 'urgency_level' => 'Routine', 'reason_for_referral' => 'Review'])->assertCreated()->json('data.id');
        Sanctum::actingAs($this->user(), ['*']);
        $this->patchJson('/api/barangay-health-centers/'.$bhc->id, ['rural_health_unit_id' => $next->id, 'alternative_rhu_ids' => []])->assertOk();
        $this->assertDatabaseHas('referrals', ['id' => $id, 'rural_health_unit_id' => $old->id]);
        Sanctum::actingAs($user->fresh(), ['*']);
        $this->postJson('/api/referrals', ['patient_id' => $patient->id, 'rural_health_unit_id' => $old->id, 'urgency_level' => 'Routine', 'reason_for_referral' => 'Review'])->assertUnprocessable();
    }
}
