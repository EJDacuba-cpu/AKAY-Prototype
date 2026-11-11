# Task 4 Review Package (post-fix)


## FILE: PrescriptionClinicalAuthority.php
```php
<?php

namespace App\Services;

use App\Models\User;

/** Structured prescription authority is narrower than consultations.finalize. */
final class PrescriptionClinicalAuthority
{
    public static function canAuthorize(?User $user): bool
    {
        return $user !== null
            && $user->isRhu()
            && $user->staff_role === 'doctor'
            && ActionPermissions::allows($user, 'conditions.confirm');
    }

    public static function ensureCanAuthorize(User $user): void
    {
        abort_unless(
            self::canAuthorize($user),
            403,
            'Only an RHU physician with condition-confirmation permission may authorize structured prescriptions.'
        );
        app(FacilityAccessService::class)->ensureValidFacilityAssignment($user);
    }

    /**
     * Per-collection attestation. The hash uses fixed clinical slots so key order
     * and a client-supplied authorization cannot change it. Users who fail
     * canAuthorize do not receive a stamp.
     *
     * @param  list<array<string, mixed>>  $prescriptions
     * @return array{physicianId: int|string|null, physicianName: string|null, ruralHealthUnitId: int|string|null, authorizedAt: string, prescriptionHash: string}|null
     */
    public function attestation(User $user, array $prescriptions): ?array
    {
        if (! self::canAuthorize($user)) {
            return null;
        }

        return [
            'physicianId' => $user->id,
            'physicianName' => $user->name,
            'ruralHealthUnitId' => $user->rural_health_unit_id,
            'authorizedAt' => now()->toISOString(),
            'prescriptionHash' => hash('sha256', json_encode(self::clinicalRows($prescriptions), JSON_THROW_ON_ERROR)),
        ];
    }

    /**
     * @param  array<string, mixed>  $monitoringData
     * @return array<string, mixed>
     */
    public function applyToMonitoringData(User $user, array $monitoringData): array
    {
        $prescriptions = $monitoringData['prescriptions'] ?? null;
        if (! is_array($prescriptions) || $prescriptions === []) {
            unset($monitoringData['prescriptionAuthorization']);

            return $monitoringData;
        }

        if (! self::canAuthorize($user)) {
            unset($monitoringData['prescriptionAuthorization']);
            $monitoringData['prescriptions'] = array_values(array_map(function ($item) {
                if (! is_array($item)) {
                    return $item;
                }
                unset($item['authorization']);

                return $item;
            }, $prescriptions));

            return $monitoringData;
        }

        $clean = array_values(array_map(function ($item) {
            if (! is_array($item)) {
                return $item;
            }

            return self::persistedClinical($item);
        }, $prescriptions));
        $attestation = $this->attestation($user, $clean);
        $monitoringData['prescriptions'] = array_map(function ($item) use ($attestation) {
            if (! is_array($item)) {
                return $item;
            }
            $item['authorization'] = $attestation;

            return $item;
        }, $clean);
        $monitoringData['prescriptionAuthorization'] = $attestation;

        return $monitoringData;
    }

    /**
     * Only the slots covered by the hash are durable. Quantity and unit are
     * kept when supplied; a TB case id is kept when the order needs one.
     *
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private static function persistedClinical(array $item): array
    {
        $diagnosisIds = is_array($item['diagnosisIds'] ?? null) ? $item['diagnosisIds'] : [];
        $saved = [
            'id' => (string) ($item['id'] ?? ''),
            'diagnosisIds' => array_values(array_map(static fn ($id) => (string) $id, $diagnosisIds)),
            'medicineName' => (string) ($item['medicineName'] ?? ''),
            'strength' => (string) ($item['strength'] ?? ''),
            'dose' => (string) ($item['dose'] ?? ''),
            'route' => (string) ($item['route'] ?? ''),
            'frequency' => (string) ($item['frequency'] ?? ''),
            'duration' => (string) ($item['duration'] ?? ''),
            'instructions' => (string) ($item['instructions'] ?? ''),
        ];

        $quantity = $item['authorizedQuantity'] ?? null;
        if ($quantity !== null && $quantity !== '') {
            $saved['authorizedQuantity'] = is_numeric($quantity) ? (int) $quantity : $quantity;
        }
        $unit = (string) ($item['authorizedUnit'] ?? '');
        if ($unit !== '') {
            $saved['authorizedUnit'] = $unit;
        }

        $saved['source'] = (string) ($item['source'] ?? '');
        $tbCaseId = (string) ($item['tbCaseId'] ?? '');
        if ($tbCaseId !== '' || $saved['source'] === 'tb_form4b_ref') {
            $saved['tbCaseId'] = $tbCaseId;
        }

        return $saved;
    }

    /** @param  list<mixed>  $prescriptions */
    private static function clinicalRows(array $prescriptions): array
    {
        $rows = [];
        foreach (array_values($prescriptions) as $item) {
            if (! is_array($item)) {
                $rows[] = null;
                continue;
            }
            $quantity = $item['authorizedQuantity'] ?? null;
            if ($quantity === null || $quantity === '') {
                $quantity = null;
            } elseif (is_numeric($quantity)) {
                $quantity = (int) $quantity;
            }
            $diagnosisIds = is_array($item['diagnosisIds'] ?? null) ? $item['diagnosisIds'] : [];

            $rows[] = [
                (string) ($item['id'] ?? ''),
                array_values(array_map(fn ($id) => (string) $id, $diagnosisIds)),
                (string) ($item['medicineName'] ?? ''),
                (string) ($item['strength'] ?? ''),
                (string) ($item['dose'] ?? ''),
                (string) ($item['route'] ?? ''),
                (string) ($item['frequency'] ?? ''),
                (string) ($item['duration'] ?? ''),
                (string) ($item['instructions'] ?? ''),
                $quantity,
                (string) ($item['authorizedUnit'] ?? ''),
                (string) ($item['source'] ?? ''),
                (string) ($item['tbCaseId'] ?? ''),
            ];
        }

        return $rows;
    }
}

```
diff --git a/backend/app/Http/Controllers/Api/HealthRecordController.php b/backend/app/Http/Controllers/Api/HealthRecordController.php
index 3f36ab73..904c14cc 100644
--- a/backend/app/Http/Controllers/Api/HealthRecordController.php
+++ b/backend/app/Http/Controllers/Api/HealthRecordController.php
@@ -135,6 +135,9 @@ public function store(
             $this->facilityAccess->authorizePatientModification($request->user(), $patient);
         }
         app(\App\Services\TbClinicalAuthority::class)->authorizeRecord($request->user(), $patient, $data);
+        if ($rhuItr && is_array($data['monitoring_data']['prescriptions'] ?? null) && $data['monitoring_data']['prescriptions'] !== []) {
+            \App\Services\PrescriptionClinicalAuthority::ensureCanAuthorize($request->user());
+        }
         // BHC-only General Consultation v2 (consultation_workflow: bhc_general_v2).
         // A request without the discriminator runs every legacy step below unchanged.
         $v2 = $request->isBhcGeneralV2();
@@ -302,6 +305,11 @@ public function store(
         $data['date_recorded'] ??= now();
         $data['tb_assessment_authority'] = app(\App\Services\TbClinicalAuthority::class)
             ->finalizationAttestation($request->user(), $data['diagnoses'] ?? []);
+        if ($rhuItr && is_array($data['monitoring_data'] ?? null)) {
+            // After the idempotency hash: authorizedAt must not change a retry's payload hash.
+            $data['monitoring_data'] = app(\App\Services\PrescriptionClinicalAuthority::class)
+                ->applyToMonitoringData($request->user(), $data['monitoring_data']);
+        }
 
         try {
             $record = DB::transaction(function () use (
diff --git a/backend/app/Http/Requests/HealthRecordRequest.php b/backend/app/Http/Requests/HealthRecordRequest.php
index 3eca58b4..4399bcec 100644
--- a/backend/app/Http/Requests/HealthRecordRequest.php
+++ b/backend/app/Http/Requests/HealthRecordRequest.php
@@ -32,6 +32,19 @@ protected function prepareForValidation(): void
         }
         $monitoringData = $this->input('monitoring_data');
         if (is_array($monitoringData)) {
+            if ($this->isRhuItrV1()) {
+                // Authorization is written at finalize. A client copy must not survive validation.
+                unset($monitoringData['prescriptionAuthorization']);
+                if (is_array($monitoringData['prescriptions'] ?? null)) {
+                    $monitoringData['prescriptions'] = array_values(array_map(function ($item) {
+                        if (is_array($item)) {
+                            unset($item['authorization']);
+                        }
+
+                        return $item;
+                    }, $monitoringData['prescriptions']));
+                }
+            }
             if ($this->isBhcGeneralV2()) {
                 // Accept existing aliases, but validate every value through the
                 // canonical rules before the schedule normalizer can read it.
@@ -213,6 +226,23 @@ public function rules(): array
             $rules['rhu_visit_id'] = ['required', 'integer', 'exists:rhu_visit_queue_entries,id'];
             $rules['consultation_uuid'] = ['required', 'uuid'];
             $rules['prescription_text'] = ['nullable', 'string', 'max:5000'];
+            $rules['monitoring_data.prescriptions'] = ['nullable', 'array', 'max:50'];
+            $rules['monitoring_data.prescriptions.*'] = ['array'];
+            $rules['monitoring_data.prescriptions.*.id'] = ['required', 'string', 'max:64', 'distinct'];
+            $rules['monitoring_data.prescriptions.*.diagnosisIds'] = ['required', 'array', 'min:1', 'max:20'];
+            $rules['monitoring_data.prescriptions.*.diagnosisIds.*'] = ['required', 'string', 'max:64'];
+            $rules['monitoring_data.prescriptions.*.medicineName'] = ['required', 'string', 'max:255'];
+            $rules['monitoring_data.prescriptions.*.strength'] = ['required', 'string', 'max:100'];
+            $rules['monitoring_data.prescriptions.*.dose'] = ['required', 'string', 'max:100'];
+            $rules['monitoring_data.prescriptions.*.route'] = ['required', 'string', 'max:50'];
+            $rules['monitoring_data.prescriptions.*.frequency'] = ['required', 'string', 'max:100'];
+            $rules['monitoring_data.prescriptions.*.duration'] = ['required', 'string', 'max:100'];
+            $rules['monitoring_data.prescriptions.*.instructions'] = ['nullable', 'string', 'max:2000'];
+            $rules['monitoring_data.prescriptions.*.authorizedQuantity'] = ['nullable', 'integer', 'min:1'];
+            $rules['monitoring_data.prescriptions.*.authorizedUnit'] = ['nullable', 'string', 'max:50'];
+            $rules['monitoring_data.prescriptions.*.source'] = ['required', Rule::in(['itr', 'tb_form4b_ref'])];
+            $rules['monitoring_data.prescriptions.*.tbCaseId'] = ['nullable', 'string', 'max:64'];
+            $rules['monitoring_data.prescriptions.*.authorization'] = ['prohibited'];
             $rules['prescribed_medicines'] = ['prohibited'];
             $rules['referral'] = ['prohibited'];
             $rules['dispensed_medicines'] = ['prohibited'];
@@ -714,6 +744,7 @@ public function withValidator($validator): void
             TbAssessment::validate($validator, $this->diagnosesInput());
             $this->validateSupportingLaboratoryTests($validator);
             $this->validateTbCaseRegistration($validator);
+            $this->validateStructuredPrescriptions($validator);
             $monitoringData = $this->input('monitoring_data', []);
             ConsultationPrograms::validateSelection(
                 $validator,
@@ -1119,6 +1150,78 @@ private function validateSupportingLaboratoryTests($validator): void
         }
     }
 
+    private function validateStructuredPrescriptions($validator): void
+    {
+        if (! $this->isRhuItrV1() || ! $this->isMethod('post')) {
+            return;
+        }
+        $prescriptions = $this->input('monitoring_data.prescriptions');
+        if (! is_array($prescriptions) || $prescriptions === []) {
+            return;
+        }
+
+        $known = [];
+        foreach ($this->diagnosesInput() as $entry) {
+            if (! is_array($entry)) {
+                continue;
+            }
+            $id = trim((string) ($entry['id'] ?? ''));
+            if ($id !== '') {
+                $known[$id] = true;
+            }
+        }
+
+        foreach ($prescriptions as $index => $prescription) {
+            if (! is_array($prescription)) {
+                continue;
+            }
+            foreach ([
+                'id' => 'Prescription id is required.',
+                'medicineName' => 'Enter the medicine name.',
+                'strength' => 'Enter the strength.',
+                'dose' => 'Enter the dose.',
+                'route' => 'Enter the route.',
+                'frequency' => 'Enter the frequency.',
+                'duration' => 'Enter the duration.',
+            ] as $field => $message) {
+                if (trim((string) ($prescription[$field] ?? '')) === '') {
+                    $validator->errors()->add("monitoring_data.prescriptions.$index.$field", $message);
+                }
+            }
+            $diagnosisIds = $prescription['diagnosisIds'] ?? null;
+            if (! is_array($diagnosisIds) || $diagnosisIds === []) {
+                $validator->errors()->add(
+                    "monitoring_data.prescriptions.$index.diagnosisIds",
+                    'Link this prescription to at least one diagnosis.'
+                );
+            } else {
+                foreach ($diagnosisIds as $diagnosisId) {
+                    if (! isset($known[trim((string) $diagnosisId)])) {
+                        $validator->errors()->add(
+                            "monitoring_data.prescriptions.$index.diagnosisIds",
+                            'Link this prescription only to diagnoses on this visit.'
+                        );
+                        break;
+                    }
+                }
+            }
+            $quantity = $prescription['authorizedQuantity'] ?? null;
+            $quantityPresent = $quantity !== null && $quantity !== '';
+            if ($quantityPresent && trim((string) ($prescription['authorizedUnit'] ?? '')) === '') {
+                $validator->errors()->add(
+                    "monitoring_data.prescriptions.$index.authorizedUnit",
+                    'Enter the unit for the authorized quantity.'
+                );
+            }
+            if (($prescription['source'] ?? null) === 'tb_form4b_ref' && trim((string) ($prescription['tbCaseId'] ?? '')) === '') {
+                $validator->errors()->add(
+                    "monitoring_data.prescriptions.$index.tbCaseId",
+                    'Link the registered TB case.'
+                );
+            }
+        }
+    }
+
     private function validateTbCaseRegistration($validator): void
     {
         if (! $this->isRhuItrV1() || ! $this->isMethod('post')) {
@@ -1167,13 +1270,20 @@ private function validateTbCaseRegistration($validator): void
                 $validator->errors()->add("tb_case_registration.card_data.classification.$field", "$label is required.");
             }
         }
-        if (($classification['anatomicalSite'] ?? null) === 'extrapulmonary' && blank($classification['extrapulmonarySite'] ?? null)) {
+        $epSite = trim((string) ($classification['extrapulmonarySite'] ?? ''));
+        if (($classification['anatomicalSite'] ?? null) === 'extrapulmonary'
+            && ($epSite === '' || preg_match('/^other\s*:\s*$/i', $epSite))) {
             $validator->errors()->add('tb_case_registration.card_data.classification.extrapulmonarySite', 'Specify the extra-pulmonary site.');
         }
         $regimen = is_array($card['regimen'] ?? null) ? $card['regimen'] : [];
-        if (blank($regimen['description'] ?? null)) {
+        $description = trim((string) ($regimen['description'] ?? ''));
+        if ($description === '' || strcasecmp($description, 'none') === 0) {
             $validator->errors()->add('tb_case_registration.card_data.regimen.description', 'Enter the physician-prescribed regimen.');
         }
+        $code = (string) ($regimen['code'] ?? '');
+        if ($code !== '' && ! in_array($code, ['2hrze_4hr', '2hrze_10hr', 'other'], true)) {
+            $validator->errors()->add('tb_case_registration.card_data.regimen.code', 'Select a physician-authorized regimen.');
+        }
         if (! is_numeric($regimen['weightKg'] ?? null) || (float) $regimen['weightKg'] <= 0) {
             $validator->errors()->add('tb_case_registration.card_data.regimen.weightKg', 'Enter a positive baseline weight in kg.');
         }
@@ -1190,6 +1300,10 @@ private function validateTbCaseRegistration($validator): void
                     $validator->errors()->add("tb_case_registration.card_data.regimen.rows.$index.$field", "Regimen row ".($index + 1)." is incomplete.");
                 }
             }
+            $phase = (string) ($row['phase'] ?? '');
+            if ($phase !== '' && ! in_array($phase, ['intensive', 'continuation', 'individualized'], true)) {
+                $validator->errors()->add("tb_case_registration.card_data.regimen.rows.$index.phase", 'Regimen row '.($index + 1).': select a valid treatment phase.');
+            }
             $hasDose = collect(TbCaseRegistrationRequest::DOSE_FIELDS)->contains(
                 fn ($key) => is_numeric($row[$key] ?? null) && (float) $row[$key] > 0
             );

## FILE: PrescriptionClinicalAuthorityTest.php
```php
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

```
