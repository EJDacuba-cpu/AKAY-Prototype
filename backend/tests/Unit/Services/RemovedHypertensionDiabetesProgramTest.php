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
        // Neither the old Hypertension / Diabetes programs nor the retired
        // NCD Monitoring pathway may come back as a classification.
        $this->assertSame(['Maternal', 'Family Planning', 'EPI'], array_keys(ConsultationPrograms::CLASSIFICATIONS));
        $this->assertSame(['General', 'Prenatal', 'Postpartum', 'EPI', 'Family Planning', 'TB'], VisitPurpose::SERVICES);
        $this->assertNotContains('Hypertension / Diabetic Monitoring', HealthRecordDraftRequest::CLASSIFICATIONS);
        $this->assertNotContains('NCD Monitoring', HealthRecordDraftRequest::CLASSIFICATIONS);
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

    public function test_ncd_is_rejected_as_a_program(): void
    {
        $validator = Validator::make(
            ['monitoring_data' => ['selectedPrograms' => ['NCD'], 'primaryProgram' => 'NCD']],
            ConsultationPrograms::rules('monitoring_data')
        );
        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('monitoring_data.selectedPrograms.0', $validator->errors()->toArray());
    }

    public function test_remaining_programs_still_validate(): void
    {
        $validator = Validator::make(
            ['monitoring_data' => ['selectedPrograms' => ['Maternal', 'Family Planning', 'EPI'], 'primaryProgram' => 'Maternal']],
            ConsultationPrograms::rules('monitoring_data')
        );
        $this->assertFalse($validator->fails());
    }

    public function test_draft_with_the_removed_blob_is_rejected(): void
    {
        $this->expectException(ValidationException::class);

        (new HealthRecordDraftPayloadService)->sanitize(['hypertensionDiabeticData' => ['bp' => '120/80']]);
    }

    public function test_legacy_tb_program_is_dropped_from_old_drafts_on_read(): void
    {
        $service = new HealthRecordDraftPayloadService;

        $both = $service->sanitize(['selectedPrograms' => ['Maternal', 'TB'], 'primaryProgram' => 'TB', 'tbData' => ['diagnosis' => ['tbCaseNumber' => 'TB-9']]]);
        $this->assertSame(['Maternal'], $both['selectedPrograms']);
        $this->assertSame('Maternal', $both['primaryProgram']);
        $this->assertSame('TB-9', $both['tbData']['diagnosis']['tbCaseNumber']);

        $only = $service->sanitize(['selectedPrograms' => ['TB'], 'primaryProgram' => 'TB']);
        $this->assertSame([], $only['selectedPrograms']);
        $this->assertSame('', $only['primaryProgram']);

        $clean = $service->sanitize(['selectedPrograms' => ['Maternal', 'EPI'], 'primaryProgram' => 'EPI']);
        $this->assertSame(['Maternal', 'EPI'], $clean['selectedPrograms']);
        $this->assertSame('EPI', $clean['primaryProgram']);
    }
}
