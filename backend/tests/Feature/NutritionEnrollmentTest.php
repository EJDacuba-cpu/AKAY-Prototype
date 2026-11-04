<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\NutritionCareClosure;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\FacilityAccessService;
use App\Services\NutritionEnrollment;
use App\Services\StaffRoles;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NutritionEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Nutrition RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Nutrition BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        Carbon::setTestNow(Carbon::parse('2026-11-05 08:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => 'Nutrition',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            ...$attributes,
        ]);
    }

    private function encoder(): User
    {
        return User::create([
            'name' => 'Nutrition Encoder',
            'email' => uniqid('nutrition', true).'@example.test',
            'password' => 'password123',
            'status' => User::STATUS_ACTIVE,
            'role' => User::ROLE_BHC,
            'staff_role' => 'encoder',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('encoder'),
        ]);
    }

    private function clinician(array $attributes = []): User
    {
        return User::create([
            'name' => 'Nutrition Midwife',
            'email' => uniqid('midwife', true).'@example.test',
            'password' => 'password123',
            'status' => User::STATUS_ACTIVE,
            'role' => User::ROLE_BHC,
            'staff_role' => 'midwife',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('midwife'),
            ...$attributes,
        ]);
    }

    private function enroll(Patient $patient, array $overrides = []): HealthRecord
    {
        return $this->record($patient, [
            'category' => 'Nutrition',
            'date_recorded' => '2026-10-01 09:00:00',
            'created_at' => '2026-10-01 09:00:00',
            'monitoring_data' => [
                'selectedPrograms' => ['Nutrition'],
                'nutritionIntent' => NutritionEnrollment::INTENT_ENROLL,
            ],
            'vital_signs' => ['weight' => 70, 'height' => 170],
            'finalized_at' => '2026-10-01 09:30:00',
            ...$overrides,
        ]);
    }

    private function closeCare(Patient $patient, array $payload = []): TestResponse
    {
        return $this->postJson("/api/patients/{$patient->id}/nutrition-care/close", array_merge([
            'reason' => 'goals_met',
            'closed_on' => '2026-10-01',
            'note' => 'Goals met',
        ], $payload));
    }

    private function record(Patient $patient, array $overrides = []): HealthRecord
    {
        $createdAt = $overrides['created_at'] ?? null;
        unset($overrides['created_at']);

        $record = HealthRecord::create([
            'patient_id' => $patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $this->bhc->id,
            'date_recorded' => '2026-10-01 09:00:00',
            'monitoring_data' => [],
            'vital_signs' => [],
            'finalized_at' => '2026-10-01 09:00:00',
            ...$overrides,
        ]);

        if ($createdAt !== null) {
            $record->forceFill([
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ])->save();
        }

        return $record->refresh();
    }

    /**
     * @return array<int, string>
     */
    private function intentErrors(int $patientId, mixed $intent): array
    {
        $validator = Validator::make([], []);
        NutritionEnrollment::validateIntent($validator, $patientId, $intent);

        return $validator->errors()->get('monitoring_data.nutritionIntent');
    }

    public function test_no_nutrition_records_means_not_enrolled(): void
    {
        $patient = $this->patient();
        $general = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-09-01 09:00:00',
            'vital_signs' => ['weight' => 70, 'height' => 170],
            'monitoring_data' => ['selectedPrograms' => ['Maternal']],
        ]);

        $this->assertFalse(NutritionEnrollment::isNutritionRecord($general));
        $this->assertSame(
            ['goals_met', 'transferred', 'lost_to_follow_up', 'other'],
            NutritionEnrollment::CLOSE_REASONS
        );

        $state = NutritionEnrollment::stateFor($patient->id);

        $this->assertSame(NutritionEnrollment::STATUS_NOT_ENROLLED, $state['status']);
        $this->assertFalse($state['enrolled']);
        $this->assertNull($state['latest']);
        $this->assertNull($state['active']);
        $this->assertSame([], $state['episodes']);
        $this->assertNull(NutritionEnrollment::active($patient));

        $summary = NutritionEnrollment::summary($patient);
        $this->assertSame(NutritionEnrollment::STATUS_NOT_ENROLLED, $summary['status']);
        $this->assertFalse($summary['enrolled']);
        $this->assertNull($summary['enrolled_on']);
        $this->assertNull($summary['latest_weight_kg']);
        $this->assertNull($summary['latest_height_cm']);
        $this->assertNull($summary['latest_bmi']);
        $this->assertNull($summary['latest_bmi_category']);
        $this->assertSame([], $summary['measurement_history']);
        $this->assertSame([], $summary['closures']);

        $this->assertSame([], $this->intentErrors($patient->id, NutritionEnrollment::INTENT_ENROLL));
        $this->assertNotEmpty($this->intentErrors($patient->id, NutritionEnrollment::INTENT_CONTINUE));
        $this->assertNotEmpty($this->intentErrors($patient->id, 'pause'));
        $this->assertNotEmpty($this->intentErrors($patient->id, null));
    }

    public function test_finalized_nutrition_record_activates_enrollment(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $record = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-01 09:00:00',
            'created_at' => '2026-10-01 09:00:00',
            'monitoring_data' => [
                'selectedPrograms' => ['Nutrition'],
                'nutritionIntent' => NutritionEnrollment::INTENT_ENROLL,
            ],
            'vital_signs' => ['weight' => '70 kg', 'height' => 170],
            'finalized_at' => '2026-10-01 09:30:00',
        ]);

        $this->assertTrue(NutritionEnrollment::isNutritionRecord($record));
        $this->assertSame(NutritionEnrollment::INTENT_ENROLL, $record->monitoring_data['nutritionIntent']);

        $state = NutritionEnrollment::stateFor($patient->id);
        $this->assertSame(NutritionEnrollment::STATUS_ACTIVE, $state['status']);
        $this->assertTrue($state['enrolled']);
        $this->assertSame($record->id, $state['latest']?->id);
        $this->assertSame($record->id, $state['active']['started_record_id'] ?? null);
        $this->assertCount(1, $state['episodes']);
        $this->assertSame($record->id, $state['episodes'][0]['started_record_id']);
        $this->assertSame('2026-10-01', $state['episodes'][0]['started_on']);
        $this->assertSame([$record->id], $state['episodes'][0]['record_ids']);
        $this->assertSame(NutritionEnrollment::STATUS_ACTIVE, $state['episodes'][0]['status']);
        $this->assertNull($state['episodes'][0]['closure']);
        $this->assertSame($record->id, NutritionEnrollment::active($patient)['started_record_id'] ?? null);

        $summary = NutritionEnrollment::summary($patient);
        $this->assertTrue($summary['enrolled']);
        $this->assertSame('2026-10-01', $summary['enrolled_on']);
        $this->assertEquals(70, $summary['latest_weight_kg']);
        $this->assertEquals(170, $summary['latest_height_cm']);
        $this->assertEqualsWithDelta(70 / (1.7 ** 2), $summary['latest_bmi'], 0.0001);
        $this->assertSame('Normal', $summary['latest_bmi_category']);
        $this->assertCount(1, $summary['measurement_history']);
        $this->assertSame($record->id, $summary['measurement_history'][0]['health_record_id']);

        $this->assertNotEmpty($this->intentErrors($patient->id, NutritionEnrollment::INTENT_ENROLL));
        $this->assertSame([], $this->intentErrors($patient->id, NutritionEnrollment::INTENT_CONTINUE));

        $byCategory = $this->patient(['birthdate' => '2021-01-15']);
        $categoryRecord = $this->record($byCategory, [
            'category' => 'Nutrition',
            'monitoring_data' => ['selectedPrograms' => []],
            'vital_signs' => ['weight' => 18, 'height' => 110],
            'finalized_at' => now(),
        ]);
        $this->assertTrue(NutritionEnrollment::isNutritionRecord($categoryRecord));
        $child = NutritionEnrollment::summary($byCategory);
        $this->assertSame(NutritionEnrollment::STATUS_ACTIVE, $child['status']);
        $this->assertNotNull($child['latest_bmi']);
        $this->assertNull($child['latest_bmi_category']);
    }

    public function test_care_overview_exposes_nutrition_care(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $this->record($patient, [
            'category' => 'Nutrition',
            'date_recorded' => '2026-10-01 09:00:00',
            'monitoring_data' => [
                'selectedPrograms' => ['Nutrition'],
                'nutritionIntent' => NutritionEnrollment::INTENT_ENROLL,
            ],
            'vital_signs' => ['weight' => 70, 'height' => 170],
            'finalized_at' => '2026-10-01 09:30:00',
        ]);

        Sanctum::actingAs($this->encoder(), ['akay:access']);

        $response = $this->getJson("/api/patients/{$patient->id}/care-overview")->assertOk();
        $response->assertJsonPath('data.nutrition_care.status', NutritionEnrollment::STATUS_ACTIVE);
        $response->assertJsonPath('data.nutrition_care.enrolled', true);
        $response->assertJsonPath('data.nutrition_care.enrolled_on', '2026-10-01');
        $response->assertJsonPath('data.nutrition_care.latest_bmi_category', 'Normal');
        $this->assertEquals(
            NutritionEnrollment::summary($patient),
            $response->json('data.nutrition_care')
        );
        $this->assertContains('nutrition_care', array_keys($response->json('data')));
    }

    public function test_measurements_from_later_general_visit_appear_in_history(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $nutrition = $this->record($patient, [
            'category' => 'Nutrition',
            'date_recorded' => '2026-10-01 09:00:00',
            'created_at' => '2026-10-01 09:00:00',
            'monitoring_data' => ['selectedPrograms' => ['Nutrition']],
            'vital_signs' => ['weight' => 70, 'height' => 170],
        ]);
        $before = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-09-01 08:00:00',
            'created_at' => '2026-09-01 08:00:00',
            'vital_signs' => ['weight' => 90, 'height' => 180],
        ]);
        $weightOnly = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-10 08:00:00',
            'created_at' => '2026-10-10 08:00:00',
            'vital_signs' => ['weight' => 80],
        ]);
        $general = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-20 08:00:00',
            'created_at' => '2026-10-20 08:00:00',
            'monitoring_data' => ['selectedPrograms' => []],
            'vital_signs' => ['weight' => '68', 'height' => '165'],
        ]);
        $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-15 08:00:00',
            'created_at' => '2026-10-15 08:00:00',
            'vital_signs' => ['weight' => '', 'height' => null, 'temperature' => 36.5],
        ]);

        $summary = NutritionEnrollment::summary($patient);
        $history = $summary['measurement_history'];
        $ids = array_column($history, 'health_record_id');

        $this->assertSame([$nutrition->id, $weightOnly->id, $general->id], $ids);
        $this->assertNotContains($before->id, $ids);
        $this->assertSame($ids, array_values(array_unique($ids)));
        $this->assertSame(
            ['health_record_id', 'date_recorded', 'weight_kg', 'height_cm', 'bmi'],
            array_keys($history[0])
        );
        $this->assertSame('2026-10-01', $history[0]['date_recorded']);
        $this->assertEquals(70, $history[0]['weight_kg']);
        $this->assertEquals(170, $history[0]['height_cm']);
        $this->assertEqualsWithDelta(70 / (1.7 ** 2), $history[0]['bmi'], 0.0001);
        $this->assertEquals(80, $history[1]['weight_kg']);
        $this->assertNull($history[1]['height_cm']);
        $this->assertNull($history[1]['bmi']);
        $this->assertSame('2026-10-20', $history[2]['date_recorded']);
        $this->assertEquals(68, $summary['latest_weight_kg']);
        $this->assertEquals(165, $summary['latest_height_cm']);
        $this->assertEqualsWithDelta(68 / (1.65 ** 2), $summary['latest_bmi'], 0.0001);
        $this->assertSame('Normal', $summary['latest_bmi_category']);
        $this->assertSame(NutritionEnrollment::STATUS_ACTIVE, $summary['status']);

        $laterWeightOnly = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-25 08:00:00',
            'vital_signs' => ['weight' => 90],
        ]);
        $paired = NutritionEnrollment::summary($patient);
        $this->assertSame(
            [$nutrition->id, $weightOnly->id, $general->id, $laterWeightOnly->id],
            array_column($paired['measurement_history'], 'health_record_id')
        );
        $this->assertEquals(90, $paired['latest_weight_kg']);
        $this->assertEquals(165, $paired['latest_height_cm']);
        $this->assertEqualsWithDelta(68 / (1.65 ** 2), $paired['latest_bmi'], 0.0001);
        $this->assertSame('Normal', $paired['latest_bmi_category']);
    }

    public function test_closure_ends_active_and_later_nutrition_record_starts_new_episode(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $staff = $this->encoder();
        $first = $this->record($patient, [
            'category' => 'Nutrition',
            'date_recorded' => '2026-09-01 09:00:00',
            'created_at' => '2026-09-01 09:00:00',
            'monitoring_data' => ['selectedPrograms' => ['Nutrition'], 'nutritionIntent' => 'enroll'],
            'vital_signs' => ['weight' => 60, 'height' => 160],
        ]);
        $continued = $this->record($patient, [
            'category' => 'Nutrition',
            'date_recorded' => '2026-09-15 09:00:00',
            'created_at' => '2026-09-15 09:00:00',
            'monitoring_data' => ['selectedPrograms' => ['Nutrition'], 'nutritionIntent' => 'continue'],
            'vital_signs' => ['weight' => 61, 'height' => 160],
        ]);
        $duringFirst = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-09-20 09:00:00',
            'created_at' => '2026-09-20 09:00:00',
            'vital_signs' => ['weight' => 62, 'height' => 160],
        ]);

        $this->assertTrue(NutritionEnrollment::stateFor($patient->id)['enrolled']);

        $closure = NutritionCareClosure::create([
            'patient_id' => $patient->id,
            'started_health_record_id' => $first->id,
            'reason' => 'goals_met',
            'closed_on' => '2026-10-01',
            'note' => 'Goals met',
            'closed_by' => $staff->id,
        ]);
        $closure->forceFill([
            'created_at' => '2026-10-01 10:00:00',
            'updated_at' => '2026-10-01 10:00:00',
        ])->save();

        $closed = NutritionEnrollment::stateFor($patient->id);
        $this->assertSame(NutritionEnrollment::STATUS_CLOSED, $closed['status']);
        $this->assertFalse($closed['enrolled']);
        $this->assertNull($closed['active']);
        $this->assertNull(NutritionEnrollment::active($patient));
        $this->assertCount(1, $closed['episodes']);
        $this->assertSame([$first->id, $continued->id], $closed['episodes'][0]['record_ids']);
        $this->assertSame(NutritionEnrollment::STATUS_CLOSED, $closed['episodes'][0]['status']);
        $this->assertSame($closure->id, $closed['episodes'][0]['closure']?->id);
        $this->assertSame($continued->id, $closed['latest']?->id);
        $this->assertNotEmpty($this->intentErrors($patient->id, NutritionEnrollment::INTENT_CONTINUE));
        $this->assertSame([], $this->intentErrors($patient->id, NutritionEnrollment::INTENT_ENROLL));

        $closedSummary = NutritionEnrollment::summary($patient);
        $this->assertSame(NutritionEnrollment::STATUS_CLOSED, $closedSummary['status']);
        $this->assertFalse($closedSummary['enrolled']);
        $this->assertNull($closedSummary['enrolled_on']);
        $this->assertSame([$first->id, $continued->id, $duringFirst->id], array_column($closedSummary['measurement_history'], 'health_record_id'));
        $this->assertSame('goals_met', $closedSummary['closures'][0]['reason']);
        $this->assertSame('2026-10-01', $closedSummary['closures'][0]['closed_on']);
        $this->assertSame('Goals met', $closedSummary['closures'][0]['note']);
        $this->assertSame('Nutrition Encoder', $closedSummary['closures'][0]['closed_by_name']);
        $this->assertSame($first->id, $closedSummary['closures'][0]['started_health_record_id']);
        $this->assertSame('2026-09-01', $closedSummary['closures'][0]['enrolled_on']);

        $reopened = $this->record($patient, [
            'category' => 'Nutrition',
            'date_recorded' => '2026-10-01 15:00:00',
            'created_at' => '2026-10-01 15:00:00',
            'monitoring_data' => ['selectedPrograms' => ['Nutrition'], 'nutritionIntent' => 'enroll'],
            'vital_signs' => ['weight' => 63, 'height' => 161],
        ]);
        $laterGeneral = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-02 09:00:00',
            'created_at' => '2026-10-02 09:00:00',
            'vital_signs' => ['weight' => 64, 'height' => 161],
        ]);

        $state = NutritionEnrollment::stateFor($patient->id);
        $this->assertSame(NutritionEnrollment::STATUS_ACTIVE, $state['status']);
        $this->assertTrue($state['enrolled']);
        $this->assertCount(2, $state['episodes']);
        $this->assertSame(NutritionEnrollment::STATUS_CLOSED, $state['episodes'][0]['status']);
        $this->assertSame([$first->id, $continued->id], $state['episodes'][0]['record_ids']);
        $this->assertSame($reopened->id, $state['episodes'][1]['started_record_id']);
        $this->assertSame('2026-10-01', $state['episodes'][1]['started_on']);
        $this->assertSame([$reopened->id], $state['episodes'][1]['record_ids']);
        $this->assertSame(NutritionEnrollment::STATUS_ACTIVE, $state['episodes'][1]['status']);
        $this->assertNull($state['episodes'][1]['closure']);
        $this->assertSame($reopened->id, $state['active']['started_record_id'] ?? null);
        $this->assertSame($reopened->id, $state['latest']?->id);

        $summary = NutritionEnrollment::summary($patient);
        $this->assertSame('2026-10-01', $summary['enrolled_on']);
        $this->assertSame(
            [$reopened->id, $laterGeneral->id],
            array_column($summary['measurement_history'], 'health_record_id')
        );
        $this->assertNotContains($duringFirst->id, array_column($summary['measurement_history'], 'health_record_id'));
        $this->assertCount(1, $summary['closures']);
        $this->assertNotEmpty($this->intentErrors($patient->id, NutritionEnrollment::INTENT_ENROLL));
        $this->assertSame([], $this->intentErrors($patient->id, NutritionEnrollment::INTENT_CONTINUE));
    }

    public function test_unfinalized_records_do_not_enroll_or_enter_measurement_history(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $draftNutrition = $this->record($patient, [
            'category' => 'Nutrition',
            'date_recorded' => '2026-10-01 09:00:00',
            'monitoring_data' => [
                'selectedPrograms' => ['Nutrition'],
                'nutritionIntent' => NutritionEnrollment::INTENT_ENROLL,
            ],
            'vital_signs' => ['weight' => 70, 'height' => 170],
            'finalized_at' => null,
        ]);

        $state = NutritionEnrollment::stateFor($patient->id);
        $this->assertSame(NutritionEnrollment::STATUS_NOT_ENROLLED, $state['status']);
        $this->assertFalse($state['enrolled']);
        $this->assertNull($state['latest']);
        $this->assertNull($state['active']);
        $this->assertSame([], $state['episodes']);

        $beforeFinalize = NutritionEnrollment::summary($patient);
        $this->assertSame([], $beforeFinalize['measurement_history']);
        $this->assertNull($beforeFinalize['latest_weight_kg']);
        $this->assertNull($beforeFinalize['latest_height_cm']);
        $this->assertNull($beforeFinalize['latest_bmi']);

        $finalized = $this->record($patient, [
            'category' => 'Nutrition',
            'date_recorded' => '2026-10-05 09:00:00',
            'monitoring_data' => ['selectedPrograms' => ['Nutrition']],
            'vital_signs' => ['weight' => 71, 'height' => 171],
            'finalized_at' => '2026-10-05 09:30:00',
        ]);
        $draftVitals = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-20 09:00:00',
            'vital_signs' => ['weight' => 90, 'height' => 180],
            'finalized_at' => null,
        ]);

        $summary = NutritionEnrollment::summary($patient);
        $ids = array_column($summary['measurement_history'], 'health_record_id');
        $this->assertSame([$finalized->id], $ids);
        $this->assertNotContains($draftNutrition->id, $ids);
        $this->assertNotContains($draftVitals->id, $ids);
        $this->assertTrue($summary['enrolled']);
        $this->assertEquals(71, $summary['latest_weight_kg']);
        $this->assertEquals(171, $summary['latest_height_cm']);
    }

    public function test_closing_the_active_enrollment(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $started = $this->enroll($patient);
        $during = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-01 15:00:00',
            'created_at' => '2026-10-01 15:00:00',
            'vital_signs' => ['weight' => 69, 'height' => 170],
        ]);
        $afterClose = $this->record($patient, [
            'category' => 'General Consultation',
            'date_recorded' => '2026-10-20 09:00:00',
            'created_at' => '2026-10-20 09:00:00',
            'vital_signs' => ['weight' => 80, 'height' => 170],
        ]);
        $clinician = $this->clinician();
        Sanctum::actingAs($clinician, ['akay:access']);

        $note = str_repeat('n', 500);
        $response = $this->closeCare($patient, [
            'reason' => 'lost_to_follow_up',
            'closed_on' => '2026-10-01',
            'note' => $note,
        ])->assertCreated();

        $summary = NutritionEnrollment::summary($patient);
        $this->assertEquals($summary, $response->json('data'));
        $this->assertSame(NutritionEnrollment::STATUS_CLOSED, $summary['status']);
        $this->assertFalse($summary['enrolled']);
        $this->assertNull($summary['enrolled_on']);
        $this->assertNull(NutritionEnrollment::active($patient));
        $this->assertSame('lost_to_follow_up', $summary['closures'][0]['reason']);
        $this->assertSame('2026-10-01', $summary['closures'][0]['closed_on']);
        $this->assertSame($note, $summary['closures'][0]['note']);
        $this->assertSame('Nutrition Midwife', $summary['closures'][0]['closed_by_name']);
        $this->assertSame($started->id, $summary['closures'][0]['started_health_record_id']);
        $this->assertSame('2026-10-01', $summary['closures'][0]['enrolled_on']);
        $this->assertSame(
            [$started->id, $during->id],
            array_column($summary['measurement_history'], 'health_record_id')
        );
        $this->assertNotContains($afterClose->id, array_column($summary['measurement_history'], 'health_record_id'));
        $this->assertDatabaseHas('nutrition_care_closures', [
            'patient_id' => $patient->id,
            'started_health_record_id' => $started->id,
            'reason' => 'lost_to_follow_up',
            'closed_by' => $clinician->id,
        ]);

        $again = $this->patient(['birthdate' => '1991-02-02']);
        $this->enroll($again);
        $withoutNote = $this->closeCare($again, ['reason' => 'transferred', 'note' => null])->assertCreated();
        $reopened = NutritionEnrollment::summary($again);
        $this->assertSame('transferred', $reopened['closures'][0]['reason']);
        $this->assertNull($reopened['closures'][0]['note']);
        $this->assertEquals($reopened, $withoutNote->json('data'));
    }

    public function test_closing_without_active_is_422(): void
    {
        $clinician = $this->clinician();
        Sanctum::actingAs($clinician, ['akay:access']);

        $never = $this->patient();
        $this->closeCare($never)
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This patient has no active Nutrition Care.');
        $this->assertSame(0, NutritionCareClosure::query()->where('patient_id', $never->id)->count());

        $draftOnly = $this->patient();
        $this->enroll($draftOnly, ['finalized_at' => null]);
        $this->closeCare($draftOnly)
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This patient has no active Nutrition Care.');

        $closed = $this->patient();
        $started = $this->enroll($closed);
        NutritionCareClosure::create([
            'patient_id' => $closed->id,
            'started_health_record_id' => $started->id,
            'reason' => 'goals_met',
            'closed_on' => '2026-10-01',
            'note' => 'Already closed',
            'closed_by' => $clinician->id,
        ]);
        $this->closeCare($closed, ['reason' => 'other'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This patient has no active Nutrition Care.');
        $this->assertSame(1, NutritionCareClosure::query()->where('patient_id', $closed->id)->count());
    }

    public function test_invalid_reason_or_dates_is_422(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $this->enroll($patient);
        Sanctum::actingAs($this->clinician(), ['akay:access']);

        $this->closeCare($patient, ['reason' => 'discharged'])->assertUnprocessable()->assertJsonValidationErrors(['reason']);
        $this->closeCare($patient, ['reason' => null])->assertUnprocessable()->assertJsonValidationErrors(['reason']);
        $this->closeCare($patient, ['closed_on' => '2026-11-06'])->assertUnprocessable()->assertJsonValidationErrors(['closed_on']);
        $this->closeCare($patient, ['closed_on' => '2026-09-30'])->assertUnprocessable()->assertJsonValidationErrors(['closed_on']);
        $this->closeCare($patient, ['closed_on' => null])->assertUnprocessable()->assertJsonValidationErrors(['closed_on']);
        $this->closeCare($patient, ['note' => str_repeat('n', 501)])->assertUnprocessable()->assertJsonValidationErrors(['note']);
        $this->assertSame(0, NutritionCareClosure::query()->where('patient_id', $patient->id)->count());
        $this->assertNotNull(NutritionEnrollment::active($patient));

        $this->closeCare($patient, ['closed_on' => '2026-11-05', 'reason' => 'other', 'note' => null])->assertCreated();
    }

    public function test_other_facility_cannot_close(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $this->enroll($patient);
        $other = BarangayHealthCenter::create([
            'name' => 'Other Nutrition BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
        Sanctum::actingAs($this->clinician([
            'name' => 'Outside Midwife',
            'barangay_health_center_id' => $other->id,
        ]), ['akay:access']);

        $this->closeCare($patient)
            ->assertForbidden()
            ->assertJsonPath('message', FacilityAccessService::DENIED_MESSAGE);
        $this->assertSame(0, NutritionCareClosure::query()->where('patient_id', $patient->id)->count());
        $this->assertNotNull(NutritionEnrollment::active($patient));
    }

    public function test_requires_consultations_finalize(): void
    {
        $patient = $this->patient(['birthdate' => '1990-01-15']);
        $this->enroll($patient);
        Sanctum::actingAs($this->encoder(), ['akay:access']);

        $this->closeCare($patient)
            ->assertForbidden()
            ->assertJsonPath('message', 'Your current facility assignment does not permit this action.');
        $this->assertSame(0, NutritionCareClosure::query()->where('patient_id', $patient->id)->count());
        $this->assertNotNull(NutritionEnrollment::active($patient));
    }
}
