<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\TbTreatmentCase;
use App\Models\User;
use App\Services\TbCaseNumberAllocator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;
use RuntimeException;
use Tests\TestCase;

class TbCaseNumberAllocatorTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private RuralHealthUnit $otherRhu;

    private User $doctor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Number RHU', 'status' => 'active']);
        $this->otherRhu = RuralHealthUnit::create(['name' => 'Other Number RHU', 'status' => 'active']);
        $this->doctor = User::create([
            'name' => 'Doctor', 'email' => 'number-doctor@example.test', 'password' => 'password123',
            'role' => 'rhu', 'staff_role' => 'doctor', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    private function allocate(int $year = 2026, ?string $number = null, ?int $rhuId = null): string
    {
        return app(TbCaseNumberAllocator::class)->allocate($rhuId ?? $this->rhu->id, $year, $number);
    }

    private function persist(string $number, int $year = 2026, ?RuralHealthUnit $rhu = null): TbTreatmentCase
    {
        $rhu ??= $this->rhu;
        $patient = Patient::create(['first_name' => 'Number', 'last_name' => 'Test', 'sex' => 'Female', 'rural_health_unit_id' => $rhu->id]);
        $source = HealthRecord::create(['patient_id' => $patient->id, 'rural_health_unit_id' => $rhu->id, 'category' => 'General Consultation']);

        return TbTreatmentCase::create([
            'patient_id' => $patient->id, 'rural_health_unit_id' => $rhu->id, 'source_health_record_id' => $source->id,
            'reporting_year' => $year, 'case_number' => $number, 'registered_by' => $this->doctor->id,
            'registered_at' => now(), 'diagnosis_snapshot' => [], 'card_data' => [],
        ]);
    }

    public function test_generated_numbers_are_independent_by_rhu_and_year(): void
    {
        $this->assertSame('TB-2026-0001', $this->allocate());
        $this->assertSame('TB-2026-0002', $this->allocate());
        $this->assertSame('TB-2027-0001', $this->allocate(2027));
        $this->assertSame('TB-2026-0001', $this->allocate(rhuId: $this->otherRhu->id));
    }

    public function test_supplied_number_is_normalized_and_generated_numbers_skip_it(): void
    {
        $this->assertSame('TB-2026-0001', $number = $this->allocate(number: ' tb-2026-0001 '));
        $this->persist($number);
        $this->assertSame('TB-2026-0002', $this->allocate());
        $this->assertSame('2026-0042', $this->allocate(number: '2026-0042'));
    }

    public function test_supplied_number_cannot_duplicate_an_existing_number_in_the_same_scope(): void
    {
        $this->persist('MANUAL-1');
        $this->expectException(ValidationException::class);
        $this->allocate(number: ' manual-1 ');
    }

    public function test_supplied_number_can_be_reused_in_a_different_rhu_or_reporting_year(): void
    {
        $this->persist('MANUAL-1');
        $this->assertSame('MANUAL-1', $this->allocate(2027, 'manual-1'));
        $this->assertSame('MANUAL-1', $this->allocate(number: 'manual-1', rhuId: $this->otherRhu->id));
    }

    public function test_unicode_padding_does_not_create_a_second_visually_identical_identifier(): void
    {
        $this->assertSame('MANUAL-1', $number = $this->allocate(number: "\u{00A0}manual-1\u{2003}"));
        $stored = $this->persist("\u{2003}".$number."\u{00A0}");
        $this->assertSame('MANUAL-1', $stored->fresh()->case_number);
        $this->expectException(ValidationException::class);
        $this->allocate(number: 'MANUAL-1');
    }

    public function test_rollback_restores_number_and_does_not_leave_a_counter_reservation(): void
    {
        try {
            DB::transaction(function () {
                $this->persist($this->allocate());
                throw new RuntimeException('Registration aborted.');
            });
        } catch (RuntimeException $exception) {
            $this->assertSame('Registration aborted.', $exception->getMessage());
        }
        $this->assertDatabaseCount('tb_case_number_counters', 0);
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $this->assertSame('TB-2026-0001', $this->allocate());
    }

    public function test_legacy_same_rhu_and_catchment_bhc_numbers_are_reserved_without_rewriting_history(): void
    {
        $patient = Patient::create(['first_name' => 'Legacy', 'last_name' => 'Number', 'sex' => 'Male']);
        $bhc = BarangayHealthCenter::create(['name' => 'Legacy BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $rhuRecord = HealthRecord::create([
            'patient_id' => $patient->id, 'rural_health_unit_id' => $this->rhu->id, 'category' => 'General Consultation',
            'date_recorded' => '2025-01-01', 'tb_data' => ['diagnosis' => ['tbCaseNumber' => "\u{00A0}tb-2026-0001\u{2003}"]],
        ]);
        $bhcRecord = HealthRecord::create([
            'patient_id' => $patient->id, 'barangay_health_center_id' => $bhc->id, 'category' => 'General Consultation',
            'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'TB-2026-0002']],
        ]);
        $before = [$rhuRecord->fresh()->getRawOriginal(), $bhcRecord->fresh()->getRawOriginal()];
        $this->assertSame('TB-2026-0003', $this->allocate());
        $this->assertSame('TB-2026-0001', $this->allocate(rhuId: $this->otherRhu->id));
        $this->assertSame($before, [$rhuRecord->fresh()->getRawOriginal(), $bhcRecord->fresh()->getRawOriginal()]);
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $this->expectException(ValidationException::class);
        $this->allocate(2027, 'tb-2026-0001');
    }

    public function test_invalid_supplied_numbers_and_reporting_years_are_rejected_before_mutating_counter(): void
    {
        foreach (['', '   ', "\u{00A0}", "\u{2003}", " \u{2003}\u{00A0} ", "TB\nBAD", "TB\0BAD", str_repeat('A', 101)] as $number) {
            try {
                $this->allocate(number: $number);
                $this->fail('Invalid case number was accepted.');
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('case_number', $exception->errors());
            }
        }
        foreach ([0, 1899, 10000] as $year) {
            try {
                $this->allocate($year);
                $this->fail('Invalid reporting year was accepted.');
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('reporting_year', $exception->errors());
            }
        }
        $this->assertDatabaseCount('tb_case_number_counters', 0);
    }

    public function test_allocator_requires_the_caller_to_hold_a_transaction_through_case_insertion(): void
    {
        // End RefreshDatabase's outer test transaction to exercise the real guard.
        DB::rollBack();
        $this->expectException(LogicException::class);
        $this->allocate();
    }
}
