<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Services\ReferralService;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class RhuVisitQueueMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_10_24_000001_create_rhu_visit_queue_entries_table.php';

    /** @return array{rhu: RuralHealthUnit, otherRhu: RuralHealthUnit, patient: Patient, referral: Referral} */
    private function fixtures(): array
    {
        $rhu = RuralHealthUnit::create(['name' => 'Queue RHU '.uniqid(), 'status' => 'active']);
        $otherRhu = RuralHealthUnit::create(['name' => 'Other RHU '.uniqid(), 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Queue BHC '.uniqid(), 'status' => 'active']);
        $patient = Patient::create(['first_name' => 'Queue', 'last_name' => 'Patient', 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $referral = Referral::create([
            'tracking_id' => 'AKY-TEST-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'rural_health_unit_id' => $rhu->id,
            'reason_for_referral' => 'Test',
            'status' => Referral::STATUS_PENDING,
        ]);

        return compact('rhu', 'otherRhu', 'patient', 'referral');
    }

    private function row(array $overrides): array
    {
        return [
            'source' => 'walk_in',
            'status' => 'waiting',
            'checked_in_at' => now(),
            'check_in_key' => uniqid('key-', true),
            'created_at' => now(),
            'updated_at' => now(),
            ...$overrides,
        ];
    }

    private function insert(array $overrides): void
    {
        DB::table('rhu_visit_queue_entries')->insert($this->row($overrides));
    }

    public function test_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasColumns('rhu_visit_queue_entries', [
            'id', 'rural_health_unit_id', 'patient_id', 'referral_id', 'source', 'status',
            'checked_in_at', 'closed_at', 'checked_in_by', 'closed_by', 'close_reason', 'close_note',
            'consultation_uuid', 'continued_follow_up_task_ids', 'check_in_key', 'created_at', 'updated_at',
        ]));
    }

    public function test_second_active_entry_for_same_patient_and_rhu_is_rejected(): void
    {
        ['rhu' => $rhu, 'patient' => $patient] = $this->fixtures();
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id]);

        $this->expectException(UniqueConstraintViolationException::class);
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id]);
    }

    public function test_closed_entry_does_not_block_a_new_active_entry(): void
    {
        ['rhu' => $rhu, 'patient' => $patient] = $this->fixtures();
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'closed_at' => now()]);
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id]);

        $this->assertSame(2, DB::table('rhu_visit_queue_entries')->count());
    }

    public function test_same_patient_may_be_active_at_two_rhus(): void
    {
        ['rhu' => $rhu, 'otherRhu' => $otherRhu, 'patient' => $patient] = $this->fixtures();
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id]);
        $this->insert(['rural_health_unit_id' => $otherRhu->id, 'patient_id' => $patient->id]);

        $this->assertSame(2, DB::table('rhu_visit_queue_entries')->count());
    }

    public function test_check_in_key_is_unique_per_rhu(): void
    {
        ['rhu' => $rhu, 'otherRhu' => $otherRhu, 'patient' => $patient] = $this->fixtures();
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'check_in_key' => 'same-key']);
        $this->insert(['rural_health_unit_id' => $otherRhu->id, 'patient_id' => $patient->id, 'check_in_key' => 'same-key']);
        $this->assertSame(2, DB::table('rhu_visit_queue_entries')->count());

        $this->expectException(UniqueConstraintViolationException::class);
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'check_in_key' => 'same-key', 'closed_at' => now()]);
    }

    public function test_unknown_source_is_rejected(): void
    {
        ['rhu' => $rhu, 'patient' => $patient] = $this->fixtures();

        $this->expectException(QueryException::class);
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'source' => 'kiosk']);
    }

    public function test_referral_source_requires_referral(): void
    {
        ['rhu' => $rhu, 'patient' => $patient] = $this->fixtures();

        $this->expectException(QueryException::class);
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'source' => 'referral', 'referral_id' => null]);
    }

    public function test_walk_in_may_carry_a_referral_link(): void
    {
        ['rhu' => $rhu, 'patient' => $patient, 'referral' => $referral] = $this->fixtures();
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'source' => 'walk_in', 'referral_id' => $referral->id]);

        $this->assertSame($referral->id, (int) DB::table('rhu_visit_queue_entries')->value('referral_id'));
    }

    public function test_down_removes_only_the_queue_table(): void
    {
        $migration = require database_path(self::MIGRATION);
        $migration->down();

        $this->assertFalse(Schema::hasTable('rhu_visit_queue_entries'));
        $this->assertTrue(Schema::hasTable('referrals'));
        $this->assertTrue(Schema::hasTable('patients'));

        $migration->up();
        $this->assertTrue(Schema::hasTable('rhu_visit_queue_entries'));
    }

    public function test_consultation_uuid_is_unique_when_present(): void
    {
        ['rhu' => $rhu, 'patient' => $patient, 'otherRhu' => $otherRhu] = $this->fixtures();
        $otherPatient = Patient::create(['first_name' => 'Other', 'last_name' => 'Uuid', 'sex' => 'Male', 'status' => 'active', 'rural_health_unit_id' => $otherRhu->id]);
        $this->insert([
            'rural_health_unit_id' => $rhu->id,
            'patient_id' => $patient->id,
            'consultation_uuid' => '11111111-1111-1111-1111-111111111111',
        ]);

        $this->expectException(UniqueConstraintViolationException::class);
        $this->insert([
            'rural_health_unit_id' => $otherRhu->id,
            'patient_id' => $otherPatient->id,
            'consultation_uuid' => '11111111-1111-1111-1111-111111111111',
        ]);
    }

    public function test_model_active_scope_excludes_closed_entries(): void
    {
        ['rhu' => $rhu, 'patient' => $patient] = $this->fixtures();
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id]);
        $this->insert(['rural_health_unit_id' => $rhu->id, 'patient_id' => $patient->id, 'closed_at' => now()]);

        $this->assertSame(1, RhuVisitQueueEntry::active()->count());
    }
}
