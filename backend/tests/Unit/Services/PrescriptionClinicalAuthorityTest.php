<?php

namespace Tests\Unit\Services;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\PrescriptionClinicalAuthority;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PrescriptionClinicalAuthorityTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Rx RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Rx BHC',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    public function test_rhu_doctor_with_condition_confirmation_can_authorize(): void
    {
        $doctor = $this->makeUser('doctor', ['clinical.history', 'consultations.finalize', 'conditions.confirm']);

        $this->assertTrue(PrescriptionClinicalAuthority::canAuthorize($doctor));
        PrescriptionClinicalAuthority::ensureCanAuthorize($doctor);
    }

    public function test_nurse_and_finalize_only_users_cannot_authorize(): void
    {
        $nurse = $this->makeUser('nurse', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $finalizeOnlyDoctor = $this->makeUser('doctor', ['clinical.history', 'consultations.encode', 'consultations.finalize']);
        $bhcDoctor = User::create([
            'name' => 'BHC Doctor',
            'email' => 'bhc-doctor@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'bhc',
            'staff_role' => 'doctor',
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => ['clinical.history', 'consultations.finalize', 'conditions.confirm'],
        ]);

        foreach ([null, $nurse, $finalizeOnlyDoctor, $bhcDoctor] as $user) {
            $this->assertFalse(PrescriptionClinicalAuthority::canAuthorize($user));
        }

        try {
            PrescriptionClinicalAuthority::ensureCanAuthorize($nurse);
            $this->fail('A nurse with finalize permission must not authorize structured prescriptions.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }

        try {
            PrescriptionClinicalAuthority::ensureCanAuthorize($finalizeOnlyDoctor);
            $this->fail('Finalize permission without condition confirmation must not authorize structured prescriptions.');
        } catch (HttpException $exception) {
            $this->assertSame(403, $exception->getStatusCode());
        }
    }

    public function test_attestation_hashes_ordered_clinical_fields(): void
    {
        $doctor = $this->makeUser('doctor', ['clinical.history', 'consultations.finalize', 'conditions.confirm']);
        $first = $this->prescription();
        $reordered = [
            'duration' => $first['duration'],
            'source' => $first['source'],
            'route' => $first['route'],
            'id' => $first['id'],
            'instructions' => $first['instructions'],
            'medicineName' => $first['medicineName'],
            'diagnosisIds' => $first['diagnosisIds'],
            'dose' => $first['dose'],
            'strength' => $first['strength'],
            'frequency' => $first['frequency'],
            'authorization' => ['physicianId' => 999, 'prescriptionHash' => 'forged'],
        ];
        $authority = new PrescriptionClinicalAuthority;

        $signed = $authority->attestation($doctor, [$first]);
        $same = $authority->attestation($doctor, [$reordered]);

        $this->assertSame($doctor->id, $signed['physicianId']);
        $this->assertSame($doctor->name, $signed['physicianName']);
        $this->assertSame($doctor->rural_health_unit_id, $signed['ruralHealthUnitId']);
        $this->assertNotSame('', $signed['authorizedAt']);
        $this->assertSame(64, strlen($signed['prescriptionHash']));
        $this->assertSame($signed['prescriptionHash'], $same['prescriptionHash']);
        $this->assertNotSame(
            $signed['prescriptionHash'],
            $authority->attestation($doctor, [[...$first, 'medicineName' => 'Amlodipine']])['prescriptionHash']
        );
        $this->assertNotSame(
            $signed['prescriptionHash'],
            $authority->attestation($doctor, [[...$first, 'diagnosisIds' => ['diag-dm', 'diag-htn']]])['prescriptionHash']
        );
        $second = $this->prescription(['id' => 'rx-2', 'medicineName' => 'Metformin', 'diagnosisIds' => ['diag-dm']]);
        $this->assertNotSame(
            $authority->attestation($doctor, [$first, $second])['prescriptionHash'],
            $authority->attestation($doctor, [$second, $first])['prescriptionHash']
        );
    }

    public function test_physician_finalizes_structured_prescriptions_with_attestation(): void
    {
        $doctor = $this->makeUser('doctor', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($doctor, $visit);
        $order = $this->prescription([
            'authorizedQuantity' => 14,
            'authorizedUnit' => 'tablets',
            'authorization' => ['physicianId' => 999, 'physicianName' => 'Forged', 'prescriptionHash' => 'nope'],
        ]);

        $id = $this->postRecord($doctor, $patient, $visit, $uuid, [
            'diagnoses' => [['id' => 'diag-htn', 'name' => 'Hypertension', 'nextAction' => 'none']],
            'prescription_text' => 'legacy line',
            'monitoring_data' => ['prescriptions' => [$order]],
        ])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $stored = $record->monitoring_data['prescriptions'][0];
        $clinical = $stored;
        unset($clinical['authorization']);
        $expected = (new PrescriptionClinicalAuthority)->attestation($doctor, [$clinical]);

        $this->assertSame('legacy line', $record->monitoring_data['prescriptionText']);
        $this->assertSame($doctor->id, $stored['authorization']['physicianId']);
        $this->assertSame($doctor->name, $stored['authorization']['physicianName']);
        $this->assertSame($this->rhu->id, $stored['authorization']['ruralHealthUnitId']);
        $this->assertSame($expected['prescriptionHash'], $stored['authorization']['prescriptionHash']);
        $this->assertSame($expected['prescriptionHash'], $record->monitoring_data['prescriptionAuthorization']['prescriptionHash']);
        $this->assertNotSame(999, $stored['authorization']['physicianId']);
        $this->assertSame(14, $stored['authorizedQuantity']);
        $this->assertSame('tablets', $stored['authorizedUnit']);
    }

    public function test_finalize_persists_only_hashed_clinical_fields(): void
    {
        $doctor = $this->makeUser('doctor', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($doctor, $visit);
        $order = $this->prescription([
            'authorizedQuantity' => 14,
            'authorizedUnit' => 'tablets',
            'tbCaseId' => '',
            'medicineId' => 88,
            'status' => 'pending',
            'clientNote' => 'not clinical',
            'authorization' => ['physicianId' => 999, 'prescriptionHash' => 'forged'],
        ]);

        $id = $this->postRecord($doctor, $patient, $visit, $uuid, [
            'diagnoses' => [['id' => 'diag-htn', 'name' => 'Hypertension', 'nextAction' => 'none']],
            'monitoring_data' => ['prescriptions' => [$order]],
        ])->assertCreated()->json('data.id');

        $stored = HealthRecord::findOrFail($id)->monitoring_data['prescriptions'][0];
        $keys = array_keys($stored);
        sort($keys);
        $this->assertSame([
            'authorization',
            'authorizedQuantity',
            'authorizedUnit',
            'diagnosisIds',
            'dose',
            'duration',
            'frequency',
            'id',
            'instructions',
            'medicineName',
            'route',
            'source',
            'strength',
        ], $keys);
        $this->assertSame(14, $stored['authorizedQuantity']);
        $this->assertSame('tablets', $stored['authorizedUnit']);
        $this->assertSame($doctor->id, $stored['authorization']['physicianId']);
        $this->assertArrayNotHasKey('medicineId', $stored);
        $this->assertArrayNotHasKey('status', $stored);
        $this->assertArrayNotHasKey('clientNote', $stored);
        $this->assertArrayNotHasKey('tbCaseId', $stored);

        $tb = (new PrescriptionClinicalAuthority)->applyToMonitoringData($doctor, [
            'prescriptions' => [$this->prescription([
                'id' => 'rx-tb',
                'source' => 'tb_form4b_ref',
                'tbCaseId' => 'case-9',
                'medicineId' => 3,
                'status' => 'active',
            ])],
        ])['prescriptions'][0];
        $this->assertSame('case-9', $tb['tbCaseId']);
        $this->assertArrayNotHasKey('medicineId', $tb);
        $this->assertArrayNotHasKey('status', $tb);
        $this->assertArrayNotHasKey('authorizedQuantity', $tb);
        $this->assertArrayNotHasKey('authorizedUnit', $tb);
    }

    public function test_unauthorized_writer_cannot_mint_attestation(): void
    {
        $nurse = $this->makeUser('nurse', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $order = $this->prescription([
            'medicineId' => 88,
            'authorization' => ['physicianId' => 999, 'prescriptionHash' => 'forged'],
        ]);
        $authority = new PrescriptionClinicalAuthority;

        $this->assertNull($authority->attestation($nurse, [$order]));

        $applied = $authority->applyToMonitoringData($nurse, [
            'followUpReason' => 'Recheck',
            'prescriptions' => [$order],
            'prescriptionAuthorization' => ['physicianId' => 999, 'prescriptionHash' => 'forged'],
        ]);

        $this->assertSame('Recheck', $applied['followUpReason']);
        $this->assertArrayNotHasKey('prescriptionAuthorization', $applied);
        $this->assertArrayNotHasKey('authorization', $applied['prescriptions'][0]);
        $this->assertSame('Losartan', $applied['prescriptions'][0]['medicineName']);
    }

    public function test_non_physician_cannot_finalize_structured_prescriptions(): void
    {
        $nurse = $this->makeUser('nurse', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($nurse, $visit);

        $this->postRecord($nurse, $patient, $visit, $uuid, [
            'diagnoses' => [['id' => 'diag-htn', 'name' => 'Hypertension', 'nextAction' => 'none']],
            'monitoring_data' => ['prescriptions' => [$this->prescription()]],
        ])->assertForbidden();

        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_empty_prescriptions_keep_existing_finalize_rules(): void
    {
        $nurse = $this->makeUser('nurse', ['clinical.history', 'consultations.encode', 'consultations.finalize']);

        foreach ([null, []] as $prescriptions) {
            $patient = $this->patient();
            $visit = $this->visit($patient);
            $uuid = $this->startVisit($nurse, $visit);
            $monitoring = [
                'followUpReason' => 'Recheck',
                'prescriptionAuthorization' => ['physicianId' => 999, 'prescriptionHash' => 'forged'],
            ];
            if ($prescriptions !== null) {
                $monitoring['prescriptions'] = $prescriptions;
            }

            $id = $this->postRecord($nurse, $patient, $visit, $uuid, [
                'diagnoses' => [['id' => 'diag-htn', 'name' => 'Hypertension', 'nextAction' => 'none']],
                'prescription_text' => 'Losartan 50mg once daily',
                'monitoring_data' => $monitoring,
            ])->assertCreated()->json('data.id');

            $record = HealthRecord::findOrFail($id);
            $this->assertSame('Losartan 50mg once daily', $record->monitoring_data['prescriptionText']);
            $this->assertArrayNotHasKey('prescriptionAuthorization', $record->monitoring_data);
        }
    }

    public function test_invalid_diagnosis_ids_are_rejected(): void
    {
        $doctor = $this->makeUser('doctor', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($doctor, $visit);
        $diagnoses = [['id' => 'diag-htn', 'name' => 'Hypertension', 'nextAction' => 'none']];

        foreach ([['Hypertension'], ['0'], []] as $diagnosisIds) {
            $this->postRecord($doctor, $patient, $visit, $uuid, [
                'diagnoses' => $diagnoses,
                'monitoring_data' => ['prescriptions' => [$this->prescription(['diagnosisIds' => $diagnosisIds])]],
            ])->assertUnprocessable()
                ->assertJsonValidationErrors('monitoring_data.prescriptions.0.diagnosisIds');
        }

        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_service_linked_prescriptions_finalize_without_diagnosis_ids(): void
    {
        $doctor = $this->makeUser('doctor', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($doctor, $visit);

        $id = $this->postRecord($doctor, $patient, $visit, $uuid, [
            'diagnoses' => [['id' => 'diag-htn', 'name' => 'Hypertension', 'nextAction' => 'none']],
            'monitoring_data' => ['prescriptions' => [$this->prescription([
                'diagnosisIds' => [],
                'serviceKeys' => ['Maternal', 'EPI', 'Family Planning'],
                'medicineName' => 'Ferrous Sulfate',
            ])]],
        ])->assertCreated()->json('data.id');

        $stored = HealthRecord::findOrFail($id)->monitoring_data['prescriptions'][0];
        $this->assertSame([], $stored['diagnosisIds']);
        $this->assertSame(['Maternal', 'EPI', 'Family Planning'], $stored['serviceKeys']);
        $this->assertSame('Ferrous Sulfate', $stored['medicineName']);
        $this->assertArrayHasKey('authorization', $stored);
    }

    public function test_authorized_quantity_without_unit_is_rejected(): void
    {
        $doctor = $this->makeUser('doctor', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($doctor, $visit);

        $this->postRecord($doctor, $patient, $visit, $uuid, [
            'diagnoses' => [['id' => 'diag-htn', 'name' => 'Hypertension', 'nextAction' => 'none']],
            'monitoring_data' => ['prescriptions' => [$this->prescription([
                'authorizedQuantity' => 14,
                'authorizedUnit' => '',
            ])]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('monitoring_data.prescriptions.0.authorizedUnit');

        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_tb_reference_requires_a_case_id_and_clinical_fields(): void
    {
        $doctor = $this->makeUser('doctor', ['clinical.history', 'consultations.encode', 'consultations.finalize', 'conditions.confirm']);
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($doctor, $visit);
        $diagnoses = [['id' => 'diag-htn', 'name' => 'Hypertension', 'nextAction' => 'none']];

        $this->postRecord($doctor, $patient, $visit, $uuid, [
            'diagnoses' => $diagnoses,
            'monitoring_data' => ['prescriptions' => [$this->prescription([
                'source' => 'tb_form4b_ref',
                'tbCaseId' => '',
            ])]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('monitoring_data.prescriptions.0.tbCaseId');

        $this->postRecord($doctor, $patient, $visit, $uuid, [
            'diagnoses' => $diagnoses,
            'monitoring_data' => ['prescriptions' => [$this->prescription(['medicineName' => ' '])]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('monitoring_data.prescriptions.0.medicineName');

        $this->postRecord($doctor, $patient, $visit, $uuid, [
            'diagnoses' => $diagnoses,
            'monitoring_data' => ['prescriptions' => [$this->prescription(['source' => 'inventory'])]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('monitoring_data.prescriptions.0.source');

        $this->assertDatabaseCount('health_records', 0);
    }

    private function makeUser(string $staffRole, array $permissions): User
    {
        return User::create([
            'name' => ucfirst($staffRole).' '.Str::random(4),
            'email' => Str::random(8).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => $staffRole,
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => $permissions,
        ]);
    }

    private function patient(): Patient
    {
        return Patient::create([
            'first_name' => 'Rx',
            'last_name' => Str::random(6),
            'sex' => 'Female',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    private function visit(Patient $patient): RhuVisitQueueEntry
    {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('rx-', true),
        ]);
    }

    private function startVisit(User $user, RhuVisitQueueEntry $visit): string
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this->postJson("/api/rhu-visits/{$visit->id}/start")
            ->assertOk()
            ->json('data.consultation_uuid');
    }

    private function postRecord(User $user, Patient $patient, RhuVisitQueueEntry $visit, string $uuid, array $overrides = [])
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'consultation_uuid' => $uuid,
                'rhu_visit_id' => $visit->id,
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Headache',
                ...$overrides,
            ]);
    }

    private function prescription(array $overrides = []): array
    {
        return [
            'id' => 'rx-1',
            'diagnosisIds' => ['diag-htn'],
            'medicineName' => 'Losartan',
            'strength' => '50 mg',
            'dose' => '1 tablet',
            'route' => 'Oral',
            'frequency' => 'Once daily',
            'duration' => '30 days',
            'instructions' => 'After breakfast',
            'source' => 'itr',
            ...$overrides,
        ];
    }
}
