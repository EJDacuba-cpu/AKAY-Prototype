<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The prenatal form's fields: fetal heart tone, a date for each laboratory
 * result, and the TT/Td dose given at this visit - saved in drafts, carried to
 * the official record, and validated on the way in.
 */
class PrenatalFormFieldsTest extends TestCase
{
    use RefreshDatabase;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Prenatal RHU']);
        $this->seedAvailableProvider($rhu);
        $bhc = BarangayHealthCenter::create([
            'name' => 'Prenatal BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Prenatal BHW',
            'email' => 'prenatal-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Prenatal',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
        ]);
    }

    public function test_draft_keeps_every_new_prenatal_field(): void
    {
        $publicId = $this->saveDraft($this->maternalData())
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->bhw, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertOk()
            ->assertJsonPath('data.payload.maternalData.fht', '140 bpm')
            ->assertJsonPath('data.payload.maternalData.laboratoryResults.hemoglobin', '11.5 g/dL')
            ->assertJsonPath('data.payload.maternalData.laboratoryResultDates.hemoglobin', '2026-09-10')
            ->assertJsonPath('data.payload.maternalData.laboratoryResultDates.urinalysis', '2026-09-12')
            ->assertJsonPath('data.payload.maternalData.immunizationThisVisit.type', 'tt2')
            ->assertJsonPath('data.payload.maternalData.immunizationThisVisit.doseStatus', 'Given')
            ->assertJsonPath('data.payload.maternalData.immunizationThisVisit.dateGiven', '2026-09-22')
            // The Risk Code D flag survives a draft now, beside its item.
            ->assertJsonPath('data.payload.maternalData.riskAssessment.previousCs', true)
            ->assertJsonPath('data.payload.maternalData.riskAssessment.previousPregnancyComplications', true);
    }

    public function test_draft_rejects_an_unknown_dose(): void
    {
        $data = $this->maternalData();
        $data['immunizationThisVisit']['type'] = 'tt9';

        $this->saveDraft($data)->assertStatus(422);
        $this->assertDatabaseCount('health_record_drafts', 0);
    }

    public function test_draft_still_rejects_unknown_prenatal_fields(): void
    {
        $data = $this->maternalData();
        $data['notAField'] = 'x';
        $this->saveDraft($data)->assertStatus(422);

        $data = $this->maternalData();
        $data['laboratoryResultDates']['bloodSugar'] = '2026-09-10';
        $this->saveDraft($data)->assertStatus(422);

        $this->assertDatabaseCount('health_record_drafts', 0);
    }

    public function test_a_draft_without_the_new_fields_still_saves(): void
    {
        $this->saveDraft(['lmp' => '2026-03-01', 'gravida' => '2'])->assertCreated();
    }

    public function test_official_record_keeps_the_new_prenatal_fields(): void
    {
        $recordId = $this->saveRecord([
            ...$this->maternalData(),
            // The dose given this visit, filed under its schedule by the form.
            'tetanusToxoidStatus' => ['tt1' => '2026-05-01', 'tt2' => '2026-09-22'],
        ])->assertCreated()->json('data.id');

        $maternal = json_decode(
            (string) DB::table('health_records')->where('id', $recordId)->value('maternal_data'),
            true
        );

        $this->assertSame('140 bpm', $maternal['fht']);
        $this->assertSame('2026-09-10', $maternal['laboratoryResultDates']['hemoglobin']);
        $this->assertSame('tt2', $maternal['immunizationThisVisit']['type']);
        $this->assertSame('2026-09-22', $maternal['immunizationThisVisit']['dateGiven']);
        // Earlier doses are kept; this visit's dose is added.
        $this->assertSame('2026-05-01', $maternal['tetanusToxoidStatus']['tt1']);
        $this->assertSame('2026-09-22', $maternal['tetanusToxoidStatus']['tt2']);
    }

    public function test_official_record_validates_the_new_prenatal_fields(): void
    {
        foreach ([
            ['immunizationThisVisit' => ['type' => 'tt9']],
            ['immunizationThisVisit' => ['type' => 'tt1', 'dateGiven' => 'not-a-date']],
            ['laboratoryResultDates' => ['hemoglobin' => 'not-a-date']],
            ['fht' => str_repeat('9', 101)],
        ] as $invalid) {
            $this->saveRecord($invalid)->assertStatus(422);
        }

        $this->assertDatabaseCount('health_records', 0);
    }

    private function maternalData(): array
    {
        return [
            'lmp' => '2026-03-01',
            'gravida' => '2',
            'para' => '1',
            'fht' => '140 bpm',
            'riskAssessment' => [
                'previousCs' => true,
                'previousPregnancyComplications' => true,
            ],
            'laboratoryResults' => ['hemoglobin' => '11.5 g/dL', 'urinalysis' => 'Normal'],
            'laboratoryResultDates' => ['hemoglobin' => '2026-09-10', 'urinalysis' => '2026-09-12'],
            'immunizationThisVisit' => [
                'type' => 'tt2',
                'doseStatus' => 'Given',
                'dateGiven' => '2026-09-22',
            ],
        ];
    }

    private function saveDraft(array $maternalData)
    {
        return $this->actingAs($this->bhw, 'sanctum')
            ->postJson('/api/health-record-drafts', [
                'patient_id' => $this->patient->id,
                'classification' => 'Maternal',
                'payload' => [
                    'chiefComplaint' => 'Prenatal visit.',
                    'maternalData' => $maternalData,
                ],
            ]);
    }

    private function saveRecord(array $maternalData)
    {
        return $this->actingAs($this->bhw, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'category' => 'Maternal',
                'chief_complaint' => 'Prenatal visit.',
                'maternal_data' => $maternalData,
            ]);
    }
}
