# Remove the Hypertension / Diabetes Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Hypertension / Diabetes program (two selector checkboxes sharing one "Hypertension / Diabetic Monitoring" form) from the database contents, Laravel backend, API service layer and React frontend, leaving TB, Maternal, EPI and Family Planning unchanged.

**Architecture:** The program never had its own table or column; its data lives in `health_records.monitoring_data` JSON and in the encrypted draft payload. A data migration strips it and repairs program selections; the backend stops accepting the program; the frontend removes every consumer first and the shared utilities last, so each commit builds.

**Tech Stack:** Laravel (PHP 8, PHPUnit, SQLite in-memory for tests, PostgreSQL in dev), React + Vite, `node --test` for frontend utils, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-27-remove-hypertension-diabetes-program-design.md`

## Global Constraints

- Scope is the program only. KEEP: prenatal risk factors `diabetes` / `hypertensive` (`prenatalForm.js`, `recordDetailsHelpers.js` risk labels ~line 712-715, `HealthRecordDraftPayloadService.php` `riskAssessment` keys), `currentDiseases` / family history in patient medical background, TB `comorbidities.otherComorbidities`.
- RHU is out of scope: do NOT modify `pages/rhu/RHUAddHealthRecords.jsx` or `pages/rhu/RHUHealthRecords.jsx` ("Senior Citizen" / "NCD Monitoring" stays).
- All stored data is sample data: the migration strips unconditionally and logs counts; `down()` is a documented no-op.
- Remaining program keys, exactly: `Maternal`, `TB`, `Family Planning`, `EPI`. Remaining visit services, exactly: `General`, `Prenatal`, `Postpartum`, `EPI`, `Family Planning`, `TB`.
- Health records are otherwise immutable after save; this migration is the one deliberate, documented exception.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Baseline (recorded 2026-09-27 on a clean tree)

- `php artisan test`: 491 tests, **206 already failing** (mostly 403/401: test users have no permission profile, e.g. every `VisitPurposeTest` HTTP test). Do not try to fix these. Judge this work only by the tests it adds or edits, plus "no test that passed before now fails".
- `node --test src/utils/*.test.js` (from `frontend/`): 181 pass, 0 fail.
- `npx eslint .` (from `frontend/`): 0 errors, 1 warning.

## Review Focus

1. **An old draft that still contains `hypertensionDiabeticData` after deploy.** The draft sanitizer throws on unknown keys, so an uncleaned draft opens as a 500. Expect: after the migration, it opens normally. (Task 1 test `test_cleaned_draft_still_opens_through_the_draft_service`.)
2. **A record or draft whose primary program was Hypertension or Diabetes but which also has Maternal.** Expect: primary becomes Maternal and category/classification becomes `Maternal`, so `ConsultationPrograms::validateSelection` ("category must match primary") still passes. (Task 1 test `test_primary_moves_to_remaining_program_and_category_follows`.)
3. **A record/draft whose ONLY program was Hypertension/Diabetes.** Expect: `selectedPrograms: []`, `primaryProgram: null`, `consultationMode: 'general'`, `visitPurpose.services: ['General']` (never empty, since the rule requires `min:1`), category `General Consultation`. (Task 1 test `test_only_program_removed_becomes_general_consultation`.)
4. **A legacy record whose BP lives only in the blob (`bp: "120/80"`, no `vital_signs.systolicBp`).** Expect: BP is copied into `vital_signs` before the blob is removed, and no BP is lost. (Task 1 test `test_blob_only_blood_pressure_is_backfilled_into_vital_signs`.)
5. **A consultation with no program and no BP, and a bookmarked `?type=ncd` report URL.** Expect: the consultation saves (BP was only required for this program), and `?type=ncd` falls back to the default EPI report without crashing. (Task 5 step "Manual check".)

---

## File Structure

| File | Change | Task |
|---|---|---|
| `backend/database/migrations/2026_09_27_000001_remove_hypertension_diabetes_program.php` | Create: data cleanup | 1 |
| `backend/tests/Feature/RemoveHypertensionDiabetesProgramMigrationTest.php` | Create | 1 |
| `backend/app/Services/VisitPurpose.php` | Modify | 2 |
| `backend/app/Services/ConsultationPrograms.php` | Modify | 2 |
| `backend/app/Http/Requests/HealthRecordRequest.php` | Modify | 2 |
| `backend/app/Http/Requests/HealthRecordDraftRequest.php` | Modify | 2 |
| `backend/app/Services/HealthRecordDraftPayloadService.php` | Modify | 2 |
| `backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php` | Create | 2 |
| `backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php` | Modify | 2 |
| `frontend/src/pages/bhc/BHCReports.jsx`, `frontend/src/components/layout/sidebar/sidebarData.js` | Modify | 3 |
| `HealthRecordClinicalDetails.jsx`, `SpecializedRecordsTab.jsx`, `recordDetailsHelpers.js`, `HealthRecords.jsx`, `FollowUps.jsx`, `followUpStatusStyles.jsx`, `PatientDetails.jsx` | Modify | 4 |
| `frontend/src/pages/bhc/ConsultationWorkspace.jsx`, `wizard/ConsultationProgramPanel.jsx` | Modify | 5 |
| `frontend/src/services/healthRecordService.js` | Modify | 6 |
| `frontend/src/utils/{consultationPrograms,visitPurpose,consultationSteps,healthRecordPrograms}.js` + their tests | Modify | 7 |
| `docs/*.md` | Modify | 8 |

The frontend order (consumers 3→6 before utilities 7) keeps every commit building: Task 7 deletes exports that Tasks 3-6 stop importing.

---

### Task 1: Data migration

**Files:**
- Create: `backend/database/migrations/2026_09_27_000001_remove_hypertension_diabetes_program.php`
- Test: `backend/tests/Feature/RemoveHypertensionDiabetesProgramMigrationTest.php`

**Interfaces:**
- Consumes: `App\Services\HealthRecordDraftService::payload(HealthRecordDraft $draft): array` (existing; decrypts and sanitizes, aborts 500 on failure).
- Produces: cleaned rows. No PHP API used by later tasks.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/RemoveHypertensionDiabetesProgramMigrationTest.php`:

```php
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

    public function test_undecryptable_draft_is_left_untouched(): void
    {
        $draft = $this->draft('General Consultation', []);
        DB::table('health_record_drafts')->where('id', $draft->id)->update(['encrypted_payload' => 'not-ciphertext']);

        $this->runMigration();

        $this->assertSame('not-ciphertext', DB::table('health_record_drafts')->where('id', $draft->id)->value('encrypted_payload'));
    }
}
```

Note: `test_cleaned_draft_still_opens_through_the_draft_service` passes in Task 1 already (the key is optional in today's schema). It becomes the real guard for Review Focus #1 once Task 2 makes the key *unknown*, because without the migration that draft would then fail to open.

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `php artisan test --filter RemoveHypertensionDiabetesProgramMigrationTest`
Expected: FAIL. `require` of the migration file errors with "Failed to open stream" (the file does not exist yet).

- [ ] **Step 3: Write the migration**

Create `backend/database/migrations/2026_09_27_000001_remove_hypertension_diabetes_program.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Removes the Hypertension / Diabetes program from stored data.
 *
 * The program never had its own column: its form lived in
 * health_records.monitoring_data and in the encrypted draft payload, so this
 * rewrites JSON instead of dropping schema. It is the one deliberate exception
 * to "health records are immutable after save" - every row at the time of the
 * removal was sample data. The draft cleanup is required, not cosmetic: the
 * draft sanitizer rejects unknown keys, so a draft still holding
 * hypertensionDiabeticData would no longer open.
 */
return new class extends Migration
{
    private const REMOVED_PROGRAMS = ['Hypertension', 'Diabetes'];

    private const REMOVED_CATEGORY = 'Hypertension / Diabetic Monitoring';

    private const REMOVED_KEYS = ['hypertensionDiabeticData', 'hypertension_diabetic_data'];

    // ConsultationPrograms::CLASSIFICATIONS after the removal, copied so this
    // migration keeps its meaning if that constant changes later.
    private const CLASSIFICATIONS = [
        'Maternal' => 'Maternal',
        'TB' => 'TB DOTS / TB Monitoring',
        'Family Planning' => 'Family Planning',
        'EPI' => 'Immunization',
    ];

    public function up(): void
    {
        $records = 0;
        DB::table('health_records')
            ->select(['id', 'category', 'monitoring_data', 'vital_signs'])
            ->chunkById(200, function ($rows) use (&$records): void {
                foreach ($rows as $row) {
                    $monitoring = $this->decode($row->monitoring_data);
                    $vitals = $this->decode($row->vital_signs);
                    $backfilled = $this->backfillBloodPressure($vitals ?? [], $monitoring ?? []);
                    [$cleaned, $category, $changed] = $this->clean($monitoring ?? [], $row->category);
                    $vitalsChanged = $backfilled !== ($vitals ?? []);

                    if (! $changed && ! $vitalsChanged) {
                        continue;
                    }

                    DB::table('health_records')->where('id', $row->id)->update([
                        'category' => $category,
                        'monitoring_data' => $monitoring === null ? null : $this->encode($cleaned),
                        ...($vitalsChanged ? ['vital_signs' => $this->encode($backfilled)] : []),
                    ]);
                    $records++;
                }
            });

        $drafts = 0;
        $undecryptable = 0;
        DB::table('health_record_drafts')
            ->select(['id', 'classification', 'encrypted_payload'])
            ->chunkById(200, function ($rows) use (&$drafts, &$undecryptable): void {
                foreach ($rows as $row) {
                    $payload = [];
                    if ($row->encrypted_payload !== null) {
                        try {
                            $payload = json_decode(Crypt::decryptString($row->encrypted_payload), true, flags: JSON_THROW_ON_ERROR);
                        } catch (Throwable) {
                            $undecryptable++;

                            continue;
                        }
                    }

                    [$cleaned, $classification, $changed] = $this->clean(is_array($payload) ? $payload : [], $row->classification);
                    if (! $changed) {
                        continue;
                    }

                    DB::table('health_record_drafts')->where('id', $row->id)->update([
                        'classification' => $classification,
                        'encrypted_payload' => $row->encrypted_payload === null
                            ? null
                            : Crypt::encryptString(json_encode($cleaned, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
                    ]);
                    $drafts++;
                }
            });

        Log::info('Removed the Hypertension / Diabetes program from stored data.', [
            'health_records_changed' => $records,
            'drafts_changed' => $drafts,
            'drafts_undecryptable' => $undecryptable,
        ]);
    }

    /** The removed values cannot be restored. */
    public function down(): void {}

    /**
     * @return array{0: array, 1: ?string, 2: bool} the cleaned data, the
     *                                             category to store, and whether anything changed
     */
    private function clean(array $data, ?string $category): array
    {
        $changed = false;

        foreach (self::REMOVED_KEYS as $key) {
            if (array_key_exists($key, $data)) {
                unset($data[$key]);
                $changed = true;
            }
        }

        if (is_array($data['selectedPrograms'] ?? null)) {
            $kept = array_values(array_diff($data['selectedPrograms'], self::REMOVED_PROGRAMS));
            if ($kept !== $data['selectedPrograms']) {
                $data['selectedPrograms'] = $kept;
                $changed = true;
            }
        }

        $primaryRemoved = in_array($data['primaryProgram'] ?? null, self::REMOVED_PROGRAMS, true);
        if ($primaryRemoved) {
            $data['primaryProgram'] = $data['selectedPrograms'][0] ?? null;
            $changed = true;
        }

        if (($data['selectedPrograms'] ?? null) === [] && ($data['consultationMode'] ?? null) === 'program') {
            $data['consultationMode'] = 'general';
            $changed = true;
        }

        $services = $data['visitPurpose']['services'] ?? null;
        if (is_array($services)) {
            $kept = array_values(array_diff($services, self::REMOVED_PROGRAMS));
            if ($kept !== $services) {
                $data['visitPurpose']['services'] = $kept === [] ? ['General'] : $kept;
                $changed = true;
            }
        }

        if ($category === self::REMOVED_CATEGORY || $primaryRemoved) {
            $next = self::CLASSIFICATIONS[$data['primaryProgram'] ?? ''] ?? 'General Consultation';
            if ($next !== $category) {
                $category = $next;
                $changed = true;
            }
        }

        return [$data, $category, $changed];
    }

    /** Copies a blob-only "120/80" reading into vital_signs; never overwrites. */
    private function backfillBloodPressure(array $vitals, array $monitoring): array
    {
        $bp = $monitoring['hypertensionDiabeticData']['bp']
            ?? $monitoring['hypertension_diabetic_data']['bp']
            ?? null;

        if (! is_string($bp) || filled($vitals['systolicBp'] ?? null) || filled($vitals['diastolicBp'] ?? null)) {
            return $vitals;
        }
        if (preg_match('/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/', $bp, $match) !== 1) {
            return $vitals;
        }

        return [...$vitals, 'systolicBp' => $match[1], 'diastolicBp' => $match[2]];
    }

    private function decode(mixed $json): ?array
    {
        if ($json === null) {
            return null;
        }
        $decoded = json_decode((string) $json, true);

        return is_array($decoded) ? $decoded : null;
    }

    /** An emptied object stays an object ({}), not a list ([]). */
    private function encode(array $data): string
    {
        return json_encode($data === [] ? new stdClass : $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `php artisan test --filter RemoveHypertensionDiabetesProgramMigrationTest`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/database/migrations/2026_09_27_000001_remove_hypertension_diabetes_program.php backend/tests/Feature/RemoveHypertensionDiabetesProgramMigrationTest.php
git commit -m "feat(db): migrate Hypertension / Diabetes program data out of records and drafts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Do NOT run `php artisan migrate` against the dev database yet. That happens in Task 8, after the frontend stops writing the blob.

---

### Task 2: Backend stops accepting the program

**Files:**
- Modify: `backend/app/Services/VisitPurpose.php` (`SERVICES` line 11, `rules()` line 18, block ~lines 115-121)
- Modify: `backend/app/Services/ConsultationPrograms.php` (lines 13-14, 21)
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (~line 317 comment, ~lines 393-395)
- Modify: `backend/app/Http/Requests/HealthRecordDraftRequest.php` (line 16)
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php` (~lines 220-227)
- Create: `backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php`
- Modify: `backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php` (~lines 197-204)

**Interfaces:**
- Produces: `VisitPurpose::SERVICES === ['General', 'Prenatal', 'Postpartum', 'EPI', 'Family Planning', 'TB']`; `array_keys(ConsultationPrograms::CLASSIFICATIONS) === ['Maternal', 'TB', 'Family Planning', 'EPI']`.

- [ ] **Step 1: Write the failing test**

These call the rules directly (not over HTTP), so the pre-existing 403 baseline failures cannot mask them. Create `backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php`:

```php
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
        $this->assertSame(['Maternal', 'TB', 'Family Planning', 'EPI'], array_keys(ConsultationPrograms::CLASSIFICATIONS));
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `php artisan test --filter RemovedHypertensionDiabetesProgramTest`
Expected: FAIL in 4 of 5 tests (`test_remaining_programs_still_validate` already passes): the constant assertions fail, the validators pass for `Hypertension`, and `sanitize` accepts the blob.

- [ ] **Step 3: Implement**

`backend/app/Services/VisitPurpose.php`, line 11:

```php
    public const SERVICES = ['General', 'Prenatal', 'Postpartum', 'EPI', 'Family Planning', 'TB'];
```

Line 18: change `'max:8'` to `'max:6'`:

```php
            "$prefix.services" => ["required_with:$prefix", 'array', 'list', 'min:1', 'max:6'],
```

Delete this whole block (~lines 115-121):

```php
        if (array_intersect(['Hypertension', 'Diabetes'], $services)) {
            foreach (['vital_signs.systolicBp', 'vital_signs.diastolicBp', 'monitoring_data.hypertensionDiabeticData.conditionType'] as $field) {
                if (blank($request->input($field))) {
                    $validator->errors()->add($field, 'This field is required for Hypertension / Diabetic monitoring.');
                }
            }
        }
```

`backend/app/Services/ConsultationPrograms.php`: delete the two lines `'Hypertension' => ...` and `'Diabetes' => ...` from `CLASSIFICATIONS`, and change `'max:6'` to `'max:4'` in `rules()`:

```php
            "$prefix.selectedPrograms" => ['sometimes', 'array', 'list', 'max:4'],
```

`backend/app/Http/Requests/HealthRecordRequest.php` ~line 317: change the comment line
`// monitoring_data.hypertensionDiabeticData is how it was found, but`
to
`// a since-removed monitoring_data sub-object is how it was found, but`
(keep the rest of the comment). Then delete (~lines 393-395):

```php
            if (array_intersect(['Hypertension', 'Diabetes'], $programs)) {
                $required = [...$required, 'monitoring_data.hypertensionDiabeticData.conditionType', 'vital_signs.systolicBp', 'vital_signs.diastolicBp'];
            }
```

`backend/app/Http/Requests/HealthRecordDraftRequest.php`: delete the line `'Hypertension / Diabetic Monitoring',` from `CLASSIFICATIONS`.

`backend/app/Services/HealthRecordDraftPayloadService.php`: delete the whole `'hypertensionDiabeticData' => [ ... ],` schema entry (~lines 220-227; six SCALAR keys `bp`, `fbs`, `conditionType`, `clientStatus`, `dateOfLastConsultation`, `treatmentActionTaken`). Leave `riskAssessment.diabetes` / `riskAssessment.hypertensive` alone.

`backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php`: delete the `'hypertensionDiabeticData' => [ ... ],` block (~lines 197-204) from `fullFrontendPayload()`. Keep the `diabetes` / `hypertensive` risk-factor keys at ~lines 112-115.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `php artisan test --filter 'RemovedHypertensionDiabetesProgramTest|HealthRecordDraftPayloadServiceTest|RemoveHypertensionDiabetesProgramMigrationTest|PatientMedicalBackgroundTest|FormsFinalizationChecklistTest'`
Expected: `RemovedHypertensionDiabetesProgramTest` (5), `HealthRecordDraftPayloadServiceTest` and `RemoveHypertensionDiabetesProgramMigrationTest` (10) PASS. The other two files show the same pass/fail split as on the baseline tree (compare with `git stash` if unsure).

Then run: `php artisan test` and confirm the failing count is **≤ 206** and no test outside the baseline failure list fails.

- [ ] **Step 5: Commit**

```bash
git add backend/app backend/tests/Unit
git commit -m "feat(api): stop accepting the Hypertension / Diabetes program

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend: remove the NCD report and sidebar link

**Files:**
- Modify: `frontend/src/pages/bhc/BHCReports.jsx`
- Modify: `frontend/src/components/layout/sidebar/sidebarData.js:22`

**Interfaces:**
- Produces: `BHCReports.jsx` no longer imports `getHypertensionDiabeticData`, `formatHypertensionDiabeticClientStatus`, `formatHypertensionDiabeticCondition` or `isNcdRecord` (Task 7 deletes them).

- [ ] **Step 1: Remove the report definition and routing**

In `BHCReports.jsx`:
1. Delete the `REPORT_TYPES` entry `{ key: "ncd", slug: "ncd", label: "Hypertension and Diabetes Monitoring", description: ... }` (~lines 99-105).
2. Delete `case "ncd": return <NcdReportView {...props} />;` (~lines 468-469).
3. Delete the three aliases `"ncd-monitoring"`, `"hypertension-diabetic-monitoring"`, `"hypertension-and-diabetic-monitoring"` (~lines 498-500).
4. Delete the whole `function NcdReportView(...) { ... }` (~lines 902-958).
5. Delete `"Hypertension / Diabetic Monitoring",` from the service-type filter options (~line 1436).
6. Delete the `case "ncd": return [ ... ];` filter block (~lines 1509-1515).
7. Delete the whole `function normalizeHypertensionDiabeticReportRow(...) { ... }` (~lines 1551-1586).
8. Delete `function matchesCondition(...) { ... }` (~line 2429). Its only caller was `NcdReportView`.
9. Delete `conditionType: "",` from `EMPTY_FILTERS` (~line 162).
10. From the `healthRecordPrograms` import (~lines 40-56) remove `getHypertensionDiabeticData`, `formatHypertensionDiabeticClientStatus`, `formatHypertensionDiabeticCondition`, `isNcdRecord`.

In `sidebarData.js` delete the line `{ label: "Hypertension and Diabetes Monitoring", slug: "ncd" },`.

- [ ] **Step 2: Verify nothing references the removed pieces**

Run (from `frontend/`): `grep -n "ncd\|NcdReport\|HypertensionDiabetic\|conditionType\|matchesCondition" src/pages/bhc/BHCReports.jsx src/components/layout/sidebar/sidebarData.js`
Expected: no output.

- [ ] **Step 3: Lint and build**

Run: `npx eslint src/pages/bhc/BHCReports.jsx src/components/layout/sidebar/sidebarData.js && npm run build`
Expected: 0 errors. If ESLint reports an unused lucide icon import (for example `HeartPulse` or `FileHeart`), remove it only if the grep shows it has no other use in the file. Both are used by other reports today, so they should stay.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/bhc/BHCReports.jsx frontend/src/components/layout/sidebar/sidebarData.js
git commit -m "feat(reports): remove the Hypertension and Diabetes monitoring report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend: remove record display, filters and badges

**Files:**
- Modify: `frontend/src/components/features/health-records/HealthRecordClinicalDetails.jsx`
- Modify: `frontend/src/components/features/records/SpecializedRecordsTab.jsx`
- Modify: `frontend/src/components/features/health-records/recordDetailsHelpers.js:239-241`
- Modify: `frontend/src/pages/bhc/HealthRecords.jsx:233-236`
- Modify: `frontend/src/pages/bhc/FollowUps.jsx:256`
- Modify: `frontend/src/components/features/followups/followUpStatusStyles.jsx:259`
- Modify: `frontend/src/pages/bhc/PatientDetails.jsx:190-191` (comment only)

**Interfaces:**
- Produces: none of these files import `formatHypertensionDiabeticCondition`, `formatHypertensionDiabeticClientStatus`, `getHypertensionDiabeticData` or `isNcdRecord`.

- [ ] **Step 1: `HealthRecordClinicalDetails.jsx`**

1. Remove `formatHypertensionDiabeticCondition`, `getHypertensionDiabeticData`, `isNcdRecord as isNcdProgramRecord` from the `healthRecordPrograms` import (~lines 20-25).
2. Header comment (~line 70): change `(Prenatal, EPI, Family Planning, NCD, TB, General Consultation)` to `(Prenatal, EPI, Family Planning, TB, General Consultation)`.
3. Delete the `isHypertensionDiabeticRecord` constant (~lines 141-143) and change `isMaternalRecord` to:

```jsx
  const isMaternalRecord =
    patientClassification === "Maternal / Prenatal" ||
    (!isImmunizationRecord && isMaternalProgramRecord(record));
```

4. Delete the `if (isHypertensionDiabeticRecord) { return (<HypertensionDiabeticRecordDetails ... />); }` block (~lines 203-213).
5. Delete `function HypertensionDiabeticRecordDetails` (~lines 386-390), `function HypertensionDiabeticLegacyDetails` (~lines 406-487), the line `HypertensionDiabeticRecordDetails.Legacy = HypertensionDiabeticLegacyDetails;` (~line 489) and `function HypertensionDiabeticTabbedRecordDetails` (~lines 491-565). **Keep** the `RECORD_DETAIL_TABS` constant and its doc comment (~lines 392-404); other layouts use it.

- [ ] **Step 2: `SpecializedRecordsTab.jsx`**

1. Remove `getHypertensionDiabeticData`, `formatHypertensionDiabeticClientStatus`, `formatHypertensionDiabeticCondition` from the import (~lines 9, 17, 18).
2. Delete the `{program === "ncd" && ( <SpecializedSection ...> <NcdHistory .../> </SpecializedSection> )}` block (~lines 82-90).
3. Delete `function NcdHistory({ records }) { ... }` (~lines 396-425).
4. Run `npx eslint src/components/features/records/SpecializedRecordsTab.jsx`. Delete any helper it now reports as unused (candidates: `formatBp`, `getActionTaken`, `HeartPulse`), and only those.

- [ ] **Step 3: Small files**

`recordDetailsHelpers.js`: delete

```js
  if (normalized === "Hypertension / Diabetic Monitoring") {
    return "Hypertension / Diabetic Monitoring Record";
  }
```

Keep the `diabetes: "Diabetes"` / `hypertensive: "Hypertensive"` risk labels (~lines 712-715).

`HealthRecords.jsx`: delete the option object `{ value: "Hypertension / Diabetic Monitoring", label: "Hypertension / Diabetic Monitoring" },`.

`FollowUps.jsx`: delete the option string `"Hypertension / Diabetic Monitoring",`.

`followUpStatusStyles.jsx`: delete `"Hypertension / Diabetic Monitoring": "bg-blue-50 text-blue-700",`.

`PatientDetails.jsx` comment (~lines 190-191): change to
`// Programs Women's Health and Pediatric/EPI already own, so TB (which only`
`// appears once records exist) is the only extra enrollment to list.`

- [ ] **Step 4: Verify, lint and build**

Run: `grep -rn "HypertensionDiabetic\|isNcd\|NcdHistory\|Hypertension / Diabetic" src/components src/pages/bhc/HealthRecords.jsx src/pages/bhc/FollowUps.jsx src/pages/bhc/PatientDetails.jsx`
Expected: no output.
Run: `npx eslint src/components src/pages/bhc && npm run build`
Expected: 0 errors. `ConsultationWorkspace.jsx` still has its own references until Task 5, which is fine because it defines them locally.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components frontend/src/pages/bhc/HealthRecords.jsx frontend/src/pages/bhc/FollowUps.jsx frontend/src/pages/bhc/PatientDetails.jsx
git commit -m "feat(records): remove Hypertension / Diabetic record views and filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend: remove the program form from the consultation workspace

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`
- Modify: `frontend/src/components/features/health-records/wizard/ConsultationProgramPanel.jsx:18`

**Interfaces:**
- Consumes: `PROGRAM_CLASSIFICATIONS` from `utils/consultationPrograms` (still has Hypertension/Diabetes until Task 7, so the checkboxes stay visible until then; that's expected).
- Produces: the workspace sends no `hypertensionDiabeticData` in either the record body or `monitoringData`, and no `hypertensionDiabeticData` in the draft payload.

Line numbers below are from the baseline and shift as you delete. Find each edit by its quoted text.

- [ ] **Step 1: Constants and helpers**

1. `DRAFT_SUPPORTED_RECORD_TYPES` (~line 215): delete `"Hypertension / Diabetic Monitoring",`.
2. `RECORD_TYPE_DETAILS` (~lines 249-253): delete the `"Hypertension / Diabetic Monitoring": { title, description, icon: Zap }` entry. Then delete `Zap,` from the lucide import (~line 21) if `grep -n "Zap" src/pages/bhc/ConsultationWorkspace.jsx` shows no other use.
3. Delete `EMPTY_HYPERTENSION_DIABETIC_DATA` and `HYPERTENSION_DIABETIC_CONDITION_OPTIONS` (~lines 395-408).
4. In `normalizeRecordType` (~lines 687-696) delete the whole `if (lower.includes("senior") || lower.includes("ncd") || ... ) { return "Hypertension / Diabetic Monitoring"; }` block.
5. Delete `normalizeHypertensionDiabeticCondition`, `normalizeHypertensionDiabeticClientStatus` and `mergeHypertensionDiabeticData` (~lines 704-770, up to the closing `}` of `mergeHypertensionDiabeticData`).
6. **Keep** the prenatal risk keys `"diabetes"` / `"hypertensive"` (~lines 441-444 and 1850-1853).

- [ ] **Step 2: State, loading and drafts**

1. Delete `const [hypertensionDiabeticData, setHypertensionDiabeticData] = useState(EMPTY_HYPERTENSION_DIABETIC_DATA);` (~lines 1258-1260).
2. Legacy BP load (~lines 1387-1397). Replace

```jsx
      // Older Hypertension/Diabetic records stored the reading only as a
      // "120/80" string, with no systolic/diastolic vital signs to load from.
      const [legacySystolic = "", legacyDiastolic = ""] = String(
        found.hypertensionDiabeticData?.bp ||
          found.hypertension_diabetic_data?.bp ||
          "",
      )
        .split("/")
        .map((part) => part.replace(/[^\d.]/g, "").trim());
      setSystolicBp(found.systolicBp || legacySystolic);
      setDiastolicBp(found.diastolicBp || legacyDiastolic);
```

with

```jsx
      setSystolicBp(found.systolicBp || "");
      setDiastolicBp(found.diastolicBp || "");
```

(The Task 1 migration copied any blob-only reading into `vital_signs`.)
3. Delete the `existingHypertensionDiabeticData` constant and the `setHypertensionDiabeticData(mergeHypertensionDiabeticData(...))` call (~lines 1475-1487). **Keep** the `existingMonitoringData` line only if `grep` shows it is used below; otherwise delete it too.
4. Delete `const isHypertensionDiabetic = ...` (~lines 1622-1623).
5. Draft payload builder (~lines 1939-1946): delete the `hypertensionDiabeticData: pickDraftFields(hypertensionDiabeticData, [...]),` entry.
6. Draft restore (~lines 2027-2030): delete `setHypertensionDiabeticData({ ...EMPTY_HYPERTENSION_DIABETIC_DATA, ...(payload.hypertensionDiabeticData || {}) });`.

- [ ] **Step 3: Validation, save and handlers**

1. `getClinicalValidationErrors` (~lines 2665-2679): delete the whole `if (isHypertensionDiabetic) { ... }` block.
2. Chief-complaint condition (~line 2692): change `!isImmunization && !isFamilyPlanning && !isHypertensionDiabetic && !isMaternal && !isTb` to `!isImmunization && !isFamilyPlanning && !isMaternal && !isTb`.
3. Delete `function handleHypertensionDiabeticChange(field, value) { ... }` (~lines 2855-2858).
4. Chief-complaint fallback (~lines 3409-3411): delete the two lines
   `: effectiveHealthRecordType === "Hypertension / Diabetic Monitoring" && !chiefComplaint`
   `? "Hypertension / Diabetic Monitoring Visit"`.
5. Delete `const recordHypertensionDiabeticData = { ... };` (~lines 3510-3533). **Keep** `composedBloodPressure` only if `grep -n composedBloodPressure` shows another use; otherwise delete it and its comment too.
6. `medication:` (~lines 3580-3585) becomes:

```jsx
      medication:
        effectiveHealthRecordType === "Maternal"
          ? recordMaternalData.treatment || medication
          : medication,
```

7. Delete both `hypertensionDiabeticData: isHypertensionDiabetic ? recordHypertensionDiabeticData : null,` entries: the top-level one (~lines 3626-3629) and the one inside `monitoringData` (~lines 3636-3639).

- [ ] **Step 4: Program selection, treatment binding, panel status, review**

1. `wizardPrograms` description (~line 4168): replace `description: key === "Hypertension" ? "Monitoring and management of high blood pressure." : key === "Diabetes" ? "Monitoring and management of diabetes." : key === "EPI" ? ...` with `description: key === "EPI" ? ...` (keep the rest).
2. In `applyVisitPurpose` (~lines 4213-4215) and `handleProgramSelect` (~lines 4233-4235) delete the `if (programs.includes("Hypertension") || ...) { setHypertensionDiabeticData(...) }` blocks.
3. `isGeneralOnly` (~lines 4282-4287): remove the `!isHypertensionDiabetic &&` line.
4. `treatmentBindingFor` comment (~line 4291): change `(Maternal and\n  // Hypertension also mirror into \`medication\`, as they always did)` to `(Maternal also\n  // mirrors into \`medication\`, as it always did)`. Delete the `"Hypertension / Diabetic Monitoring": { value: ..., set: ... },` entry (~lines 4302-4308).
5. Program panel status (~lines 4426-4446): change the comment to `// Program panel: one status per form step, attached to each selected program that step covers.`. Delete the `|| (step.classification === "Hypertension / Diabetic Monitoring" && key === "hypertensionDiabeticData.bp")` clause, so `incomplete` is `invalidKeys.some((key) => getErrorOwnerStepKey(key) === step.key)`. Delete the `: step.classification === "Hypertension / Diabetic Monitoring" ? Boolean(systolicBp || diastolicBp)` branch.
6. Review rows (~line 4561): delete `"Hypertension / Diabetic Monitoring": hypertensionDiabeticData,`.

- [ ] **Step 5: JSX**

1. Vital Signs BP (~lines 4768-4771): delete the three-line `{/* Blood pressure is required when Hypertension / Diabetes is ... */}` comment and replace the `<BpInputGroup required={isHypertensionDiabetic} name="hypertensionDiabeticData.bp" ... />` element with:

```jsx
              <BpInputGroup name="bloodPressure" systolic={systolicBp} diastolic={diastolicBp} onSystolicChange={setSystolicBp} onDiastolicChange={setDiastolicBp} />
```

2. Delete the whole program block from `{!patientGateLocked && isHypertensionDiabetic && showProgramBlock("Hypertension / Diabetic Monitoring") && (` (~line 5581) through its matching `)}` (~line 5690, right before `{/* Clinical Assessment: one screen for every consultation. */}`).
3. General-only legacy form condition (~line 5813): remove `!isHypertensionDiabetic && `.
4. If `RadioChoiceGroup` is now unused (`grep -n RadioChoiceGroup` shows only the import), remove it from the import. It is still used at ~line 5458 today, so expect it to stay.

- [ ] **Step 6: `ConsultationProgramPanel.jsx`**

Line 18: `programs: ["TB", "Hypertension", "Diabetes"],` → `programs: ["TB"],`.

- [ ] **Step 7: Verify, lint, build, test**

Run: `grep -n -i "hypertensionDiabetic\|isHypertension\|Hypertension / Diabetic\|\"Hypertension\"\|\"Diabetes\"\|HPN\|fbs" src/pages/bhc/ConsultationWorkspace.jsx src/components/features/health-records/wizard/ConsultationProgramPanel.jsx`
Expected: no output. The remaining matches for `grep -n -i "diabet\|hypertens"` in the workspace should be only the prenatal risk keys `diabetes` / `hypertensive`.
Run: `npx eslint src/pages/bhc/ConsultationWorkspace.jsx src/components/features/health-records/wizard && npm run build && node --test src/utils/*.test.js`
Expected: 0 lint errors, build succeeds, all utils tests pass.

- [ ] **Step 8: Manual check** (run the app: `php artisan serve` in `backend/`, `npm run dev` in `frontend/`, log in as a BHW)

- Start a consultation, select **no program**, leave BP empty, and complete the required general fields. Expected: it saves. BP is not required.
- Start one each with **Maternal**, **TB**, **Family Planning** and **EPI** (eligible patient). Expected: each program form opens, validates and saves as before.
- Open `/…/reports?type=ncd`. Expected: the EPI report shows and nothing crashes.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/bhc/ConsultationWorkspace.jsx frontend/src/components/features/health-records/wizard/ConsultationProgramPanel.jsx
git commit -m "feat(consultation): remove the Hypertension / Diabetic program form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend: API service stops building the blob

**Files:**
- Modify: `frontend/src/services/healthRecordService.js`

**Interfaces:**
- Produces: normalized records have no `hypertensionDiabeticData` / `hypertension_diabetic_data`, and the save payload's `monitoring_data` never contains them.

- [ ] **Step 1: Remove**

1. Delete `function normalizeHypertensionDiabeticValue` (~lines 217-230), `function normalizeClientStatusValue` (~lines 232-235) and `function getHypertensionDiabeticData` (~lines 237-~325, through its closing `}`).
2. In the record normalizer (~lines 409-412) delete `const hypertensionDiabeticData = getHypertensionDiabeticData(record, monitoringData);`, and (~lines 577-578) delete `hypertensionDiabeticData,` and `hypertension_diabetic_data: hypertensionDiabeticData,`.
3. In the payload builder (~lines 720-723) delete `const hypertensionDiabeticData = getHypertensionDiabeticData(record, sourceMonitoringData);`, and in `monitoringData` (~lines 797-798) delete `hypertensionDiabeticData,` and `hypertension_diabetic_data: hypertensionDiabeticData,`.
4. In the `hasAny(record, [...])` key list (~lines 1203-1204) delete `"hypertensionDiabeticData",` and `"hypertension_diabetic_data",`.
5. `firstPresent` is still used elsewhere (lines 79-132), so keep it.

- [ ] **Step 2: Verify, lint, build**

Run: `grep -n -i "hypertens\|diabet" src/services/healthRecordService.js`
Expected: no output.
Run: `npx eslint src/services/healthRecordService.js && npm run build`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/healthRecordService.js
git commit -m "feat(api-client): stop sending hypertensionDiabeticData

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend: remove the program from shared utilities

**Files:**
- Modify: `frontend/src/utils/consultationPrograms.js`, `visitPurpose.js`, `consultationSteps.js`, `healthRecordPrograms.js`
- Test: `frontend/src/utils/consultationPrograms.test.js`, `visitPurpose.test.js`, `consultationSteps.test.js`, `healthRecordPrograms.test.js`

**Interfaces:**
- Produces: `Object.keys(PROGRAM_CLASSIFICATIONS)` is `["Maternal", "TB", "Family Planning", "EPI"]`; `Object.keys(VISIT_SERVICES)` is `["General", "Prenatal", "Postpartum", "EPI", "Family Planning", "TB"]`; `healthRecordPrograms.js` no longer exports `isNcdRecord`, `getHypertensionDiabeticData`, `normalizeHypertensionDiabeticCondition`, `formatHypertensionDiabeticCondition`, `normalizeHypertensionDiabeticClientStatus`, `formatHypertensionDiabeticClientStatus`; `SPECIALIZED_RECORD_PROGRAMS` keys are `epi, maternal, familyPlanning, tb`.

- [ ] **Step 1: Write the failing tests**

`consultationPrograms.test.js`: add `PROGRAM_CLASSIFICATIONS` to the import from `./consultationPrograms.js`, then **replace** the `legacy classifications still work...`, `one encounter exposes every program...` and `legacy DM metadata...` tests with:

```js
test("only the four remaining programs are selectable", () => {
  assert.deepEqual(Object.keys(PROGRAM_CLASSIFICATIONS), ["Maternal", "TB", "Family Planning", "EPI"]);
});

test("legacy classifications still work and explicit general visits stay general", () => {
  assert.deepEqual(getConsultationPrograms({ category: "Family Planning" }), ["Family Planning"]);
  assert.deepEqual(getConsultationPrograms({ category: "General Consultation", selectedPrograms: [] }), []);
});

test("a stale removed program is ignored, never shown", () => {
  const record = { id: 42, category: "Maternal", monitoring_data: { selectedPrograms: ["Maternal", "Hypertension", "Diabetes"] } };
  assert.deepEqual(getConsultationPrograms(record), ["Maternal"]);
  assert.equal(getServiceTypeLabel(record), "Maternal");
  assert.equal(getSpecializedRecordPrograms([record]).length, 1);
  assert.deepEqual(getConsultationPrograms({ category: "Hypertension / Diabetic Monitoring" }), []);
});
```

`visitPurpose.test.js`: add `VISIT_SERVICES` to the `./visitPurpose.js` import and append:

```js
test('Hypertension and Diabetes are no longer visit services', () => {
  assert.deepEqual(Object.keys(VISIT_SERVICES), ['General', 'Prenatal', 'Postpartum', 'EPI', 'Family Planning', 'TB']);
  assert.equal(serviceEligibility('Hypertension', patient('1980-01-01'), date).eligible, false);
});
```

`healthRecordPrograms.test.js`: change the import to

```js
import * as programs from "./healthRecordPrograms.js";
import {
  getSpecializedRecordPrograms,
  SPECIALIZED_RECORD_PROGRAMS,
} from "./healthRecordPrograms.js";
```

In `returns all applicable programs once and in the configured order`, delete `{ id: 3, category: "Hypertension / Diabetic Monitoring" },` (keep the remaining ids as they are). Append:

```js
test("the Hypertension / Diabetic program is gone from specialized records", () => {
  assert.deepEqual(SPECIALIZED_RECORD_PROGRAMS.map(({ key }) => key), ["epi", "maternal", "familyPlanning", "tb"]);
  for (const name of [
    "isNcdRecord",
    "getHypertensionDiabeticData",
    "normalizeHypertensionDiabeticCondition",
    "formatHypertensionDiabeticCondition",
    "normalizeHypertensionDiabeticClientStatus",
    "formatHypertensionDiabeticClientStatus",
  ]) {
    assert.equal(programs[name], undefined, name);
  }
  assert.deepEqual(getSpecializedRecordPrograms([{ id: 9, monitoring_data: { selectedPrograms: ["Hypertension"] } }]), []);
});
```

`consultationSteps.test.js`, where every Diabetes/HPN_DM case moves to TB, the other secondary form:
- Delete `const HPN_DM = programStepKey("Hypertension / Diabetic Monitoring");`.
- Rename the test `"MATERNAL + DIABETES: Program 1 Maternal, Program 2 Diabetes, then Treatment"` to `"MATERNAL + TB: Program 1 Maternal, Program 2 TB, then Treatment"`, with `walkForward(["Maternal", "TB"], "Maternal")` and `HPN_DM` → `TB` in the expected list. **Before editing, check** that an identical Maternal+TB walk test doesn't already exist (`grep -n 'walkForward(\["Maternal", "TB"\]' src/utils/consultationSteps.test.js`). If one exists, delete this test instead of renaming it.
- In `BACKWARD: ...`: `getProgramFormSteps(["Maternal", "Diabetes"], "Maternal")` → `getProgramFormSteps(["Maternal", "TB"], "Maternal")`, and replace any `HPN_DM` in its expected list with `TB`.
- Replace the `"Hypertension and Diabetes share one nested form"` test with:

```js
test("removed programs never produce a form", () => {
  assert.deepEqual(getProgramFormSteps(["Hypertension", "Diabetes"], "Hypertension"), []);
  assert.deepEqual(getProgramFormSteps(["Diabetes", "Maternal"], "Diabetes").map((step) => step.classification), ["Maternal"]);
});
```

- In the heading loop delete the rows `["Hypertension", ["Hypertension"], "Hypertension"],` and `["Diabetes", ["Diabetes"], "Diabetes"],`.
- `"several programs say where in the set the form is"`: use `["Maternal", "TB"]` in both calls; the second becomes `headingFor(TB, ["Maternal", "TB"], "Maternal", 1).title` expecting `"Program 2 of 2 · TB DOTS"`.
- Validation ownership: replace the two `hypertensionDiabeticData.*` asserts with
  `assert.equal(getErrorOwnerStepKey("hypertensionDiabeticData.conditionType"), null);`
  and in `findFirstErrorStepKey`, replace `"hypertensionDiabeticData.bp": "y"` with `pulse: "y"` (still owned by `INTERVIEW_STEP`).
- `deferral never touches unrelated errors...`: use `{ pulse: "Pulse required.", summaryOfPresentIllness: "x" }` and expect the keys `["pulse"]` and `["pulse", "summaryOfPresentIllness"]`.
- Draft restore stage list: change `["Program 2 (Hypertension / Diabetic)", HPN_DM],` to `["Program 2 (TB)", TB],`.
- `DRAFT RESTORE: the current program index survives the round trip`: use `const selected = ["Maternal", "TB"];` and replace `HPN_DM` with `TB` (3 places).
- `vitals errors stop the user on the first step`: use `{ pulse: "Pulse required.", chiefComplaint: "Required." }` and expect `["chiefComplaint", "pulse"]`.
- Add:

```js
test("a draft saved on the removed Hypertension / Diabetic form reopens on a real screen", () => {
  const sequence = getFormSequence(getProgramFormSteps(["Maternal"], "Maternal"));
  const stale = programStepKey("Hypertension / Diabetic Monitoring");
  assert.ok(sequence.includes(resolveFormStep(stale, sequence)));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `node --test src/utils/consultationPrograms.test.js src/utils/visitPurpose.test.js src/utils/healthRecordPrograms.test.js src/utils/consultationSteps.test.js`
Expected: FAIL. Examples: `only the four remaining programs` (keys still include Hypertension), `removed programs never produce a form` (returns one form), `Hypertension and Diabetes are no longer visit services`, and `the Hypertension / Diabetic program is gone` (`isNcdRecord` still exported).

- [ ] **Step 3: Implement**

`consultationPrograms.js`: delete the `Hypertension:` and `Diabetes:` entries from `PROGRAM_CLASSIFICATIONS`, and delete the whole `if (category === "Hypertension / Diabetic Monitoring") { ... }` block in `getConsultationPrograms`.

`visitPurpose.js`: delete `Hypertension: 'Hypertension Monitoring',` and `Diabetes: 'Diabetes Monitoring',` from `VISIT_SERVICES`. Then grep the file (`grep -n "Hypertension\|Diabetes" src/utils/visitPurpose.js`) and remove any remaining program-specific branch it shows.

`consultationSteps.js`:
- Delete the `"Hypertension / Diabetic Monitoring": { label, description }` entry from `PROGRAM_STEP_DETAILS`.
- `getProgramFormSteps` doc comment: replace `Hypertension and Diabetes are two programs but one\n * form, so picking both yields a single form.` with `Programs that share a classification share one form.`.
- `getErrorOwnerStepKey`: replace the comment with `// Interview and Vital Signs share the first step.`, delete the `|| key === "hypertensionDiabeticData.bp"` clause, and delete the `if (key.startsWith("hypertensionDiabeticData.")) { return programStepKey("Hypertension / Diabetic Monitoring"); }` block.

`healthRecordPrograms.js`:
- In the service-type formatter (~lines 170-182) delete the whole `if (normalized === "ncd" || ... || normalized.includes("senior citizen")) { return "Hypertension / Diabetic Monitoring"; }` block.
- In `getRecordSearchText` delete the `hypertensionDiabeticData` constant and its two array entries `hypertensionDiabeticData.conditionType,` / `hypertensionDiabeticData.condition_type,`.
- Delete `isNcdRecord`, `getHypertensionDiabeticData`, `normalizeHypertensionDiabeticCondition`, `formatHypertensionDiabeticCondition`, `normalizeHypertensionDiabeticClientStatus`, `formatHypertensionDiabeticClientStatus`. Delete `readFirstValue` and `formatBpFromParts` too if `grep -n "readFirstValue\|formatBpFromParts" src/utils/healthRecordPrograms.js` shows no remaining caller.
- `getSpecializedRecordType`: delete `if (isNcdRecord(record)) return "ncd";`.
- `SPECIALIZED_RECORD_PROGRAMS`: delete the `{ key: "ncd", label: "Hypertension / Diabetic" }` entry.
- `getSpecializedRecordPrograms` key map: delete `Hypertension: "ncd", Diabetes: "ncd",`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/utils/*.test.js`
Expected: all pass, 0 fail. `prenatalForm.test.js` and `patientProfile.test.js` are unchanged and still pass.
Run: `npx eslint . && npm run build`
Expected: 0 errors (the baseline's 1 warning is allowed), build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils
git commit -m "feat(programs): remove Hypertension / Diabetes from program utilities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, dev-database migration, final verification

**Files:**
- Modify: `docs/health-record-drafts.md`, `docs/ai/WORKFLOWS.md`, `docs/consultation-workflow-revision.md`, `docs/approved-workflow-ui-rework.md`

- [ ] **Step 1: Update docs**

Run: `grep -n -i "hypertens\|diabet\|ncd" docs/health-record-drafts.md docs/ai/WORKFLOWS.md docs/consultation-workflow-revision.md docs/approved-workflow-ui-rework.md`
For each hit that describes the **program** (selector entry, form, report, `hypertensionDiabeticData`, `Hypertension / Diabetic Monitoring` classification), delete it or reword it to list only Maternal, TB, Family Planning and EPI. Leave hits about prenatal risk factors or disease history alone. Add one line to `docs/health-record-drafts.md`: `The Hypertension / Diabetes program was removed on 2026-09-27; migration 2026_09_27_000001 stripped its data from records and drafts.`

- [ ] **Step 2: Run the migration on the dev database**

Run (from `backend/`): `php artisan migrate`
Expected: `2026_09_27_000001_remove_hypertension_diabetes_program ... DONE`. Then:

```bash
php artisan tinker --execute="echo DB::table('health_records')->where('monitoring_data','like','%hypertension%')->orWhere('monitoring_data','like','%Diabetes%')->orWhere('category','Hypertension / Diabetic Monitoring')->count();"
```

Expected: `0`. `storage/logs/laravel.log` shows `health_records_changed` (4 on the current dev data).

- [ ] **Step 3: Repo-wide grep (spec success criterion)**

Run (from repo root):

```bash
git grep -n -E "hypertensionDiabeticData|hypertension_diabetic_data|isNcdRecord|Hypertension / Diabetic|NcdReport|NcdHistory" -- ':!docs/superpowers' ':!backend/database/migrations/2026_09_27_000001_remove_hypertension_diabetes_program.php' ':!backend/tests/Feature/RemoveHypertensionDiabetesProgramMigrationTest.php' ':!backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php' ':!frontend/src/utils/*.test.js'
```

Expected: only the `HealthRecordRequest.php` comment if it still names the key (it shouldn't after Task 2), otherwise no output. Then `git grep -n -i -E "hypertens|diabet" -- frontend/src backend/app`. Every remaining hit must be a kept clinical field (prenatal risk factors, `recordDetailsHelpers.js` risk labels) or RHU "Senior Citizen" logic.

- [ ] **Step 4: Full test runs**

Run (from `backend/`): `php artisan test`. Expected: failing count ≤ 206 and every failure is in the baseline list.
Run (from `frontend/`): `node --test src/utils/*.test.js && npx eslint . && npm run build`. Expected: all pass, 0 lint errors, build OK.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: record removal of the Hypertension / Diabetes program

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
