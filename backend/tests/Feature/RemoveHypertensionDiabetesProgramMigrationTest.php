<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecordDraft;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\HealthRecordDraftService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class RemoveHypertensionDiabetesProgramMigrationTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;
    private User $worker;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Removal RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Removal BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->worker = User::create(['name' => 'Removal BHW', 'email' => 'removal@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id]);
        $this->patient = Patient::create(['first_name' => 'Synthetic', 'last_name' => 'Removal', 'sex' => 'Female', 'birthdate' => '1990-01-01', 'barangay_health_center_id' => $bhc->id]);
    }

    private function runMigration(): void
    {
        (require base_path('database/migrations/2026_09_27_000001_remove_hypertension_diabetes_program.php'))->up();
    }

    private function record(?string $category, ?array $monitoring, ?array $vitals = null): int
    {
        return DB::table('health_records')->insertGetId([
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'category' => $category,
            'monitoring_data' => $monitoring === null ? null : json_encode($monitoring),
            'vital_signs' => $vitals === null ? null : json_encode($vitals),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function monitoring(int $id): ?array
    {
        $raw = DB::table('health_records')->where('id', $id)->value('monitoring_data');

        return $raw === null ? null : json_decode($raw, true);
    }

    private function draft(string $classification, array $payload): HealthRecordDraft
    {
        return HealthRecordDraft::create([
            'public_id' => (string) Str::uuid(),
            'owner_user_id' => $this->worker->id,
            'barangay_health_center_id' => $this->patient->barangay_health_center_id,
            'patient_id' => $this->patient->id,
            'classification' => $classification,
            'encrypted_payload' => Crypt::encryptString(json_encode($payload)),
            'version' => 1,
            'status' => HealthRecordDraft::STATUS_ACTIVE,
            'expires_at' => now()->addDays(7),
            'last_saved_at' => now(),
        ]);
    }

    private function draftPayload(HealthRecordDraft $draft): array
    {
        return json_decode(Crypt::decryptString($draft->fresh()->encrypted_payload), true);
    }

    public function test_blob_is_stripped_from_a_general_record_and_other_keys_survive(): void
    {
        $id = $this->record('General Consultation', [
            'selectedPrograms' => [],
            'monitoringNotes' => 'keep me',
            'hypertensionDiabeticData' => ['bp' => '120/80', 'treatmentActionTaken' => 'x'],
            'hypertension_diabetic_data' => ['bp' => '120/80'],
        ], ['systolicBp' => '120', 'diastolicBp' => '80']);

        $this->runMigration();

        $this->assertSame(['selectedPrograms' => [], 'monitoringNotes' => 'keep me'], $this->monitoring($id));
        $this->assertSame('General Consultation', DB::table('health_records')->where('id', $id)->value('category'));
    }

    public function test_only_program_removed_becomes_general_consultation(): void
    {
        $id = $this->record('Hypertension / Diabetic Monitoring', [
            'selectedPrograms' => ['Hypertension', 'Diabetes'],
            'primaryProgram' => 'Hypertension',
            'consultationMode' => 'program',
            'visitPurpose' => ['version' => 1, 'services' => ['Hypertension', 'Diabetes']],
            'hypertensionDiabeticData' => ['conditionType' => 'both', 'fbs' => '95'],
        ]);

        $this->runMigration();

        $data = $this->monitoring($id);
        $this->assertSame([], $data['selectedPrograms']);
        $this->assertNull($data['primaryProgram']);
        $this->assertSame('general', $data['consultationMode']);
        $this->assertSame(['General'], $data['visitPurpose']['services']);
        $this->assertArrayNotHasKey('hypertensionDiabeticData', $data);
        $this->assertSame('General Consultation', DB::table('health_records')->where('id', $id)->value('category'));
    }

    public function test_primary_moves_to_remaining_program_and_category_follows(): void
    {
        $id = $this->record('Hypertension / Diabetic Monitoring', [
            'selectedPrograms' => ['Diabetes', 'Maternal'],
            'primaryProgram' => 'Diabetes',
            'visitPurpose' => ['version' => 1, 'services' => ['Prenatal', 'Diabetes']],
        ]);

        $this->runMigration();

        $data = $this->monitoring($id);
        $this->assertSame(['Maternal'], $data['selectedPrograms']);
        $this->assertSame('Maternal', $data['primaryProgram']);
        $this->assertSame(['Prenatal'], $data['visitPurpose']['services']);
        $this->assertSame('Maternal', DB::table('health_records')->where('id', $id)->value('category'));
    }

    public function test_secondary_removed_program_leaves_primary_and_category_alone(): void
    {
        $id = $this->record('TB DOTS / TB Monitoring', [
            'selectedPrograms' => ['TB', 'Hypertension'],
            'primaryProgram' => 'TB',
        ]);

        $this->runMigration();

        $this->assertSame(['TB'], $this->monitoring($id)['selectedPrograms']);
        $this->assertSame('TB', $this->monitoring($id)['primaryProgram']);
        $this->assertSame('TB DOTS / TB Monitoring', DB::table('health_records')->where('id', $id)->value('category'));
    }

    public function test_blob_only_blood_pressure_is_backfilled_into_vital_signs(): void
    {
        $id = $this->record('General Consultation', [
            'hypertensionDiabeticData' => ['bp' => '140 / 90'],
        ], ['temperature' => '36.5']);

        $this->runMigration();

        $vitals = json_decode(DB::table('health_records')->where('id', $id)->value('vital_signs'), true);
        $this->assertSame(['temperature' => '36.5', 'systolicBp' => '140', 'diastolicBp' => '90'], $vitals);
    }

    public function test_existing_vital_signs_bp_is_never_overwritten(): void
    {
        $id = $this->record('General Consultation', [
            'hypertensionDiabeticData' => ['bp' => '140/90'],
        ], ['systolicBp' => '118', 'diastolicBp' => '76']);

        $this->runMigration();

        $vitals = json_decode(DB::table('health_records')->where('id', $id)->value('vital_signs'), true);
        $this->assertSame('118', $vitals['systolicBp']);
        $this->assertSame('76', $vitals['diastolicBp']);
    }

    public function test_untouched_records_keep_null_monitoring_data(): void
    {
        $id = $this->record('Family Planning', null);

        $this->runMigration();

        $this->assertNull($this->monitoring($id));
        $this->assertSame('Family Planning', DB::table('health_records')->where('id', $id)->value('category'));
    }

    public function test_draft_payload_and_classification_are_cleaned(): void
    {
        $draft = $this->draft('Hypertension / Diabetic Monitoring', [
            'selectedPrograms' => ['Hypertension', 'Maternal'],
            'primaryProgram' => 'Hypertension',
            'consultationMode' => 'program',
            'hypertensionDiabeticData' => ['bp' => '130/85', 'conditionType' => 'hpn'],
        ]);

        $this->runMigration();

        $payload = $this->draftPayload($draft);
        $this->assertSame(['Maternal'], $payload['selectedPrograms']);
        $this->assertSame('Maternal', $payload['primaryProgram']);
        $this->assertSame('program', $payload['consultationMode']);
        $this->assertArrayNotHasKey('hypertensionDiabeticData', $payload);
        $this->assertSame('Maternal', $draft->fresh()->classification);
    }

    public function test_cleaned_draft_still_opens_through_the_draft_service(): void
    {
        $draft = $this->draft('General Consultation', [
            'selectedPrograms' => [],
            'consultationMode' => 'general',
            'hypertensionDiabeticData' => ['bp' => '130/85', 'fbs' => '', 'conditionType' => '', 'clientStatus' => '', 'dateOfLastConsultation' => '', 'treatmentActionTaken' => ''],
        ]);

        $this->runMigration();

        $payload = app(HealthRecordDraftService::class)->payload($draft->fresh());
        $this->assertSame([], $payload['selectedPrograms']);
        $this->assertArrayNotHasKey('hypertensionDiabeticData', $payload);
    }

    public function test_unreadable_monitoring_data_is_never_overwritten(): void
    {
        $id = $this->record('Hypertension / Diabetic Monitoring', null);
        DB::table('health_records')->where('id', $id)->update(['monitoring_data' => '"{\\"double\\":\\"encoded\\"}"']);

        $this->runMigration();

        $this->assertSame('"{\\"double\\":\\"encoded\\"}"', DB::table('health_records')->where('id', $id)->value('monitoring_data'));
        $this->assertSame('General Consultation', DB::table('health_records')->where('id', $id)->value('category'));
    }

    public function test_blob_blood_pressure_with_units_is_backfilled(): void
    {
        $id = $this->record('General Consultation', [
            'hypertensionDiabeticData' => ['bp' => '120/80 mmHg'],
        ], []);

        $this->runMigration();

        $vitals = json_decode(DB::table('health_records')->where('id', $id)->value('vital_signs'), true);
        $this->assertSame(['systolicBp' => '120', 'diastolicBp' => '80'], $vitals);
    }

    public function test_hd_only_draft_with_visit_purpose_still_opens(): void
    {
        $draft = $this->draft('Hypertension / Diabetic Monitoring', [
            'selectedPrograms' => ['Hypertension'],
            'primaryProgram' => 'Hypertension',
            'consultationMode' => 'program',
            'visitPurpose' => ['version' => 1, 'services' => ['Hypertension']],
            'hypertensionDiabeticData' => ['conditionType' => 'hpn'],
        ]);

        $this->runMigration();

        $payload = app(HealthRecordDraftService::class)->payload($draft->fresh());
        $this->assertSame(['General'], $payload['visitPurpose']['services']);
        $this->assertNull($payload['primaryProgram']);
        $this->assertSame('general', $payload['consultationMode']);
        $this->assertSame('General Consultation', $draft->fresh()->classification);
    }

    public function test_undecryptable_draft_is_left_untouched(): void
    {
        $draft = $this->draft('General Consultation', []);
        DB::table('health_record_drafts')->where('id', $draft->id)->update(['encrypted_payload' => 'not-ciphertext']);

        $this->runMigration();

        $this->assertSame('not-ciphertext', DB::table('health_record_drafts')->where('id', $draft->id)->value('encrypted_payload'));
    }
}
