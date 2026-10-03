<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/** What a consultation decides for the existing monitoring it followed (Care Plan & Next Steps). */
class CarePlanFollowedConditionTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Followed RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Followed BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'Followed', 'last_name' => 'One', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id]);
        $this->actingAs($this->user(ActionPermissions::PRESETS['clinical']), 'sanctum');
    }

    private function user(array $permissions): User
    {
        return User::create(['name' => 'Followed BHW '.Str::random(4), 'email' => Str::random(8).'@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions]);
    }

    private function save(array $diagnoses, array $carePlan = [], array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Check-up',
            'diagnosis' => implode('; ', array_column($diagnoses, 'name')),
            'diagnoses' => $diagnoses,
            'care_plan' => $carePlan,
            ...$extra,
        ]);
    }

    private function referral(): array
    {
        return [
            'needs_referral' => true,
            'referral' => ['reason_for_referral' => 'Referred for: Hypertension', 'urgency_level' => 'Routine'],
        ];
    }

    private function followedHypertension(): ConditionMonitoring
    {
        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor']])->assertCreated();

        return ConditionMonitoring::where('patient_id', $this->patient->id)->where('status', 'active')->sole();
    }

    private function hypertensionStatus(): ?string
    {
        return collect($this->patient->fresh()->medical_background['currentDiseases'] ?? [])->firstWhere('conditionKey', 'hypertension')['status'] ?? null;
    }

    public function test_a_followed_condition_can_be_referred_without_a_new_diagnosis(): void
    {
        $monitoring = $this->followedHypertension();

        $id = $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_referrals' => [$monitoring->id],
        ], $this->referral())->assertCreated()->json('data.id');

        $this->assertSame('active', $monitoring->fresh()->status, 'a referral never ends BHC monitoring');
        $visit = $monitoring->visits()->where('health_record_id', $id)->sole();
        $this->assertSame('continued', $visit->action);
        $this->assertTrue($visit->referred);
        $this->assertTrue(HealthRecord::findOrFail($id)->needs_referral, 'the visit carries the referral (a hold while no RHU doctor is available)');
    }

    public function test_a_followed_condition_that_is_not_referred_is_not_marked_referred(): void
    {
        $monitoring = $this->followedHypertension();

        $id = $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])->assertCreated()->json('data.id');

        $this->assertFalse($monitoring->visits()->where('health_record_id', $id)->sole()->referred);
    }

    public function test_referring_a_followed_condition_needs_a_referral(): void
    {
        $monitoring = $this->followedHypertension();
        $before = HealthRecord::count();

        $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_referrals' => [$monitoring->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['needs_referral']);

        $this->assertSame($before, HealthRecord::count());
    }

    public function test_only_a_continued_and_not_stopped_condition_can_be_referred(): void
    {
        $monitoring = $this->followedHypertension();

        $this->save([], ['monitoring_referrals' => [$monitoring->id]], $this->referral())
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_referrals.0']);

        $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_referrals' => [$monitoring->id],
            'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Moved away']],
        ], $this->referral())->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_referrals.0']);
    }

    public function test_a_status_update_changes_the_documented_condition_and_is_recorded(): void
    {
        $monitoring = $this->followedHypertension();
        $this->assertSame('Active', $this->hypertensionStatus());
        $revisionBefore = (int) ($this->patient->fresh()->medical_background['revisions']['medical'] ?? 0);

        $id = $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_status_updates' => [['monitoring_id' => $monitoring->id, 'status' => 'Controlled']],
        ])->assertCreated()->json('data.id');

        $this->assertSame('Controlled', $this->hypertensionStatus());
        $this->assertSame('active', $monitoring->fresh()->status, 'a documented status does not end BHC monitoring');
        $this->assertSame($revisionBefore + 1, (int) $this->patient->fresh()->medical_background['revisions']['medical']);
        $changes = HealthRecord::findOrFail($id)->background_changes;
        $this->assertSame('medical', $changes[0]['section']);
        $this->assertSame('consultation', $changes[0]['source']);
    }

    public function test_no_status_update_leaves_the_documented_condition_alone(): void
    {
        $monitoring = $this->followedHypertension();
        $revisionBefore = (int) ($this->patient->fresh()->medical_background['revisions']['medical'] ?? 0);

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])->assertCreated();

        $this->assertSame('Active', $this->hypertensionStatus());
        $this->assertSame($revisionBefore, (int) ($this->patient->fresh()->medical_background['revisions']['medical'] ?? 0));
    }

    public function test_a_status_must_be_a_real_status_for_a_followed_condition(): void
    {
        $monitoring = $this->followedHypertension();

        $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_status_updates' => [['monitoring_id' => $monitoring->id, 'status' => 'Cured']],
        ])->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_status_updates.0.status']);

        $this->save([], [
            'monitoring_status_updates' => [['monitoring_id' => $monitoring->id, 'status' => 'Resolved']],
        ])->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_status_updates.0.monitoring_id']);

        $this->assertSame('Active', $this->hypertensionStatus());
    }

    public function test_changing_a_documented_status_needs_clinical_history_access(): void
    {
        $monitoring = $this->followedHypertension();
        $this->actingAs($this->user(array_values(array_diff(ActionPermissions::PRESETS['clinical'], ['clinical.history']))), 'sanctum');

        $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_status_updates' => [['monitoring_id' => $monitoring->id, 'status' => 'Resolved']],
        ])->assertForbidden();

        $this->assertSame('Active', $this->hypertensionStatus());
    }

    public function test_a_status_update_for_a_condition_missing_from_the_background_changes_nothing(): void
    {
        $monitoring = $this->followedHypertension();
        $this->patient->update(['medical_background' => ['currentDiseases' => [], 'revisions' => ['medical' => 2]]]);

        $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_status_updates' => [['monitoring_id' => $monitoring->id, 'status' => 'Resolved']],
        ])->assertCreated();

        $this->assertSame([], $this->patient->fresh()->medical_background['currentDiseases']);
        $this->assertSame(2, (int) $this->patient->fresh()->medical_background['revisions']['medical']);
    }
}
