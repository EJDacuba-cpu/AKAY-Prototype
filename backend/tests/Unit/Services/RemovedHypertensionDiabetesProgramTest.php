<?php

namespace Tests\Unit\Services;

use App\Http\Requests\HealthRecordDraftRequest;
use App\Services\ConsultationPrograms;
use App\Services\HealthRecordDraftPayloadService;
use App\Services\VisitPurpose;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class RemovedHypertensionDiabetesProgramTest extends TestCase
{
    public function test_remaining_programs_and_services_are_exact(): void
    {
        // NCD Monitoring is the redesigned successor (started from a diagnosis'
        // care-pathway suggestion, data in ncdData); the old keys stay gone.
        $this->assertSame(['Maternal', 'TB', 'Family Planning', 'EPI', 'NCD'], array_keys(ConsultationPrograms::CLASSIFICATIONS));
        $this->assertSame(['General', 'Prenatal', 'Postpartum', 'EPI', 'Family Planning', 'TB'], VisitPurpose::SERVICES);
        $this->assertNotContains('Hypertension / Diabetic Monitoring', HealthRecordDraftRequest::CLASSIFICATIONS);
    }

    public function test_hypertension_and_diabetes_are_rejected_as_programs(): void
    {
        foreach (['Hypertension', 'Diabetes'] as $program) {
            $validator = Validator::make(
                ['monitoring_data' => ['selectedPrograms' => [$program], 'primaryProgram' => $program]],
                ConsultationPrograms::rules('monitoring_data')
            );
            $this->assertTrue($validator->fails(), "$program should be rejected");
            $this->assertArrayHasKey('monitoring_data.selectedPrograms.0', $validator->errors()->toArray());
        }
    }

    public function test_hypertension_and_diabetes_are_rejected_as_visit_services(): void
    {
        foreach (['Hypertension', 'Diabetes'] as $service) {
            $validator = Validator::make(
                ['purpose' => ['version' => 1, 'services' => [$service]]],
                VisitPurpose::rules('purpose')
            );
            $this->assertTrue($validator->fails(), "$service should be rejected");
        }
    }

    public function test_remaining_programs_still_validate(): void
    {
        $validator = Validator::make(
            ['monitoring_data' => ['selectedPrograms' => ['Maternal', 'TB', 'Family Planning', 'EPI'], 'primaryProgram' => 'TB']],
            ConsultationPrograms::rules('monitoring_data')
        );
        $this->assertFalse($validator->fails());
    }

    public function test_draft_with_the_removed_blob_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        (new HealthRecordDraftPayloadService)->sanitize(['hypertensionDiabeticData' => ['bp' => '120/80']]);
    }
}
