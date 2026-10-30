<?php

namespace Tests\Unit\Services;

use App\Services\VitalSigns;
use PHPUnit\Framework\TestCase;

class VitalSignsTest extends TestCase
{
    public function test_blank_optional_vitals_are_valid(): void
    {
        $this->assertSame([], VitalSigns::errors([]));
        $this->assertSame([], VitalSigns::errors(['vital_signs' => []]));
        $this->assertSame([], VitalSigns::errors(['vital_signs' => [
            'systolicBp' => '',
            'diastolicBp' => null,
            'pulse' => '  ',
            'temperature' => '',
        ]]));
    }

    public function test_unusual_clinical_values_pass_encoding_ceilings(): void
    {
        $this->assertSame([], VitalSigns::errors(['vital_signs' => [
            'systolicBp' => 60,
            'diastolicBp' => 30,
            'pulse' => 220,
            'spo2' => 0,
            'temperature' => 42,
            'weight' => 0.5,
            'height' => 40,
            'fbs' => 1000,
        ]]));
    }

    public function test_encoding_errors_reject_impossible_typed_values(): void
    {
        $this->assertSame(
            ['vital_signs.temperature' => VitalSigns::TEMP_MESSAGE],
            VitalSigns::errors(['vital_signs' => ['temperature' => 123]])
        );
        $this->assertSame(
            ['vital_signs.pulse' => VitalSigns::PULSE_MESSAGE],
            VitalSigns::errors(['vital_signs' => ['pulse' => 3123]])
        );
        $this->assertSame(
            ['vital_signs.weight' => VitalSigns::WEIGHT_MESSAGE],
            VitalSigns::errors(['vital_signs' => ['weight' => 0]])
        );
        $this->assertSame(
            ['vital_signs.height' => VitalSigns::HEIGHT_MESSAGE],
            VitalSigns::errors(['vital_signs' => ['height' => 251]])
        );
    }

    public function test_an_incomplete_blood_pressure_pair_is_rejected(): void
    {
        $this->assertSame(
            [
                'vital_signs.systolicBp' => VitalSigns::BP_PAIR_MESSAGE,
                'vital_signs.diastolicBp' => VitalSigns::BP_PAIR_MESSAGE,
            ],
            VitalSigns::errors(['vital_signs' => ['systolicBp' => 120]])
        );
        $this->assertSame([], VitalSigns::errors(['vital_signs' => [
            'systolicBp' => 120,
            'diastolicBp' => 80,
        ]]));
    }
}
