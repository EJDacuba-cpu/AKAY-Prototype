<?php

namespace Tests\Unit\Services;

use App\Services\ActionsTaken;
use PHPUnit\Framework\TestCase;

class ActionsTakenTest extends TestCase
{
    public function test_whitespace_only_text_is_not_documented(): void
    {
        $this->assertFalse(ActionsTaken::hasText(''));
        $this->assertFalse(ActionsTaken::hasText('   '));
        $this->assertFalse(ActionsTaken::hasText("\n\t"));
        $this->assertTrue(ActionsTaken::hasText('Wound care applied'));
        $this->assertTrue(ActionsTaken::hasText('Counseling provided'));
    }

    public function test_missing_actions_are_rejected(): void
    {
        $this->assertSame(
            ['treatment_notes' => ActionsTaken::REQUIRED_MESSAGE],
            ActionsTaken::errors(['treatment_notes' => ''])
        );
        $this->assertSame(
            ['treatment_notes' => ActionsTaken::REQUIRED_MESSAGE],
            ActionsTaken::errors(['treatment_notes' => '   '])
        );
    }

    public function test_clinical_actions_are_accepted(): void
    {
        $this->assertSame([], ActionsTaken::errors(['treatment_notes' => 'Wound care and counseling']));
        $this->assertSame([], ActionsTaken::errors(['treatment_notes' => 'Treatment given at BHC']));
    }

    public function test_medicines_and_structured_services_do_not_skip_actions_taken(): void
    {
        $this->assertSame(
            ['treatment_notes' => ActionsTaken::REQUIRED_MESSAGE],
            ActionsTaken::errors([
                'treatment_notes' => '',
                'dispensed_medicines' => [['medicine_id' => 12, 'quantity' => 1]],
            ])
        );
        $this->assertSame(
            ['treatment_notes' => ActionsTaken::REQUIRED_MESSAGE],
            ActionsTaken::errors([
                'treatment_notes' => '',
                'monitoring_data' => ['selectedPrograms' => ['Maternal']],
            ])
        );
        $this->assertSame([], ActionsTaken::errors([
            'treatment_notes' => 'Paracetamol given',
            'dispensed_medicines' => [['medicine_id' => 12, 'quantity' => 1]],
        ]));
    }

    public function test_a_no_intervention_selection_does_not_replace_actions_taken(): void
    {
        $this->assertSame(
            ['treatment_notes' => ActionsTaken::REQUIRED_MESSAGE],
            ActionsTaken::errors([
                'treatment_notes' => '',
                'monitoring_data' => [
                    'noInterventionPerformed' => true,
                    'noInterventionReason' => 'Patient declined treatment',
                ],
            ])
        );
    }
}
