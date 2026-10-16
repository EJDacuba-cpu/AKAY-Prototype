<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\PatientBackground;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class PatientBackgroundIndependentTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private RuralHealthUnit $rhu;

    private User $staff;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->staff = User::create(['name' => 'Editor', 'email' => 'editor@example.test', 'password' => 'password123', 'role' => 'bhc', 'staff_role' => 'encoder', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => ['clinical.history', 'clinical.background.update']]);
        $this->patient = Patient::create(['first_name' => 'History', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id, 'medical_background' => [
            'allergies' => ['noneKnown' => true], 'revisions' => ['medical' => 2, 'social' => 1],
            'personalSocial' => ['education' => ['level' => 'College', 'completed' => 'Level'], 'pastOccupations' => 'Farmer', 'smoking' => ['status' => 'never']],
        ]]);
        $this->actingAs($this->staff, 'sanctum');
    }

    private function save(array $sections = ['medical' => ['allergies' => ['items' => [['allergen' => 'Dust']]]]], array $bases = ['medical' => 2])
    {
        return $this->patchJson('/api/patients/'.$this->patient->id.'/background', ['background_update' => ['sections' => $sections, 'base_revisions' => $bases]]);
    }

    public function test_explicit_capability_and_history_are_required_without_registration_authority(): void
    {
        $this->staff->update(['permissions' => ['clinical.history']]);
        $this->save()->assertForbidden();
        $this->staff->update(['permissions' => ['clinical.background.update']]);
        $this->save()->assertForbidden();
        $this->staff->update(['permissions' => ['clinical.history', 'clinical.background.update']]);
        $this->save()->assertOk();
    }

    public function test_another_bhc_and_rhu_cannot_write(): void
    {
        $other = BarangayHealthCenter::create(['name' => 'Other', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->staff->update(['barangay_health_center_id' => $other->id]);
        $this->save()->assertForbidden();
        $this->staff->update(['role' => 'rhu', 'barangay_health_center_id' => null, 'rural_health_unit_id' => $this->rhu->id]);
        $this->patient->update(['rural_health_unit_id' => $this->rhu->id]);
        $this->save()->assertForbidden();
    }

    public function test_save_appends_server_stamped_audit_without_a_health_record(): void
    {
        $this->save()->assertOk()->assertJsonPath('data.medical_background.revisions.medical', 3);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseHas('patient_background_changes', ['patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'changed_by' => $this->staff->id, 'source' => 'patient_background', 'section' => 'medical', 'revision' => 3]);
        $this->getJson('/api/patients/'.$this->patient->id.'/background-history')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.source', 'patient_background')
            ->assertJsonMissingPath('data.0.healthRecordId')->assertJsonPath('data.0.changedByName', 'Editor')
            ->assertJsonPath('data.0.before.allergies.noneKnown', true)->assertJsonPath('data.0.after.allergies.items.0.allergen', 'Dust');
    }

    public function test_save_response_is_the_same_authorized_patient_serialization_as_the_detail_endpoint(): void
    {
        HealthRecord::create(['patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'category' => 'General Consultation', 'date_recorded' => '2026-10-15']);
        $this->patient->update(['education_level' => 'College', 'education_completed' => 'Level']);

        $detail = $this->getJson('/api/patients/'.$this->patient->id)->assertOk()->json('data');
        $saved = $this->save()->assertOk()->json('data');

        foreach (['household_environment', 'health_records', 'referrals', 'health_records_count', 'referrals_count', 'education_level', 'education_completed'] as $key) {
            $this->assertArrayHasKey($key, $detail, "detail.{$key}");
        }
        $this->assertSame(array_keys($detail), array_keys($saved));
        $this->assertSame('College', $saved['education_level']);
        $this->assertCount(1, $saved['health_records']);
    }

    public function test_noop_does_not_append_or_bump_revision(): void
    {
        $this->save(['medical' => ['allergies' => ['noneKnown' => true]]])->assertOk()->assertJsonPath('data.medical_background.revisions.medical', 2);
        $this->assertDatabaseCount('patient_background_changes', 0);
    }

    public function test_invalid_empty_and_forged_metadata_updates_are_rejected(): void
    {
        $this->save([], [])->assertUnprocessable()->assertJsonValidationErrors('background_update.sections');
        $this->save(['medical' => null])->assertUnprocessable()->assertJsonValidationErrors('background_update.sections.medical');
        $this->save(['medical' => ['allergies' => ['items' => [['allergen' => '']]]]])->assertUnprocessable()->assertJsonValidationErrors('background_update.sections.medical.allergies.items.0.allergen');
        $this->patchJson('/api/patients/'.$this->patient->id.'/background', ['background_update' => ['sections' => ['medical' => []], 'base_revisions' => ['medical' => 2], 'source' => 'forged']])->assertUnprocessable();
        $this->assertDatabaseCount('patient_background_changes', 0);
    }

    public function test_stale_update_is_atomic_across_sections(): void
    {
        $this->save(['medical' => ['allergies' => null], 'social' => ['personalSocial' => ['smoking' => ['status' => 'former']]]], ['medical' => 1, 'social' => 1])
            ->assertStatus(409)->assertJsonPath('code', 'PATIENT_BACKGROUND_CONFLICT')->assertJsonPath('conflicts.0.revision', 2);
        $this->assertSame('never', $this->patient->fresh()->medical_background['personalSocial']['smoking']['status']);
        $this->assertDatabaseCount('patient_background_changes', 0);
    }

    public function test_audit_failure_rolls_back_patient_change(): void
    {
        DB::unprepared("CREATE TRIGGER reject_background_audit BEFORE INSERT ON patient_background_changes BEGIN SELECT RAISE(ABORT, 'audit failed'); END");
        $this->save()->assertServerError();
        $this->assertTrue($this->patient->fresh()->medical_background['allergies']['noneKnown']);
        $this->assertDatabaseCount('patient_background_changes', 0);
    }

    public function test_direct_and_legacy_consultation_saves_preserve_removed_social_fields(): void
    {
        $update = ['personalSocial' => ['education' => ['level' => 'None'], 'pastOccupations' => 'Stale draft job', 'smoking' => ['status' => 'former']]];
        $this->save(['social' => $update], ['social' => 1])->assertOk();
        $this->assertPreservedSocial();
        $this->staff->update(['permissions' => ['clinical.history', 'consultations.encode', 'consultations.finalize']]);
        $update['personalSocial']['smoking']['status'] = 'current';
        $record = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', ['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Check up', 'date_recorded' => '2026-10-16', 'background_update' => ['sections' => ['social' => $update], 'base_revisions' => ['social' => 2]]])->assertCreated()->json('data.id');
        $this->assertPreservedSocial();
        $this->assertSame('consultation', HealthRecord::findOrFail($record)->background_changes[0]['source']);
    }

    private function assertPreservedSocial(): void
    {
        $social = $this->patient->fresh()->medical_background['personalSocial'];
        $this->assertSame(['level' => 'College', 'completed' => 'Level'], $social['education']);
        $this->assertSame('Farmer', $social['pastOccupations']);
    }

    public function test_omitted_removed_fields_are_preserved_and_rhu_apply_retains_its_existing_behavior(): void
    {
        $this->save(['social' => ['personalSocial' => ['smoking' => ['status' => 'former']]]], ['social' => 1])->assertOk();
        $this->assertPreservedSocial();
        $this->staff->update(['role' => 'rhu', 'barangay_health_center_id' => null, 'rural_health_unit_id' => $this->rhu->id]);
        DB::transaction(fn () => app(PatientBackground::class)->apply($this->patient, ['sections' => ['social' => ['personalSocial' => ['education' => ['level' => 'None']]]], 'base_revisions' => ['social' => 2]], $this->staff->fresh(), '2026-10-16'));
        $this->assertSame(['education' => ['level' => 'None']], $this->patient->fresh()->medical_background['personalSocial']);
    }

    public function test_confirmed_conditions_cannot_be_changed_by_patient_reported_section(): void
    {
        $condition = PatientCondition::create(['patient_id' => $this->patient->id, 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'source_type' => 'rhu_record', 'source_id' => 1, 'confirmed_at' => now(), 'confirmed_by' => $this->staff->id]);
        $this->save(['medical' => ['currentDiseases' => [['name' => 'Asthma', 'source' => 'rhu_record', 'status' => 'resolved']]]])->assertOk();
        $this->assertSame('active', $condition->fresh()->status);
        $this->assertSame('Patient-reported', $this->patient->fresh()->medical_background['currentDiseases'][0]['source']);
    }

    public function test_history_merges_consultation_and_standalone_entries_and_excludes_other_facility_audits(): void
    {
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'category' => 'General Consultation', 'date_recorded' => '2026-10-15', 'background_changes' => [['section' => 'family', 'source' => 'consultation', 'revision' => 1, 'changedAt' => '2026-10-15T00:00:00Z', 'changedBy' => $this->staff->id]]]);
        $this->save()->assertOk();
        $audit = DB::table('patient_background_changes')->first();
        $other = BarangayHealthCenter::create(['name' => 'Other', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        DB::table('patient_background_changes')->insert([...get_object_vars($audit), 'id' => $audit->id + 1, 'barangay_health_center_id' => $other->id]);
        $this->getJson('/api/patients/'.$this->patient->id.'/background-history')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.source', 'patient_background')->assertJsonPath('data.1.healthRecordId', $record->id);
    }

    public function test_admin_can_assign_and_revoke_capability_but_it_has_no_implicit_defaults(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum');
        $this->patchJson('/api/users/'.$this->staff->id, ['permissions' => ['clinical.background.update'], 'permissions_confirmed' => true])->assertUnprocessable()->assertJsonValidationErrors('permissions');
        $this->patchJson('/api/users/'.$this->staff->id, ['permissions' => ['clinical.history', 'clinical.background.update'], 'permissions_confirmed' => true])->assertOk();
        $this->patchJson('/api/users/'.$this->staff->id, ['permissions' => ['clinical.history'], 'permissions_confirmed' => true])->assertOk();
        $this->actingAs($this->staff->fresh(), 'sanctum');
        $this->save()->assertForbidden();
        foreach (StaffRoles::ROLES as $role) {
            $this->assertNotContains('clinical.background.update', $role['defaults']);
        }
    }
}
