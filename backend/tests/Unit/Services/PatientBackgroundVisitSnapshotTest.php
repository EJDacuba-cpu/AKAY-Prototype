<?php

namespace Tests\Unit\Services;

use App\Models\Patient;
use App\Services\PatientBackground;
use Tests\TestCase;

class PatientBackgroundVisitSnapshotTest extends TestCase
{
    public function test_prenatal_and_mixed_visits_include_obstetric_history(): void
    {
        $this->assertTrue(PatientBackground::visitIncludesMaternal([
            'category' => 'Maternal',
        ]));
        $this->assertTrue(PatientBackground::visitIncludesMaternal([
            'category' => 'General Consultation',
            'monitoring_data' => ['selectedPrograms' => ['Maternal', 'EPI']],
        ]));
        $this->assertTrue(PatientBackground::visitIncludesMaternal([
            'category' => 'General Consultation',
            'selectedPrograms' => ['Maternal'],
        ]));
        $this->assertTrue(PatientBackground::visitIncludesMaternal([
            'category' => 'General Consultation',
            'monitoring_data' => ['visitPurpose' => ['services' => ['General', 'Prenatal']]],
        ]));
        $this->assertFalse(PatientBackground::visitIncludesMaternal([
            'category' => 'General Consultation',
            'monitoring_data' => ['selectedPrograms' => ['EPI']],
        ]));
        $this->assertFalse(PatientBackground::visitIncludesMaternal([
            'category' => 'Maternal',
            'monitoring_data' => ['visitPurpose' => ['services' => ['Postpartum']]],
        ]));
    }

    public function test_snapshot_freezes_patient_reported_slices_without_chart_metadata(): void
    {
        $patient = new Patient([
            'medical_background' => [
                'allergies' => ['items' => [['allergen' => 'Dust']]],
                'familyHistory' => ['noneKnown' => true],
                'personalSocial' => ['smoking' => ['status' => 'never']],
                'obstetric' => ['menarcheAge' => 13],
                'revisions' => ['medical' => 2],
                'updatedAt' => ['medical' => '2026-01-01'],
            ],
        ]);

        $general = PatientBackground::visitSnapshot($patient, [], false);
        $this->assertSame(['items' => [['allergen' => 'Dust']]], $general['sections']['medical']['allergies']);
        $this->assertSame(['currentDiseases', 'allergies', 'hospitalizations'], array_keys($general['sections']['medical']));
        $this->assertArrayNotHasKey('obstetric', $general['sections']);
        $this->assertArrayNotHasKey('revisions', $general['sections']['medical']);
        $this->assertSame([], $general['changes']);

        $prenatal = PatientBackground::visitSnapshot($patient, [['section' => 'family']], true);
        $this->assertSame(13, $prenatal['sections']['obstetric']['obstetric']['menarcheAge']);
        $this->assertCount(1, $prenatal['changes']);
    }
}
