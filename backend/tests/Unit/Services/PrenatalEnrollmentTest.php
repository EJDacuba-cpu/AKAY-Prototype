<?php

namespace Tests\Unit\Services;

use App\Models\HealthRecord;
use App\Models\Patient;
use App\Services\PrenatalEnrollment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PrenatalEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_no_records_is_not_enrolled(): void
    {
        $patient = Patient::create(['first_name' => 'A', 'last_name' => 'B', 'sex' => 'Female']);
        $state = PrenatalEnrollment::stateFor($patient->id);
        $this->assertFalse($state['enrolled']);
        $this->assertNull($state['status']);
    }

    public function test_finalized_maternal_record_is_prenatal(): void
    {
        $patient = Patient::create(['first_name' => 'A', 'last_name' => 'B', 'sex' => 'Female']);
        HealthRecord::create([
            'patient_id' => $patient->id,
            'category' => 'Maternal',
            'date_recorded' => '2026-06-01',
            'monitoring_data' => ['selectedPrograms' => ['Maternal']],
            'maternal_data' => ['lmp' => '2026-03-01'],
        ]);

        $state = PrenatalEnrollment::stateFor($patient->id, Carbon::parse('2026-09-01'));
        $this->assertTrue($state['enrolled']);
        $this->assertSame(PrenatalEnrollment::STATUS_PRENATAL, $state['status']);
    }

    public function test_completed_episode_can_be_enrolled_again(): void
    {
        $patient = Patient::create(['first_name' => 'A', 'last_name' => 'B', 'sex' => 'Female']);
        HealthRecord::create([
            'patient_id' => $patient->id,
            'category' => 'Maternal',
            'date_recorded' => '2026-06-01',
            'monitoring_data' => [
                'selectedPrograms' => ['Maternal'],
                'visitPurpose' => ['services' => ['Postpartum']],
            ],
            'maternal_data' => ['deliveryDate' => '2026-06-01'],
        ]);

        $state = PrenatalEnrollment::stateFor($patient->id, Carbon::parse('2026-07-14'));
        $this->assertFalse($state['enrolled']);
        $this->assertSame(PrenatalEnrollment::STATUS_COMPLETED, $state['status']);
    }
}
