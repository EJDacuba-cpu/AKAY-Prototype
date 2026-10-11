<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\PatientConditionEvent;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Services\StaffRoles;
use Tests\TestCase;

class PatientConditionSchemaTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private Patient $otherPatient;

    private BarangayHealthCenter $bhc;

    private User $rhuUser;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Cond RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Cond BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->rhuUser = User::create(['name' => 'Cond RHU Staff', 'email' => 'cond-rhu@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_RHU, 'status' => User::STATUS_ACTIVE, 'rural_health_unit_id' => $rhu->id, 'permissions' => StaffRoles::defaults('nurse')]);
        $this->patient = Patient::create(['first_name' => 'Cond', 'last_name' => 'One', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id]);
        $this->otherPatient = Patient::create(['first_name' => 'Cond', 'last_name' => 'Two', 'sex' => 'Male', 'barangay_health_center_id' => $this->bhc->id]);
    }

    private function condition(string $status, string $identity = 'hypertension', ?Patient $patient = null): PatientCondition
    {
        return PatientCondition::create([
            'patient_id' => ($patient ?? $this->patient)->id, 'condition_name' => 'Hypertension',
            'condition_identity' => $identity, 'status' => $status,
            'confirmed_by' => $this->rhuUser->id, 'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD, 'source_id' => 1,
        ]);
    }

    private function monitoring(?int $conditionId, string $identity): ConditionMonitoring
    {
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);

        return ConditionMonitoring::create([
            'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id,
            'condition_name' => 'Hypertension', 'condition_identity' => $identity, 'status' => 'active',
            'started_health_record_id' => $record->id, 'started_at' => now(),
            'patient_condition_id' => $conditionId,
        ]);
    }

    public function test_only_one_open_condition_per_identity(): void
    {
        $this->condition('resolved');
        $this->condition('active'); // a past row and an open row coexist
        $this->assertSame(2, PatientCondition::where('patient_id', $this->patient->id)->count());

        $this->expectException(QueryException::class);
        $this->condition('under_evaluation'); // a second open row is refused
    }

    public function test_each_open_status_blocks_a_duplicate_but_closed_ones_do_not(): void
    {
        foreach (PatientCondition::OPEN_STATUSES as $i => $status) {
            $identity = "cond-$i";
            $this->condition($status, $identity);
            try {
                $this->condition('active', $identity);
                $this->fail("A second open row was allowed beside a $status row.");
            } catch (QueryException) {
                // expected
            }
        }

        // Closed history stacks freely, and another patient or identity is independent.
        $this->condition('resolved', 'history');
        $this->condition('ruled_out', 'history');
        $this->condition('resolved', 'history');
        $this->condition('active', 'cond-0', $this->otherPatient);
        $this->condition('active', 'diabetes');
        $this->assertSame(3, PatientCondition::where('condition_identity', 'history')->count());
    }

    public function test_status_constants_and_open_scope(): void
    {
        $this->assertSame(['under_evaluation', 'active', 'controlled', 'resolved', 'ruled_out'], PatientCondition::STATUSES);
        $this->assertSame(['under_evaluation', 'active', 'controlled'], PatientCondition::OPEN_STATUSES);
        $this->assertSame(['active', 'controlled'], PatientCondition::MONITORABLE_STATUSES);
        $this->assertSame('rhu_feedback', PatientCondition::SOURCE_RHU_FEEDBACK);
        $this->assertSame('rhu_record', PatientCondition::SOURCE_RHU_RECORD);

        $this->condition('resolved', 'a');
        $this->condition('ruled_out', 'b');
        $open = [
            $this->condition('under_evaluation', 'c')->id,
            $this->condition('active', 'd')->id,
            $this->condition('controlled', 'e')->id,
        ];

        $this->assertEqualsCanonicalizing($open, PatientCondition::open()->pluck('id')->all());
    }

    public function test_condition_relations_and_events(): void
    {
        $condition = $this->condition('active');
        $event = PatientConditionEvent::create([
            'patient_condition_id' => $condition->id, 'from_status' => null, 'to_status' => 'active',
            'note' => 'Confirmed at RHU', 'source_type' => 'rhu_record', 'source_id' => 1,
            'changed_by' => $this->rhuUser->id, 'changed_at' => now(),
        ]);
        $linked = $this->monitoring($condition->id, 'hypertension');

        $this->assertSame($this->patient->id, $condition->patient->id);
        $this->assertSame($this->rhuUser->id, $condition->confirmedBy->id);
        $this->assertSame([$event->id], $condition->events->pluck('id')->all());
        $this->assertSame($condition->id, $event->condition->id);
        $this->assertSame([$linked->id], $condition->monitorings->pluck('id')->all());
        $this->assertSame([$condition->id], $this->patient->conditions->pluck('id')->all());
        $this->assertFalse($event->usesTimestamps());
        $this->assertNull($condition->bhc_monitoring_recommended_at);
        $this->assertNull($condition->bhc_monitoring_recommended_by);
    }

    public function test_monitoring_can_link_a_condition_and_legacy_rows_have_none(): void
    {
        $condition = $this->condition('active');
        $linked = $this->monitoring($condition->id, 'hypertension');
        $legacy = $this->monitoring(null, 'name:legacy');

        $this->assertSame($condition->id, $linked->patientCondition->id);
        $this->assertFalse($linked->isLegacy());
        $this->assertNull($legacy->patientCondition);
        $this->assertTrue($legacy->isLegacy());
    }

    public function test_deleting_a_condition_unlinks_monitoring_and_removes_events(): void
    {
        $condition = $this->condition('active');
        PatientConditionEvent::create([
            'patient_condition_id' => $condition->id, 'to_status' => 'active', 'source_type' => 'rhu_record',
            'source_id' => 1, 'changed_by' => $this->rhuUser->id, 'changed_at' => now(),
        ]);
        $monitoring = $this->monitoring($condition->id, 'hypertension');

        $condition->delete();

        $this->assertTrue($monitoring->fresh()->isLegacy());
        $this->assertSame(0, PatientConditionEvent::count());
    }

    public function test_the_condition_foreign_keys_are_indexed(): void
    {
        foreach (['patient_condition_events', 'condition_monitorings'] as $table) {
            $indexed = collect(\Illuminate\Support\Facades\Schema::getIndexes($table))
                ->contains(fn (array $index) => $index['columns'] === ['patient_condition_id']);
            $this->assertTrue($indexed, "$table.patient_condition_id has no index");
        }
    }
}
