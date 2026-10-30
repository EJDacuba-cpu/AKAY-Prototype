<?php

namespace Tests\Unit\Services;

use App\Http\Requests\HealthRecordDraftRequest;
use App\Http\Requests\HealthRecordRequest;
use App\Services\ConsultationPrograms;
use App\Services\HealthRecordDraftPayloadService;
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

    public function test_legacy_visit_purpose_is_dropped_from_old_drafts_on_read(): void
    {
        $service = new HealthRecordDraftPayloadService;

        // Including a purpose the old rules would have rejected: the draft
        // still opens, without the purpose.
        foreach ([
            ['version' => 1, 'services' => ['General', 'Prenatal'], 'overrideReason' => '', 'pregnancyConfirmed' => 'No'],
            ['version' => 1, 'services' => ['Hypertension']],
        ] as $purpose) {
            $payload = $service->sanitize([
                'visitPurpose' => $purpose,
                'selectedPrograms' => ['Maternal'],
                'primaryProgram' => 'Maternal',
                'chiefComplaint' => 'Cough',
            ]);

            $this->assertArrayNotHasKey('visitPurpose', $payload);
            $this->assertSame(['Maternal'], $payload['selectedPrograms']);
            $this->assertSame('Cough', $payload['chiefComplaint']);
        }
    }

    public function test_new_health_records_do_not_store_a_visit_purpose(): void
    {
        $request = HealthRecordRequest::create('/api/health-records', 'POST', [
            'monitoring_data' => [
                'visitPurpose' => ['version' => 1, 'services' => ['Hypertension'], 'overrideReason' => 'x'],
                'selectedPrograms' => ['Maternal'],
                'primaryProgram' => 'Maternal',
            ],
        ]);

        (new \ReflectionMethod($request, 'prepareForValidation'))->invoke($request);

        $this->assertArrayNotHasKey('visitPurpose', $request->input('monitoring_data'));
        $this->assertSame(['Maternal'], $request->input('monitoring_data.selectedPrograms'));
        $this->assertSame('Maternal', $request->input('monitoring_data.primaryProgram'));
    }
}
