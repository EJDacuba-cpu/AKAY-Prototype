<?php

namespace Tests\Unit;

use App\Models\Patient;
use Carbon\Carbon;
use PHPUnit\Framework\TestCase;

class PatientAgeTest extends TestCase
{
    private const DOB = '2025-10-04';

    public function test_is_infant_from_birth_through_12_completed_months(): void
    {
        $this->assertTrue(Patient::isInfantBirthdate(self::DOB, self::DOB));
        $this->assertTrue(Patient::isInfantBirthdate(self::DOB, $this->daysAfterMonths(12)));
        $this->assertTrue(Patient::isInfantBirthdate(self::DOB, $this->daysAfterMonths(13, -1)));
    }

    public function test_is_not_infant_at_13_completed_months(): void
    {
        $this->assertFalse(Patient::isInfantBirthdate(self::DOB, $this->daysAfterMonths(13)));
    }

    public function test_is_not_infant_for_missing_invalid_or_future_birth_dates(): void
    {
        $today = $this->daysAfterMonths(1);
        $this->assertFalse(Patient::isInfantBirthdate('', $today));
        $this->assertFalse(Patient::isInfantBirthdate(null, $today));
        $this->assertFalse(Patient::isInfantBirthdate('not a date', $today));
        $this->assertFalse(Patient::isInfantBirthdate(self::DOB, $this->daysAfterMonths(0, -1)));
    }

    public function test_completed_months_matches_calendar_arithmetic_not_carbon_float(): void
    {
        $this->assertSame(12, Patient::completedMonths(self::DOB, $this->daysAfterMonths(12)));
        $this->assertSame(12, Patient::completedMonths(self::DOB, $this->daysAfterMonths(13, -1)));
        $this->assertSame(13, Patient::completedMonths(self::DOB, $this->daysAfterMonths(13)));
    }

    private function daysAfterMonths(int $months, int $days = 0): string
    {
        return Carbon::parse(self::DOB)->addMonthsNoOverflow($months)->addDays($days)->toDateString();
    }
}
