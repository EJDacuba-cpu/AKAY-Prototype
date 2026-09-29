# Care Plan & Next Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BHC consultation's Disposition step with per-diagnosis Care Plan & Next Steps, backed by a patient-condition monitoring record, a Start Consultation modal, and one standard step-based flow for every visit — one visit, one ITR.

**Architecture:** Backend adds three tables (`condition_monitorings`, `condition_monitoring_visits`, `condition_monitoring_follow_up_task`), a `ConditionMonitoringService` called inside `HealthRecordController::store`'s existing transaction, and a minimal `GET /patients/{id}/care-overview`. Frontend puts all care-plan rules in a pure, unit-tested `utils/carePlan.js`, renders them in `CarePlanSection.jsx`, and adds `StartConsultationModal.jsx` in front of the existing workspace. The legacy follow-up form and dead flags are removed once every visit runs through the step flow.

**Tech Stack:** Laravel 13 / PHP 8.3 / PHPUnit (SQLite in-memory for tests, PostgreSQL/Supabase in deployment); React 19 + Vite 8 + TanStack Query 5; frontend tests are `node --test` on pure modules (no component test runner).

**Spec:** `docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md`

## Global Constraints

- One visit = one `health_records` row. A saved ITR is never updated by this feature, except the two `monitoring_data` keys `store()` already writes after referral creation.
- Care-plan values are exactly `none`, `monitor`, `refer`, `monitor_refer`. UI labels: "No Ongoing Tracking", "Monitor at BHC", "Refer to RHU", "Monitor at BHC + Refer to RHU".
- At most one referral and one follow-up task per consultation.
- At most one `active` `condition_monitorings` row per `(patient_id, condition_identity)`, enforced by a partial unique index.
- `condition_identity` = registry `conditionKey` when the diagnosis resolves to one, otherwise `"name:" + normalized name` (trim, lower-case, collapse whitespace — `ClinicalRegistry::normalizeNameKey`).
- Nothing clinical is derived: no diagnosis, alert, monitoring status or referral from FBS or from a diagnosis name. Defaults are UI defaults only.
- Category is service-based: primary Visit Service classification, else `General Consultation`. Monitoring never changes it.
- TB record detection = legacy category `TB DOTS / TB Monitoring` **or** non-empty `tb_data`.
- `care-overview` returns only the fields listed in the spec (plus `last_health_record_id` on monitoring entries, needed to prefill a continued TB card); no ITR bodies, vitals, diagnosis lists or referral data.
- New migrations enable RLS on PostgreSQL (Phase 2B posture, `docs/database-exposure-containment.md`) and are **not** run against Supabase without the developer's approval.
- Backend suite baseline: 540 tests, 201 pre-existing failures (list saved at the start of Task 1). A task may not add failures.
- Frontend: all `node --test` suites pass, `npx eslint .` has no new problems (one pre-existing warning in `pages/rhu/RHUAddHealthRecords.jsx`), `npx vite build` succeeds.
- The RHU record form (`pages/rhu/RHUAddHealthRecords.jsx`) and `NextActionSection.jsx` it uses are not modified.

## Review Focus

1. **The same condition typed twice in one visit** ("HTN" and "Hypertension", both Monitor) — expected: one monitoring record, one history row, no unique-index error. Test in Task 4.
2. **A continued monitoring record stopped elsewhere between opening the modal and saving** (stale id in `care_plan.continued_monitoring_ids`) — expected: 422 on `care_plan.continued_monitoring_ids.N` with a readable message, nothing saved. Test in Task 4.
3. **A draft resumed after its continued follow-up was already fulfilled by another ITR** — expected: the existing 409 `FOLLOW_UP_ALREADY_PROCESSED`, nothing saved. Test in Task 4.
4. **A diagnosis removed after it was set to Refer** — expected: it disappears from the referral set and the pre-filled reason; a stale care-plan entry keyed by the removed diagnosis id is ignored. Test in Task 7.
5. **FBS typed as text, negative, or absurdly large** (`"abc"`, `-5`, `5000`) — expected: 422 on `vital_signs.fbs` for the first two; `5000` rejected by `max:1000`. Test in Task 3.

---

## File Structure

**Backend — create**
- `backend/database/migrations/2026_09_30_000002_create_condition_monitoring_tables.php` — three tables, partial unique index, pgsql CHECK + RLS.
- `backend/app/Models/ConditionMonitoring.php` — the monitoring record.
- `backend/app/Models/ConditionMonitoringVisit.php` — append-only history row.
- `backend/app/Services/CarePlan.php` — care-plan value constants and predicates (`monitors`, `refers`, `monitorsAny`).
- `backend/app/Services/MonitoringDetails.php` — per-`monitoring_details` key required fields (`tb_dots`).
- `backend/app/Services/ConditionMonitoringService.php` — lock continued records, start/continue/stop, link follow-up task.
- `backend/app/Http/Controllers/Api/CareOverviewController.php` — `GET /patients/{patient}/care-overview`.
- Tests: `backend/tests/Feature/ConditionMonitoringSchemaTest.php`, `backend/tests/Feature/CarePlanValidationTest.php`, `backend/tests/Feature/CarePlanSaveTest.php`, `backend/tests/Feature/CarePlanReferralFollowUpTest.php`, `backend/tests/Feature/CareOverviewTest.php`, `backend/tests/Feature/TbRecordDetectionTest.php`.

**Backend — modify**
- `backend/config/clinical_registry.php` — `monitoring_details` on `tuberculosis`; (Task 12) remove `surveillance_diseases`.
- `backend/app/Services/ClinicalRegistry.php` — `conditionIdentity()`, `monitoringDetailsFor()`; (Task 12) remove surveillance methods.
- `backend/app/Http/Requests/HealthRecordRequest.php` — new rules, TB-required fields driven by monitoring details, referral+follow-up rule.
- `backend/app/Services/HealthRecordDraftPayloadService.php` — draft schema for `care_plan`, `carePlan`, `includeInSurveillance`, `fbs`.
- `backend/app/Services/FollowUpTaskSyncService.php` — lock/fulfil additional tasks; keep follow-up when a referred visit also monitors.
- `backend/app/Http/Controllers/Api/HealthRecordController.php` — call the service in `store()`; referral disposition keeps the follow-up when monitoring; TB category filter.
- `backend/app/Http/Middleware/EnforceActionPermissions.php`, `backend/routes/api.php` — care-overview route.
- `backend/app/Services/ConsultationPrograms.php` — drop `TB`.
- `backend/app/Models/FollowUpTask.php` — `conditionMonitorings()` relation.

**Frontend — create**
- `frontend/src/utils/carePlan.js` (+ `carePlan.test.js`) — every care-plan rule as pure functions.
- `frontend/src/utils/monitoringDetails.js` (+ test) — `monitoring_details` key metadata and which keys a visit needs.
- `frontend/src/utils/tbRecords.js` (+ test) — `isTbRecord(record)`.
- `frontend/src/utils/startConsultation.js` (+ test) — modal skip logic and selection → route params.
- `frontend/src/services/careOverviewService.js` — `getCareOverview(patientId)`.
- `frontend/src/components/features/health-records/wizard/CarePlanSection.jsx` — Care Plan & Next Steps UI.
- `frontend/src/components/features/health-records/wizard/MonitoringDetailsForms.jsx` — key → form component map.
- `frontend/src/components/features/patients/profile/StartConsultationModal.jsx` — the modal.

**Frontend — modify**
- `frontend/src/utils/consultationSteps.js` (+ test) — drop `generalSelected`, add `MONITORING_STEP`, rename Disposition.
- `frontend/src/utils/consultationPrograms.js` (+ test) — drop `TB`.
- `frontend/src/utils/consultationRoute.js` (+ test) — `continue` route kind.
- `frontend/src/utils/diagnoses.js` (+ test) — keep `carePlan` / `includeInSurveillance` in `normalizeDiagnoses`.
- `frontend/src/services/healthRecordService.js` — send `care_plan`, `vital_signs.fbs`, `tb_data` by presence.
- `frontend/src/pages/bhc/ConsultationWorkspace.jsx` — wire everything; remove legacy branches.
- `frontend/src/components/features/health-records/wizard/ConsultationProgramPanel.jsx` — Barangay Health Services.
- `frontend/src/components/features/patients/profile/PatientProfileHeader.jsx`, `frontend/src/hooks/usePatientConsultation.js` — open the modal.
- `frontend/src/components/features/followups/followUpStatusStyles.jsx` — "Record Visit" opens the step flow with that task continued.
- `frontend/src/utils/healthRecordPrograms.js`, `frontend/src/components/features/records/SpecializedRecordsTab.jsx`, `frontend/src/pages/bhc/BHCReports.jsx`, `frontend/src/utils/surveillance.js` — TB detection and surveillance report.
- Delete: `frontend/src/components/features/health-records/PurposeOfVisitModal.jsx` (Task 11).

---

## Phase 1 — Backend

### Task 1: Monitoring tables and models

**Files:**
- Create: `backend/database/migrations/2026_09_30_000002_create_condition_monitoring_tables.php`
- Create: `backend/app/Models/ConditionMonitoring.php`, `backend/app/Models/ConditionMonitoringVisit.php`
- Modify: `backend/app/Models/FollowUpTask.php` (add relation after `rescheduledTo()`)
- Test: `backend/tests/Feature/ConditionMonitoringSchemaTest.php`

**Interfaces:**
- Produces: `ConditionMonitoring::STATUS_ACTIVE = 'active'`, `STATUS_STOPPED = 'stopped'`; relations `patient()`, `visits()` (hasMany `ConditionMonitoringVisit`), `followUpTasks()` (belongsToMany `FollowUpTask`, pivot `condition_monitoring_follow_up_task`). `ConditionMonitoringVisit::ACTION_STARTED|ACTION_CONTINUED|ACTION_STOPPED`, `$timestamps = false`, casts `referred` bool, `created_at` datetime. `FollowUpTask::conditionMonitorings()`.

- [ ] **Step 1: Record the backend baseline**

Run (from `backend/`):
```bash
php artisan test --compact > ../.scratch-baseline.txt 2>&1; grep -o '"test":"[^"]*"' ../.scratch-baseline.txt | sort > ../.scratch-baseline-fail.txt; wc -l < ../.scratch-baseline-fail.txt
```
Expected: about 206 lines (201 failures; some names repeat). Keep `../.scratch-baseline-fail.txt` (untracked) for every later task's comparison; delete both files after Task 13.

- [ ] **Step 2: Write the failing test**

`backend/tests/Feature/ConditionMonitoringSchemaTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConditionMonitoringSchemaTest extends TestCase
{
    use RefreshDatabase;

    private function fixture(): array
    {
        $rhu = RuralHealthUnit::create(['name' => 'Mon RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Mon BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $patient = Patient::create(['first_name' => 'Mon', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $bhc->id]);

        return [$patient, $record];
    }

    private function monitoring(Patient $patient, HealthRecord $record, string $status = 'active'): ConditionMonitoring
    {
        return ConditionMonitoring::create([
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $patient->barangay_health_center_id,
            'condition_key' => 'hypertension',
            'condition_name' => 'Hypertension',
            'condition_identity' => 'hypertension',
            'status' => $status,
            'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);
    }

    public function test_only_one_active_record_per_patient_and_condition(): void
    {
        [$patient, $record] = $this->fixture();
        $this->monitoring($patient, $record);

        $this->expectException(QueryException::class);
        $this->monitoring($patient, $record);
    }

    public function test_a_stopped_record_does_not_block_a_new_active_one(): void
    {
        [$patient, $record] = $this->fixture();
        $this->monitoring($patient, $record, 'stopped');

        $this->assertSame('active', $this->monitoring($patient, $record)->status);
    }

    public function test_history_rows_and_follow_up_links(): void
    {
        [$patient, $record] = $this->fixture();
        $monitoring = $this->monitoring($patient, $record);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => true, 'created_at' => now()]);

        $this->assertTrue($monitoring->visits()->sole()->referred);
    }
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `php artisan test --filter=ConditionMonitoringSchemaTest`
Expected: FAIL — `Class "App\Models\ConditionMonitoring" not found`.

- [ ] **Step 4: Write the migration**

`backend/database/migrations/2026_09_30_000002_create_condition_monitoring_tables.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * BHC monitoring of one patient condition, started/continued/stopped only by
 * saving a consultation (HealthRecordController::store, same transaction).
 * Separate from medical_background.currentDiseases, which owns the clinical
 * status (Active / Controlled / Resolved). See
 * docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('condition_monitorings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('barangay_health_center_id')->constrained()->cascadeOnDelete();
            $table->string('condition_key', 64)->nullable();
            $table->string('condition_name', 150);
            // conditionKey, else "name:" + normalized name - what "same condition" means.
            $table->string('condition_identity', 160);
            $table->string('status', 20)->default('active'); // active|stopped
            $table->foreignId('started_health_record_id')->constrained('health_records')->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->foreignId('stopped_health_record_id')->nullable()->constrained('health_records')->nullOnDelete();
            $table->timestamp('stopped_at')->nullable();
            $table->string('stop_reason', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['patient_id', 'status'], 'condition_monitorings_patient_status_idx');
        });

        // The database is the one place "one active record per patient and
        // condition" is truly guaranteed. Partial indexes work on PostgreSQL and
        // SQLite; the schema builder has no API for the WHERE clause.
        DB::statement(
            'CREATE UNIQUE INDEX condition_monitorings_one_active_idx '
            .'ON condition_monitorings (patient_id, condition_identity) '
            ."WHERE status = 'active'"
        );

        Schema::create('condition_monitoring_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('condition_monitoring_id')->constrained()->cascadeOnDelete();
            $table->foreignId('health_record_id')->constrained()->cascadeOnDelete();
            $table->string('action', 20); // started|continued|stopped
            $table->boolean('referred')->default(false);
            $table->timestamp('created_at');

            $table->unique(['condition_monitoring_id', 'health_record_id'], 'condition_monitoring_visits_unique');
        });

        Schema::create('condition_monitoring_follow_up_task', function (Blueprint $table) {
            $table->foreignId('condition_monitoring_id')->constrained()->cascadeOnDelete();
            $table->foreignId('follow_up_task_id')->constrained()->cascadeOnDelete();

            $table->primary(['condition_monitoring_id', 'follow_up_task_id']);
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("ALTER TABLE public.condition_monitorings ADD CONSTRAINT condition_monitorings_status_check CHECK (status IN ('active', 'stopped'))");
        DB::statement("ALTER TABLE public.condition_monitoring_visits ADD CONSTRAINT condition_monitoring_visits_action_check CHECK (action IN ('started', 'continued', 'stopped'))");
        foreach (['condition_monitorings', 'condition_monitoring_visits', 'condition_monitoring_follow_up_task'] as $table) {
            DB::statement("ALTER TABLE public.$table ENABLE ROW LEVEL SECURITY");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('condition_monitoring_follow_up_task');
        Schema::dropIfExists('condition_monitoring_visits');
        Schema::dropIfExists('condition_monitorings');
    }
};
```

- [ ] **Step 5: Write the models**

`backend/app/Models/ConditionMonitoring.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * BHC monitoring of one patient condition. Changed only by saving a
 * consultation (App\Services\ConditionMonitoringService). Never carries the
 * clinical status - that stays in Current Conditions.
 */
class ConditionMonitoring extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_STOPPED = 'stopped';

    protected $fillable = [
        'patient_id', 'barangay_health_center_id', 'condition_key', 'condition_name',
        'condition_identity', 'status', 'started_health_record_id', 'started_at',
        'stopped_health_record_id', 'stopped_at', 'stop_reason', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'stopped_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function visits(): HasMany
    {
        return $this->hasMany(ConditionMonitoringVisit::class);
    }

    public function followUpTasks(): BelongsToMany
    {
        return $this->belongsToMany(FollowUpTask::class, 'condition_monitoring_follow_up_task');
    }
}
```

`backend/app/Models/ConditionMonitoringVisit.php`:
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Append-only: one row per ITR that started, continued or stopped a monitoring record. */
class ConditionMonitoringVisit extends Model
{
    public const ACTION_STARTED = 'started';

    public const ACTION_CONTINUED = 'continued';

    public const ACTION_STOPPED = 'stopped';

    public $timestamps = false;

    protected $fillable = ['condition_monitoring_id', 'health_record_id', 'action', 'referred', 'created_at'];

    protected $casts = [
        'referred' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function monitoring(): BelongsTo
    {
        return $this->belongsTo(ConditionMonitoring::class, 'condition_monitoring_id');
    }

    public function healthRecord(): BelongsTo
    {
        return $this->belongsTo(HealthRecord::class);
    }
}
```

In `backend/app/Models/FollowUpTask.php`, directly after the `rescheduledTo()` method, add:
```php
    public function conditionMonitorings(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(ConditionMonitoring::class, 'condition_monitoring_follow_up_task');
    }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `php artisan test --filter=ConditionMonitoringSchemaTest`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/database/migrations/2026_09_30_000002_create_condition_monitoring_tables.php backend/app/Models/ConditionMonitoring.php backend/app/Models/ConditionMonitoringVisit.php backend/app/Models/FollowUpTask.php backend/tests/Feature/ConditionMonitoringSchemaTest.php
git commit -m "feat(care-plan): add condition monitoring tables and models"
```

### Task 2: Registry identity and monitoring-details declarations

**Files:**
- Modify: `backend/config/clinical_registry.php` (tuberculosis entry)
- Modify: `backend/app/Services/ClinicalRegistry.php`
- Create: `backend/app/Services/CarePlan.php`, `backend/app/Services/MonitoringDetails.php`
- Test: `backend/tests/Unit/Services/ClinicalRegistryTest.php` (append), `backend/tests/Unit/Services/CarePlanTest.php`

**Interfaces:**
- Produces: `ClinicalRegistry::conditionIdentity(?string $conditionKey, string $name): string`; `ClinicalRegistry::monitoringDetailsFor(?string $conditionKey): ?string`; `CarePlan::VALUES = ['none','monitor','refer','monitor_refer']`, `CarePlan::monitors(?string): bool`, `CarePlan::refers(?string): bool`, `CarePlan::monitorsAny(array $diagnoses): bool`, `CarePlan::refersAny(array $diagnoses): bool`; `MonitoringDetails::REQUIRED_FIELDS` (`['tb_dots' => ['tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart']]`).

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/Unit/Services/ClinicalRegistryTest.php` (inside the class):
```php
    public function test_condition_identity_prefers_the_registry_key(): void
    {
        $registry = $this->registry();
        $this->assertSame('hypertension', $registry->conditionIdentity('hypertension', 'HTN'));
        $this->assertSame('name:post-op wound care', $registry->conditionIdentity(null, '  Post-op   Wound Care '));
    }

    public function test_only_tuberculosis_declares_monitoring_details(): void
    {
        $registry = $this->registry();
        $this->assertSame('tb_dots', $registry->monitoringDetailsFor('tuberculosis'));
        $this->assertNull($registry->monitoringDetailsFor('hypertension'));
        $this->assertNull($registry->monitoringDetailsFor(null));
    }
```

`backend/tests/Unit/Services/CarePlanTest.php`:
```php
<?php

namespace Tests\Unit\Services;

use App\Services\CarePlan;
use PHPUnit\Framework\TestCase;

class CarePlanTest extends TestCase
{
    public function test_predicates(): void
    {
        $this->assertTrue(CarePlan::monitors('monitor'));
        $this->assertTrue(CarePlan::monitors('monitor_refer'));
        $this->assertFalse(CarePlan::monitors('refer'));
        $this->assertFalse(CarePlan::monitors(null));
        $this->assertTrue(CarePlan::refers('refer'));
        $this->assertTrue(CarePlan::refers('monitor_refer'));
        $this->assertFalse(CarePlan::refers('none'));
    }

    public function test_any_helpers_read_diagnosis_entries(): void
    {
        $diagnoses = [['name' => 'A', 'carePlan' => 'none'], ['name' => 'B', 'carePlan' => 'monitor_refer'], 'junk'];
        $this->assertTrue(CarePlan::monitorsAny($diagnoses));
        $this->assertTrue(CarePlan::refersAny($diagnoses));
        $this->assertFalse(CarePlan::monitorsAny([['name' => 'A']]));
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --filter="ClinicalRegistryTest|CarePlanTest"`
Expected: FAIL — undefined method `conditionIdentity`, class `CarePlan` not found.

- [ ] **Step 3: Implement**

In `backend/config/clinical_registry.php`, inside `'tuberculosis' => [...]`, after the `'aliases' => [...]` array add:
```php
            // Extra fields the ITR does not hold: Monitoring Details renders the
            // DS-TB Treatment Card (health_records.tb_data) for this key.
            'monitoring_details' => 'tb_dots',
```
and in the header comment block add one line after the monitored_conditions bullet: `|   An entry may declare monitoring_details: the key of the extra form a monitored visit needs.`

In `backend/app/Services/ClinicalRegistry.php`, after `isValidSurveillanceKey()` add:
```php
    /** What "same condition" means for monitoring: the registry key, else the normalized name. */
    public function conditionIdentity(?string $conditionKey, string $name): string
    {
        return $conditionKey !== null && $this->isValidConditionKey($conditionKey)
            ? $conditionKey
            : 'name:'.self::normalizeNameKey($name);
    }

    /** The Monitoring Details form key a monitored condition needs, or null. */
    public function monitoringDetailsFor(?string $conditionKey): ?string
    {
        return $this->monitoredConditions()[$conditionKey]['monitoring_details'] ?? null;
    }
```

`backend/app/Services/CarePlan.php`:
```php
<?php

namespace App\Services;

/**
 * The per-diagnosis care-plan choice (health_records.diagnoses[].carePlan).
 * See docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 */
final class CarePlan
{
    public const NONE = 'none';

    public const MONITOR = 'monitor';

    public const REFER = 'refer';

    public const MONITOR_REFER = 'monitor_refer';

    public const VALUES = [self::NONE, self::MONITOR, self::REFER, self::MONITOR_REFER];

    public static function monitors(?string $value): bool
    {
        return $value === self::MONITOR || $value === self::MONITOR_REFER;
    }

    public static function refers(?string $value): bool
    {
        return $value === self::REFER || $value === self::MONITOR_REFER;
    }

    public static function monitorsAny(array $diagnoses): bool
    {
        foreach ($diagnoses as $diagnosis) {
            if (is_array($diagnosis) && self::monitors($diagnosis['carePlan'] ?? null)) {
                return true;
            }
        }

        return false;
    }

    public static function refersAny(array $diagnoses): bool
    {
        foreach ($diagnoses as $diagnosis) {
            if (is_array($diagnosis) && self::refers($diagnosis['carePlan'] ?? null)) {
                return true;
            }
        }

        return false;
    }
}
```

`backend/app/Services/MonitoringDetails.php`:
```php
<?php

namespace App\Services;

/**
 * Fields a Monitoring Details form must complete, per the monitoring_details
 * key a registered condition declares (config/clinical_registry.php). A new
 * specialized workflow adds one entry here and one form on the frontend
 * (components/features/health-records/wizard/MonitoringDetailsForms.jsx).
 */
final class MonitoringDetails
{
    public const REQUIRED_FIELDS = [
        'tb_dots' => ['tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart'],
    ];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `php artisan test --filter="ClinicalRegistryTest|CarePlanTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/config/clinical_registry.php backend/app/Services/ClinicalRegistry.php backend/app/Services/CarePlan.php backend/app/Services/MonitoringDetails.php backend/tests/Unit/Services/ClinicalRegistryTest.php backend/tests/Unit/Services/CarePlanTest.php
git commit -m "feat(care-plan): condition identity, care-plan values, monitoring-details declarations"
```

### Task 3: Request and draft validation

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`
- Modify: `backend/app/Services/HealthRecordDraftPayloadService.php`
- Test: `backend/tests/Feature/CarePlanValidationTest.php`

**Interfaces:**
- Consumes: `CarePlan::VALUES`, `CarePlan::monitors`, `ClinicalRegistry::matchCondition`, `ClinicalRegistry::monitoringDetailsFor`, `MonitoringDetails::REQUIRED_FIELDS`, `ConditionMonitoring` (to find the condition key of a continued record).
- Produces (request shape later tasks rely on):
  - `diagnoses.*.carePlan` ∈ `CarePlan::VALUES` (nullable; null = `none`)
  - `diagnoses.*.includeInSurveillance` boolean
  - `vital_signs.fbs` numeric, `min:0`, `max:1000`, nullable
  - `care_plan.continued_follow_up_task_ids.*` integer, distinct
  - `care_plan.continued_monitoring_ids.*` integer, distinct
  - `care_plan.monitoring_stops.*.monitoring_id` integer, required; `care_plan.monitoring_stops.*.reason` required, string, max 500, not whitespace-only
  - Draft payload keys: `carePlan` block `{continuedFollowUpTaskIds[], continuedMonitoringIds[], monitoringStops[{monitoringId, reason}]}`, `fbs`, and per-diagnosis `carePlan`, `includeInSurveillance`.

- [ ] **Step 1: Write the failing test**

`backend/tests/Feature/CarePlanValidationTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CarePlanValidationTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'CP RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'CP BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'CP BHW', 'email' => 'cp@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'CP', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function store(array $extra)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Check-up',
            ...$extra,
        ]);
    }

    public function test_unknown_care_plan_value_is_rejected(): void
    {
        $this->store(['diagnoses' => [['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'watch']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.carePlan']);
    }

    public function test_fbs_must_be_a_sane_number(): void
    {
        foreach (['abc', -5, 5000] as $value) {
            $this->store(['vital_signs' => ['fbs' => $value]])
                ->assertUnprocessable()->assertJsonValidationErrors(['vital_signs.fbs']);
        }
    }

    public function test_fbs_is_stored_and_nothing_is_derived_from_it(): void
    {
        $id = $this->store(['vital_signs' => ['fbs' => 250]])->assertCreated()->json('data.id');

        $record = \App\Models\HealthRecord::findOrFail($id);
        $this->assertEquals(250, $record->vital_signs['fbs']);
        $this->assertSame([], $record->diagnoses ?? []);
        $this->assertSame(0, \App\Models\ConditionMonitoring::count());
    }

    public function test_a_stop_needs_a_real_reason(): void
    {
        $this->store(['care_plan' => ['monitoring_stops' => [['monitoring_id' => 1, 'reason' => '   ']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_stops.0.reason']);
    }

    public function test_monitored_tb_requires_its_monitoring_details(): void
    {
        $this->store(['diagnoses' => [['id' => 'd1', 'name' => 'PTB', 'carePlan' => 'monitor']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart']);
    }

    public function test_tb_diagnosis_without_monitoring_needs_no_tb_card(): void
    {
        $this->store(['diagnoses' => [['id' => 'd1', 'name' => 'PTB', 'carePlan' => 'refer']], 'needs_referral' => false])
            ->assertCreated();
    }

    public function test_care_plan_round_trips_through_a_draft(): void
    {
        $draft = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id, 'classification' => 'General Consultation',
            'payload' => [
                'chiefComplaint' => 'Check-up',
                'fbs' => '126',
                'diagnoses' => [['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'monitor', 'includeInSurveillance' => true]],
                'carePlan' => ['continuedFollowUpTaskIds' => [], 'continuedMonitoringIds' => [7], 'monitoringStops' => [['monitoringId' => 7, 'reason' => 'Moved away']]],
            ],
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/health-record-drafts/$draft")->assertOk()
            ->assertJsonPath('data.payload.fbs', '126')
            ->assertJsonPath('data.payload.diagnoses.0.carePlan', 'monitor')
            ->assertJsonPath('data.payload.diagnoses.0.includeInSurveillance', true)
            ->assertJsonPath('data.payload.carePlan.monitoringStops.0.reason', 'Moved away');
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --filter=CarePlanValidationTest`
Expected: FAIL (unknown carePlan accepted, fbs accepted, TB not required, draft keys dropped).

- [ ] **Step 3: Implement the request rules**

In `HealthRecordRequest::rules()`:
- After `'vital_signs.height' => [...]` add:
```php
            // Additional Measurements: optional, reused by Diabetes monitoring
            // and reports. Nothing is ever derived from it.
            'vital_signs.fbs' => ['nullable', 'numeric', 'min:0', 'max:1000'],
```
- After `'diagnoses.*.reportAs' => [...]` add:
```php
            // Care Plan & Next Steps, per diagnosis. null = no ongoing tracking.
            'diagnoses.*.carePlan' => ['nullable', 'string', Rule::in(\App\Services\CarePlan::VALUES)],
            'diagnoses.*.includeInSurveillance' => ['nullable', 'boolean'],
            // Existing follow-ups / monitoring this ITR continues (Start
            // Consultation modal), and the monitoring it stops.
            'care_plan' => ['nullable', 'array'],
            'care_plan.continued_follow_up_task_ids' => ['nullable', 'array', 'max:20'],
            'care_plan.continued_follow_up_task_ids.*' => ['integer', 'distinct'],
            'care_plan.continued_monitoring_ids' => ['nullable', 'array', 'max:20'],
            'care_plan.continued_monitoring_ids.*' => ['integer', 'distinct'],
            'care_plan.monitoring_stops' => ['nullable', 'array', 'max:20'],
            'care_plan.monitoring_stops.*.monitoring_id' => ['required', 'integer', 'distinct'],
            'care_plan.monitoring_stops.*.reason' => ['required', 'string', 'max:500', 'regex:/\S/'],
```

In `withValidator()`'s `after` closure, replace the block
```php
            if (in_array('TB', $programs)) {
                $required = [...$required, 'tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart'];
            }
```
with
```php
            foreach ($this->monitoringDetailKeys() as $detailsKey) {
                $required = [...$required, ...(\App\Services\MonitoringDetails::REQUIRED_FIELDS[$detailsKey] ?? [])];
            }
```
and change the message loop so it names the new source:
```php
            foreach (array_unique($required) as $field) {
                if (blank($this->input($field))) {
                    $validator->errors()->add($field, 'Complete this required field.');
                }
            }
```

Add this private method to the class:
```php
    /**
     * Monitoring Details forms this visit needs: one per distinct
     * monitoring_details key among conditions monitored now - diagnoses set to
     * Monitor, plus continued monitoring records that are not being stopped.
     *
     * @return array<int, string>
     */
    private function monitoringDetailKeys(): array
    {
        $registry = app(\App\Services\ClinicalRegistry::class);
        $keys = [];
        foreach ($this->input('diagnoses', []) as $diagnosis) {
            if (! is_array($diagnosis) || ! \App\Services\CarePlan::monitors($diagnosis['carePlan'] ?? null)) {
                continue;
            }
            $match = $registry->matchCondition($diagnosis['name'] ?? null);
            $keys[] = $registry->monitoringDetailsFor($match['key'] ?? null);
        }

        $stopped = array_map('intval', array_column($this->input('care_plan.monitoring_stops', []) ?: [], 'monitoring_id'));
        $continued = array_diff(array_map('intval', $this->input('care_plan.continued_monitoring_ids', []) ?: []), $stopped);
        if ($continued !== []) {
            $conditionKeys = \App\Models\ConditionMonitoring::query()
                ->whereIn('id', $continued)
                ->where('patient_id', (int) $this->input('patient_id'))
                ->pluck('condition_key');
            foreach ($conditionKeys as $conditionKey) {
                $keys[] = $registry->monitoringDetailsFor($conditionKey);
            }
        }

        return array_values(array_unique(array_filter($keys)));
    }
```

- [ ] **Step 4: Implement the draft schema**

In `HealthRecordDraftPayloadService::SCHEMA`:
- Next to the other vital-sign scalars (`'systolicBp' => self::SCALAR,` …) add `'fbs' => self::SCALAR,`.
- In the `'diagnoses' => ['*' => [...]]` entry add `'carePlan' => self::SCALAR,` and `'includeInSurveillance' => self::SCALAR,`. (Run `grep -n "'diagnoses' =>" backend/app/Services/HealthRecordDraftPayloadService.php` to find it.)
- Before `'referralForm' => [` add:
```php
        // Care Plan & Next Steps: what this consultation continues or stops.
        'carePlan' => [
            'continuedFollowUpTaskIds' => ['*' => self::SCALAR],
            'continuedMonitoringIds' => ['*' => self::SCALAR],
            'monitoringStops' => ['*' => [
                'monitoringId' => self::SCALAR,
                'reason' => self::SCALAR,
            ]],
        ],
```

- [ ] **Step 5: Run to verify pass**

Run: `php artisan test --filter=CarePlanValidationTest`
Expected: PASS (7 tests). Then run the full suite and compare with the baseline:
```bash
php artisan test --compact > ../.scratch-after.txt 2>&1; grep -o '"test":"[^"]*"' ../.scratch-after.txt | sort | comm -13 ../.scratch-baseline-fail.txt -
```
Expected: no output (no new failures).

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Requests/HealthRecordRequest.php backend/app/Services/HealthRecordDraftPayloadService.php backend/tests/Feature/CarePlanValidationTest.php
git commit -m "feat(care-plan): validate per-diagnosis care plan, FBS, and continued items"
```

### Task 4: Save flow — start / continue / stop monitoring, continued follow-ups

**Files:**
- Create: `backend/app/Services/ConditionMonitoringService.php`
- Modify: `backend/app/Services/FollowUpTaskSyncService.php`
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php` (`store()` and one new private method)
- Test: `backend/tests/Feature/CarePlanSaveTest.php`

**Interfaces:**
- Consumes: Task 1 models, `ClinicalRegistry::conditionIdentity`, `CarePlan::monitors/refers`.
- Produces:
  - `ConditionMonitoringService::lockContinued(Patient $patient, array $monitoringIds): Collection` — locked `ConditionMonitoring` rows keyed by id; throws `ValidationException` on `care_plan.continued_monitoring_ids.N` if any is missing, another patient's, or not active.
  - `ConditionMonitoringService::apply(Patient $patient, HealthRecord $record, array $diagnoses, Collection $continued, array $stops, User $user): Collection` — returns the monitoring records **active after this visit** that this visit started or continued.
  - `ConditionMonitoringService::linkFollowUpTask(HealthRecord $record, Collection $monitorings): void`.
  - `FollowUpTaskSyncService::lockAdditionalTasks(array $taskIds, Patient $patient, User $user, ?FollowUpTask $alreadyLocked): Collection` and `FollowUpTaskSyncService::fulfillTasks(Collection $tasks, HealthRecord $record, ?User $user): void`.
  - Continued follow-up semantics: the client sends the **first** selected task as `monitoring_data.followUpTaskId` with `visit_type = follow_up_visit` and `parent_health_record_id` = that task's `health_record_id` (existing lock/fulfil path, unchanged); every selected task id also goes in `care_plan.continued_follow_up_task_ids`. A visit that continues only monitoring stays `initial_consultation` with no parent (the existing validator requires a task for `follow_up_visit`); its links live in `condition_monitoring_visits`.

- [ ] **Step 1: Write the failing test**

`backend/tests/Feature/CarePlanSaveTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CarePlanSaveTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private Patient $otherPatient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Save RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Save BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Save BHW', 'email' => 'save@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'Save', 'last_name' => 'One', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->otherPatient = Patient::create(['first_name' => 'Save', 'last_name' => 'Two', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function save(array $diagnoses, array $carePlan = [], array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Check-up',
            'diagnosis' => implode('; ', array_column($diagnoses, 'name')),
            'diagnoses' => $diagnoses,
            'care_plan' => $carePlan,
            ...$extra,
        ]);
    }

    private function active(): \Illuminate\Support\Collection
    {
        return ConditionMonitoring::where('patient_id', $this->patient->id)->where('status', 'active')->get();
    }

    public function test_monitor_starts_one_record_per_condition(): void
    {
        $id = $this->save([
            ['id' => 'd1', 'name' => 'HTN', 'carePlan' => 'monitor'],
            ['id' => 'd2', 'name' => 'Post-op wound care', 'carePlan' => 'monitor'],
            ['id' => 'd3', 'name' => 'Cough', 'carePlan' => 'none'],
        ])->assertCreated()->json('data.id');

        $this->assertEqualsCanonicalizing(['hypertension', 'name:post-op wound care'], $this->active()->pluck('condition_identity')->all());
        $this->assertSame('Hypertension', $this->active()->firstWhere('condition_key', 'hypertension')->condition_name);
        $this->assertSame(['started', 'started'], \App\Models\ConditionMonitoringVisit::where('health_record_id', $id)->pluck('action')->all());
    }

    public function test_same_condition_twice_in_one_visit_makes_one_record(): void
    {
        $this->save([
            ['id' => 'd1', 'name' => 'HTN', 'carePlan' => 'monitor'],
            ['id' => 'd2', 'name' => 'Hypertension', 'carePlan' => 'monitor_refer'],
        ], [], ['needs_referral' => false])->assertCreated();

        $this->assertCount(1, $this->active());
        $this->assertTrue($this->active()->first()->visits()->sole()->referred);
    }

    public function test_a_later_monitor_of_an_active_condition_continues_it(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor']])->assertCreated();
        $this->save([['id' => 'd1', 'name' => 'HTN', 'carePlan' => 'monitor']])->assertCreated();

        $this->assertCount(1, $this->active());
        $this->assertSame(['started', 'continued'], $this->active()->first()->visits()->orderBy('id')->pluck('action')->all());
    }

    public function test_continued_monitoring_is_kept_active_without_a_diagnosis(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'monitor']])->assertCreated();
        $monitoring = $this->active()->sole();

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])->assertCreated();

        $this->assertSame('active', $monitoring->fresh()->status);
        $this->assertSame(['started', 'continued'], $monitoring->visits()->orderBy('id')->pluck('action')->all());
    }

    public function test_stop_ends_monitoring_but_leaves_current_conditions_status(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => 'monitor']])->assertCreated();
        $monitoring = $this->active()->sole();
        $statusBefore = collect($this->patient->fresh()->medical_background['currentDiseases'] ?? [])->firstWhere('conditionKey', 'hypertension')['status'] ?? null;

        $id = $this->save([], [
            'continued_monitoring_ids' => [$monitoring->id],
            'monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Transferred to another BHC']],
        ])->assertCreated()->json('data.id');

        $monitoring->refresh();
        $this->assertSame('stopped', $monitoring->status);
        $this->assertSame($id, $monitoring->stopped_health_record_id);
        $this->assertSame('Transferred to another BHC', $monitoring->stop_reason);
        $statusAfter = collect($this->patient->fresh()->medical_background['currentDiseases'] ?? [])->firstWhere('conditionKey', 'hypertension')['status'] ?? null;
        $this->assertSame($statusBefore, $statusAfter);
    }

    public function test_a_stop_must_target_a_continued_record(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'monitor']])->assertCreated();
        $monitoring = $this->active()->sole();

        $this->save([], ['monitoring_stops' => [['monitoring_id' => $monitoring->id, 'reason' => 'Resolved']]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.monitoring_stops.0.monitoring_id']);
        $this->assertSame('active', $monitoring->fresh()->status);
    }

    public function test_stale_or_foreign_continued_monitoring_is_rejected_and_nothing_saves(): void
    {
        $this->save([['id' => 'd1', 'name' => 'Asthma', 'carePlan' => 'monitor']])->assertCreated();
        $monitoring = $this->active()->sole();
        $monitoring->update(['status' => 'stopped', 'stopped_at' => now()]);
        $before = HealthRecord::count();

        $this->save([], ['continued_monitoring_ids' => [$monitoring->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.continued_monitoring_ids.0']);
        $this->assertSame($before, HealthRecord::count());
    }

    public function test_several_continued_follow_ups_are_all_fulfilled_by_the_new_itr(): void
    {
        $first = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $second = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $taskA = FollowUpTask::create(['health_record_id' => $first->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);
        $taskB = FollowUpTask::create(['health_record_id' => $second->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        $id = $this->save([], ['continued_follow_up_task_ids' => [$taskA->id, $taskB->id]], [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $first->id,
            'monitoring_data' => ['followUpTaskId' => $taskA->id],
        ])->assertCreated()->json('data.id');

        $this->assertSame($id, $taskA->fresh()->fulfilled_by_health_record_id);
        $this->assertSame($id, $taskB->fresh()->fulfilled_by_health_record_id);
        $this->assertSame('fulfilled', $taskB->fresh()->state);
    }

    public function test_an_already_fulfilled_continued_follow_up_is_a_conflict(): void
    {
        $source = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $done = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $task = FollowUpTask::create(['health_record_id' => $source->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'fulfilled', 'fulfilled_at' => now(), 'fulfilled_by_health_record_id' => $done->id]);
        $other = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->patient->barangay_health_center_id]);
        $primary = FollowUpTask::create(['health_record_id' => $other->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->patient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        $this->save([], ['continued_follow_up_task_ids' => [$primary->id, $task->id]], [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $other->id,
            'monitoring_data' => ['followUpTaskId' => $primary->id],
        ])->assertStatus(409)->assertJsonPath('code', 'FOLLOW_UP_ALREADY_PROCESSED');
        $this->assertSame('pending', $primary->fresh()->state);
    }

    public function test_follow_up_of_another_patient_is_rejected(): void
    {
        $record = HealthRecord::create(['patient_id' => $this->otherPatient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->otherPatient->barangay_health_center_id]);
        $task = FollowUpTask::create(['health_record_id' => $record->id, 'patient_id' => $this->otherPatient->id, 'barangay_health_center_id' => $this->otherPatient->barangay_health_center_id, 'due_date' => now()->toDateString(), 'state' => 'pending']);

        $this->save([], ['continued_follow_up_task_ids' => [$task->id]])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.continued_follow_up_task_ids.0']);
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --filter=CarePlanSaveTest`
Expected: FAIL (no monitoring rows are created).

- [ ] **Step 3: Implement `ConditionMonitoringService`**

`backend/app/Services/ConditionMonitoringService.php`:
```php
<?php

namespace App\Services;

use App\Models\ConditionMonitoring;
use App\Models\ConditionMonitoringVisit;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Applies a consultation's care plan to the patient's condition monitoring.
 * Called only from HealthRecordController::store(), inside its transaction,
 * after the ITR is created. Never touches Current Conditions.
 */
class ConditionMonitoringService
{
    public function __construct(private readonly ClinicalRegistry $registry) {}

    /**
     * @param  array<int, mixed>  $monitoringIds
     * @return Collection<int, ConditionMonitoring> keyed by id
     */
    public function lockContinued(Patient $patient, array $monitoringIds): Collection
    {
        $ids = array_values(array_map('intval', $monitoringIds));
        $locked = ConditionMonitoring::query()->whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');

        foreach ($ids as $index => $id) {
            $monitoring = $locked->get($id);
            if ($monitoring === null
                || (int) $monitoring->patient_id !== (int) $patient->id
                || $monitoring->status !== ConditionMonitoring::STATUS_ACTIVE) {
                throw ValidationException::withMessages([
                    "care_plan.continued_monitoring_ids.$index" => 'This monitored condition is no longer active for this patient. Reopen Start Consultation.',
                ]);
            }
        }

        return $locked;
    }

    /**
     * @param  array<int, array<string, mixed>>  $diagnoses  server-resolved (conditionKey set)
     * @param  Collection<int, ConditionMonitoring>  $continued  from lockContinued()
     * @param  array<int, array{monitoring_id: int|string, reason: string}>  $stops
     * @return Collection<int, ConditionMonitoring> active after this visit, started or continued by it
     */
    public function apply(Patient $patient, HealthRecord $record, array $diagnoses, Collection $continued, array $stops, User $user): Collection
    {
        $stopReasons = [];
        foreach ($stops as $index => $stop) {
            $id = (int) $stop['monitoring_id'];
            if (! $continued->has($id)) {
                throw ValidationException::withMessages([
                    "care_plan.monitoring_stops.$index.monitoring_id" => 'Only a monitored condition continued in this consultation can be stopped.',
                ]);
            }
            $stopReasons[$id] = trim((string) $stop['reason']);
        }

        // One entry per condition identity this visit monitors; a condition
        // typed twice ("HTN", "Hypertension") collapses to one, referred if
        // either entry refers.
        $monitored = [];
        foreach ($diagnoses as $diagnosis) {
            if (! is_array($diagnosis) || ! CarePlan::monitors($diagnosis['carePlan'] ?? null)) {
                continue;
            }
            $identity = $this->registry->conditionIdentity($diagnosis['conditionKey'] ?? null, (string) $diagnosis['name']);
            $monitored[$identity] ??= ['key' => $diagnosis['conditionKey'] ?? null, 'name' => (string) $diagnosis['name'], 'referred' => false];
            $monitored[$identity]['referred'] = $monitored[$identity]['referred'] || CarePlan::refers($diagnosis['carePlan']);
        }

        $activeAfter = collect();

        foreach ($monitored as $identity => $entry) {
            $existing = ConditionMonitoring::query()
                ->where('patient_id', $patient->id)
                ->where('condition_identity', $identity)
                ->where('status', ConditionMonitoring::STATUS_ACTIVE)
                ->lockForUpdate()
                ->first();

            if ($existing !== null && isset($stopReasons[$existing->id])) {
                // Monitor on the diagnosis row wins over a stale stop entry.
                unset($stopReasons[$existing->id]);
            }

            $monitoring = $existing ?? ConditionMonitoring::create([
                'patient_id' => $patient->id,
                'barangay_health_center_id' => $patient->barangay_health_center_id,
                'condition_key' => $entry['key'],
                'condition_name' => $entry['name'],
                'condition_identity' => $identity,
                'status' => ConditionMonitoring::STATUS_ACTIVE,
                'started_health_record_id' => $record->id,
                'started_at' => $record->date_recorded ?? now(),
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $this->history($monitoring, $record, $existing === null ? ConditionMonitoringVisit::ACTION_STARTED : ConditionMonitoringVisit::ACTION_CONTINUED, $entry['referred']);
            $activeAfter->put($monitoring->id, $monitoring);
        }

        foreach ($continued as $monitoring) {
            if ($activeAfter->has($monitoring->id)) {
                continue;
            }
            if (isset($stopReasons[$monitoring->id])) {
                $monitoring->update([
                    'status' => ConditionMonitoring::STATUS_STOPPED,
                    'stopped_health_record_id' => $record->id,
                    'stopped_at' => $record->date_recorded ?? now(),
                    'stop_reason' => $stopReasons[$monitoring->id],
                    'updated_by' => $user->id,
                ]);
                $this->history($monitoring, $record, ConditionMonitoringVisit::ACTION_STOPPED, $this->isReferred($diagnoses, $monitoring));
                continue;
            }
            $this->history($monitoring, $record, ConditionMonitoringVisit::ACTION_CONTINUED, $this->isReferred($diagnoses, $monitoring));
            $activeAfter->put($monitoring->id, $monitoring);
        }

        return $activeAfter->values();
    }

    /** Links the visit's one follow-up task (if it scheduled one) to every monitored condition. */
    public function linkFollowUpTask(HealthRecord $record, Collection $monitorings): void
    {
        if ($monitorings->isEmpty()) {
            return;
        }
        $task = FollowUpTask::query()
            ->where('health_record_id', $record->id)
            ->whereNull('rescheduled_to_id')
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->first();
        $task?->conditionMonitorings()->syncWithoutDetaching($monitorings->pluck('id')->all());
    }

    private function history(ConditionMonitoring $monitoring, HealthRecord $record, string $action, bool $referred): void
    {
        $monitoring->visits()->create([
            'health_record_id' => $record->id,
            'action' => $action,
            'referred' => $referred,
            'created_at' => now(),
        ]);
    }

    /** A continued condition diagnosed this visit as Refer (it is then stopped or kept by the row). */
    private function isReferred(array $diagnoses, ConditionMonitoring $monitoring): bool
    {
        foreach ($diagnoses as $diagnosis) {
            if (is_array($diagnosis)
                && CarePlan::refers($diagnosis['carePlan'] ?? null)
                && $this->registry->conditionIdentity($diagnosis['conditionKey'] ?? null, (string) ($diagnosis['name'] ?? '')) === $monitoring->condition_identity) {
                return true;
            }
        }

        return false;
    }
}
```

- [ ] **Step 4: Add task helpers to `FollowUpTaskSyncService`**

Add these public methods after `lockTaskForManagement()`:
```php
    /**
     * Every other follow-up the Start Consultation modal selected, locked and
     * checked exactly like the primary one: same patient and BHC, still
     * processable. $alreadyLocked is the primary task lockTaskForProcessing()
     * returned (skipped here).
     *
     * @param  array<int, mixed>  $taskIds
     * @return \Illuminate\Support\Collection<int, FollowUpTask>
     */
    public function lockAdditionalTasks(array $taskIds, Patient $patient, User $user, ?FollowUpTask $alreadyLocked): \Illuminate\Support\Collection
    {
        $tasks = collect();
        foreach (array_values($taskIds) as $index => $taskId) {
            if ($alreadyLocked !== null && (int) $taskId === (int) $alreadyLocked->id) {
                continue;
            }
            $task = FollowUpTask::query()->whereKey((int) $taskId)->lockForUpdate()->first();
            if ($task === null
                || (int) $task->patient_id !== (int) $patient->id
                || (int) $task->barangay_health_center_id !== (int) $patient->barangay_health_center_id) {
                throw ValidationException::withMessages([
                    "care_plan.continued_follow_up_task_ids.$index" => 'This follow-up does not belong to this patient.',
                ]);
            }
            $this->facilityAccess->authorizeFollowUpTask($user, $task);
            if (! $this->isProcessable($task)) {
                $this->alreadyProcessed($task);
            }
            $tasks->push($task);
        }

        return $tasks;
    }

    /** @param \Illuminate\Support\Collection<int, FollowUpTask> $tasks */
    public function fulfillTasks(\Illuminate\Support\Collection $tasks, HealthRecord $record, ?User $user): void
    {
        foreach ($tasks as $task) {
            $this->fulfillTask($task, $record, $user);
        }
    }
```

- [ ] **Step 5: Wire into `HealthRecordController::store()`**

1. Add `use App\Services\ConditionMonitoringService;` to the imports and a `ConditionMonitoringService $monitoring` parameter after `ClinicalRegistry $clinicalRegistry` in `store()`'s signature.
2. Right after `$legacyIdempotencyHash = $idempotency->legacyHash($data);` (so the idempotency hash still covers the care plan) add:
```php
        $carePlan = $data['care_plan'] ?? [];
        unset($data['care_plan']);
```
(`care_plan` is not a `health_records` column; it only drives this save.)
3. Add `$monitoring` and `$carePlan` to the transaction closure's `use (...)` list.
4. Inside the transaction, directly after `$lockedFollowUpTask = $followUpTasks->lockTaskForProcessing(...);` add:
```php
                $additionalTasks = $followUpTasks->lockAdditionalTasks(
                    $carePlan['continued_follow_up_task_ids'] ?? [],
                    $patient,
                    $request->user(),
                    $lockedFollowUpTask
                );
                $continuedMonitorings = $monitoring->lockContinued($patient, $carePlan['continued_monitoring_ids'] ?? []);
```
5. Directly after `$currentConditions->sync(...)` add:
```php
                $monitoredNow = $monitoring->apply(
                    $patient,
                    $record,
                    $data['diagnoses'] ?? [],
                    $continuedMonitorings,
                    $carePlan['monitoring_stops'] ?? [],
                    $request->user()
                );
```
6. Directly after `$followUpTasks->fulfillParentTask($record, $request->user(), $lockedFollowUpTask);` add:
```php
                $followUpTasks->fulfillTasks($additionalTasks, $record, $request->user());
                $monitoring->linkFollowUpTask($record, $monitoredNow);
```
7. In the `catch (QueryException $exception)` block, before `if (! $this->isIdempotencyConflict($exception))`, add:
```php
            if ($this->isMonitoringConflict($exception)) {
                return response()->json([
                    'message' => 'This condition was just put under monitoring by another save. Please save again.',
                    'code' => 'CONDITION_MONITORING_CONFLICT',
                ], 409);
            }
```
and add the private method next to `isConsultationUuidConflict()`:
```php
    private function isMonitoringConflict(QueryException $exception): bool
    {
        return in_array($exception->errorInfo[0] ?? null, ['23505', '23000'], true)
            && str_contains(strtolower($exception->getMessage()), 'condition_monitorings_one_active_idx');
    }
```

- [ ] **Step 6: Run to verify pass**

Run: `php artisan test --filter=CarePlanSaveTest`
Expected: PASS (10 tests). Then the full-suite comparison from Task 3 Step 5; expected: no new failures.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Services/ConditionMonitoringService.php backend/app/Services/FollowUpTaskSyncService.php backend/app/Http/Controllers/Api/HealthRecordController.php backend/tests/Feature/CarePlanSaveTest.php
git commit -m "feat(care-plan): start, continue and stop condition monitoring on save"
```

### Task 5: Referral together with a follow-up ("Monitor at BHC + Refer to RHU")

Today a referral wipes the visit's follow-up in three places. When the visit also monitors a condition, the follow-up must survive.

**Files:**
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (follow-up date rule)
- Modify: `backend/app/Http/Controllers/Api/HealthRecordController.php` (`normalizeReferralDisposition`)
- Modify: `backend/app/Services/FollowUpTaskSyncService.php` (`syncRecord`)
- Test: `backend/tests/Feature/CarePlanReferralFollowUpTest.php`

**Interfaces:**
- Consumes: `CarePlan::monitorsAny(array $diagnoses)`.
- Produces: when `needs_referral` and any diagnosis `carePlan` monitors, `monitoring_data.followUpStatus = 'Needs Referral'` but `followUpDate` / `followUpTime` are kept, and a follow-up task is created from them.

- [ ] **Step 1: Write the failing test**

`backend/tests/Feature/CarePlanReferralFollowUpTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CarePlanReferralFollowUpTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Ref RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Ref BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Ref BHW', 'email' => 'ref@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->patient = Patient::create(['first_name' => 'Ref', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');
    }

    private function save(string $carePlan, bool $needsReferral)
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Dizziness',
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension', 'carePlan' => $carePlan]],
            'needs_referral' => $needsReferral,
            // Same shape ConsultationWorkflowRevisionTest uses. With no RHU
            // doctor available the record still saves and a referral hold is
            // recorded - the follow-up behaviour is what this test checks.
            'referral' => ['reason_for_referral' => 'Uncontrolled BP', 'urgency_level' => 'Routine'],
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addWeeks(2)->toDateString(),
                'followUpReason' => 'BP recheck',
            ],
        ]);
    }

    public function test_monitor_and_refer_keeps_the_follow_up(): void
    {
        $id = $this->save('monitor_refer', true)->assertCreated()->json('data.id');

        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame('pending', $task->state);
        $this->assertTrue($task->conditionMonitorings()->where('condition_key', 'hypertension')->exists());
        $this->assertSame('active', ConditionMonitoring::sole()->status);
    }

    public function test_refer_without_monitoring_still_drops_the_follow_up(): void
    {
        $id = $this->save('refer', true)->assertCreated()->json('data.id');

        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->whereIn('state', FollowUpTask::ACTIVE_STATES)->exists());
        $this->assertSame(0, ConditionMonitoring::count());
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --filter=CarePlanReferralFollowUpTest`
Expected: `test_monitor_and_refer_keeps_the_follow_up` FAILS (no task — the date was nulled).

- [ ] **Step 3: Implement**

`HealthRecordController::normalizeReferralDisposition()` becomes:
```php
    private function normalizeReferralDisposition(array &$data): void
    {
        $monitoringData = $data['monitoring_data'] ?? [];
        // "Monitor at BHC + Refer to RHU": the condition stays under BHC
        // monitoring, so its next follow-up survives the referral.
        $keepsFollowUp = \App\Services\CarePlan::monitorsAny($data['diagnoses'] ?? []);
        $data['monitoring_data'] = [
            ...$monitoringData,
            'followUpStatus' => 'Needs Referral',
            'follow_up_status' => 'Needs Referral',
            ...($keepsFollowUp ? [] : [
                'followUpDate' => null,
                'follow_up_date' => null,
                'followUpTime' => null,
                'follow_up_time' => null,
            ]),
        ];
    }
```

In `FollowUpTaskSyncService::syncRecord()` replace
```php
        if ($record->needs_referral) {
            $this->cancelUnfulfilledTask($record, $user);
            return;
        }

        $status = $this->healthRecordStatus($record);
        $dueDate = $this->followUpDate($record);

        if ($status !== 'follow up required' || ! $dueDate) {
```
with
```php
        $monitorsWithReferral = $record->needs_referral
            && CarePlan::monitorsAny($record->diagnoses ?? []);

        if ($record->needs_referral && ! $monitorsWithReferral) {
            $this->cancelUnfulfilledTask($record, $user);
            return;
        }

        $status = $this->healthRecordStatus($record);
        $dueDate = $this->followUpDate($record);

        if ((! $monitorsWithReferral && $status !== 'follow up required') || ! $dueDate) {
```
(`CarePlan` is in the same `App\Services` namespace — no import needed.)

- [ ] **Step 4: Run to verify pass**

Run: `php artisan test --filter="CarePlanReferralFollowUpTest|CarePlanSaveTest"`
Expected: PASS. Then the full-suite comparison; expected: no new failures (existing referral tests keep passing because they send no monitored diagnoses).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Api/HealthRecordController.php backend/app/Services/FollowUpTaskSyncService.php backend/tests/Feature/CarePlanReferralFollowUpTest.php
git commit -m "feat(care-plan): keep the follow-up when a referred visit also monitors"
```

### Task 6: `care-overview` endpoint

**Files:**
- Create: `backend/app/Http/Controllers/Api/CareOverviewController.php`
- Modify: `backend/routes/api.php`, `backend/app/Http/Middleware/EnforceActionPermissions.php`
- Test: `backend/tests/Feature/CareOverviewTest.php`

**Interfaces:**
- Produces `GET /api/patients/{patient}/care-overview` →
```json
{ "data": {
  "pending_follow_ups": [{ "id": 1, "due_date": "2026-10-01", "due_time": null, "state": "pending", "is_overdue": false,
    "reason": "BP recheck", "source_health_record_id": 10, "source_date": "2026-09-17",
    "conditions": [{ "monitoring_id": 3, "condition_name": "Hypertension" }] }],
  "monitoring_without_follow_up": [{ "id": 4, "condition_name": "Asthma", "condition_key": null,
    "started_at": "2026-08-01", "last_visit_date": "2026-09-01", "last_health_record_id": 12 }]
} }
```
  Pending = `state` in `ACTIVE_STATES`, `fulfilled_at` null, `rescheduled_to_id` null, ordered by `due_date`. `reason` = the source ITR's `monitoring_data.followUpReason` (or `follow_up_reason`). `is_overdue` = `due_date` before today. A monitoring record appears in the second list only if none of its linked tasks is pending.

- [ ] **Step 1: Write the failing test**

`backend/tests/Feature/CareOverviewTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CareOverviewTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'CO RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'CO BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'CO', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id]);
    }

    private function actAs(array $permissions): void
    {
        $user = User::create(['name' => 'CO User '.count($permissions), 'email' => 'co'.count($permissions).'@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions]);
        $this->actingAs($user, 'sanctum');
    }

    private function record(array $monitoringData = []): HealthRecord
    {
        return HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id, 'date_recorded' => now()->subWeeks(2), 'monitoring_data' => $monitoringData]);
    }

    private function monitoring(HealthRecord $record, string $name, ?string $key): ConditionMonitoring
    {
        $monitoring = ConditionMonitoring::create(['patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'condition_key' => $key, 'condition_name' => $name, 'condition_identity' => $key ?? 'name:'.strtolower($name), 'status' => 'active', 'started_health_record_id' => $record->id, 'started_at' => now()->subWeeks(2)]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    public function test_lists_pending_follow_ups_and_unscheduled_monitoring(): void
    {
        $this->actAs(ActionPermissions::PRESETS['encoder']);
        $source = $this->record(['followUpReason' => 'BP recheck']);
        $htn = $this->monitoring($source, 'Hypertension', 'hypertension');
        $asthma = $this->monitoring($source, 'Asthma', null);
        $task = FollowUpTask::create(['health_record_id' => $source->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'due_date' => now()->subDay()->toDateString(), 'state' => 'pending']);
        $task->conditionMonitorings()->attach($htn->id);

        $response = $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk();

        $response->assertJsonPath('data.pending_follow_ups.0.id', $task->id)
            ->assertJsonPath('data.pending_follow_ups.0.is_overdue', true)
            ->assertJsonPath('data.pending_follow_ups.0.reason', 'BP recheck')
            ->assertJsonPath('data.pending_follow_ups.0.conditions.0.condition_name', 'Hypertension')
            ->assertJsonCount(1, 'data.monitoring_without_follow_up')
            ->assertJsonPath('data.monitoring_without_follow_up.0.id', $asthma->id)
            ->assertJsonPath('data.monitoring_without_follow_up.0.last_health_record_id', $source->id);
        $this->assertSame(['pending_follow_ups', 'monitoring_without_follow_up'], array_keys($response->json('data')));
        $this->assertSame(
            ['id', 'due_date', 'due_time', 'state', 'is_overdue', 'reason', 'source_health_record_id', 'source_date', 'conditions'],
            array_keys($response->json('data.pending_follow_ups.0'))
        );
    }

    public function test_fulfilled_rescheduled_and_stopped_items_are_excluded(): void
    {
        $this->actAs(ActionPermissions::PRESETS['clinical']);
        $source = $this->record();
        $stopped = $this->monitoring($source, 'Asthma', null);
        $stopped->update(['status' => 'stopped']);
        FollowUpTask::create(['health_record_id' => $source->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'due_date' => now()->toDateString(), 'state' => 'fulfilled', 'fulfilled_at' => now()]);

        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonCount(0, 'data.pending_follow_ups')
            ->assertJsonCount(0, 'data.monitoring_without_follow_up');
    }

    public function test_requires_encode_or_history_permission(): void
    {
        $this->actAs(['inventory.view']);
        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertForbidden();
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --filter=CareOverviewTest`
Expected: FAIL — 404 (no route).

- [ ] **Step 3: Implement**

`backend/app/Http/Controllers/Api/CareOverviewController.php`:
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Services\ActionPermissions;
use App\Services\FacilityAccessService;
use Illuminate\Http\Request;

/**
 * What the Start Consultation modal needs and nothing more: a patient's
 * pending follow-ups and the active monitoring that has no pending follow-up.
 * No ITR bodies, vitals, diagnosis lists or referral data.
 */
class CareOverviewController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function show(Request $request, Patient $patient)
    {
        $user = $request->user();
        abort_unless(
            ActionPermissions::allows($user, 'consultations.encode') || ActionPermissions::allows($user, 'clinical.history'),
            403,
            'Your current facility assignment does not permit this action.'
        );
        $this->facilityAccess->authorizePatient($user, $patient);

        $tasks = FollowUpTask::query()
            ->with(['healthRecord:id,date_recorded,monitoring_data', 'conditionMonitorings' => fn ($q) => $q->where('status', ConditionMonitoring::STATUS_ACTIVE)])
            ->where('patient_id', $patient->id)
            ->whereIn('state', FollowUpTask::ACTIVE_STATES)
            ->whereNull('fulfilled_at')
            ->whereNull('rescheduled_to_id')
            ->orderBy('due_date')
            ->get();

        $scheduledIds = $tasks->flatMap(fn (FollowUpTask $task) => $task->conditionMonitorings->pluck('id'))->unique();

        $monitorings = ConditionMonitoring::query()
            ->with(['visits' => fn ($q) => $q->with('healthRecord:id,date_recorded')->orderByDesc('id')])
            ->where('patient_id', $patient->id)
            ->where('status', ConditionMonitoring::STATUS_ACTIVE)
            ->whereNotIn('id', $scheduledIds)
            ->orderBy('started_at')
            ->get();

        return response()->json(['data' => [
            'pending_follow_ups' => $tasks->map(fn (FollowUpTask $task) => [
                'id' => $task->id,
                'due_date' => $task->due_date?->toDateString(),
                'due_time' => $task->due_time,
                'state' => $task->state,
                'is_overdue' => $task->due_date !== null && $task->due_date->lt(today()),
                'reason' => $task->healthRecord?->monitoring_data['followUpReason']
                    ?? $task->healthRecord?->monitoring_data['follow_up_reason']
                    ?? null,
                'source_health_record_id' => $task->health_record_id,
                'source_date' => $task->healthRecord?->date_recorded?->toDateString(),
                'conditions' => $task->conditionMonitorings->map(fn (ConditionMonitoring $m) => [
                    'monitoring_id' => $m->id,
                    'condition_name' => $m->condition_name,
                ])->values(),
            ])->values(),
            'monitoring_without_follow_up' => $monitorings->map(function (ConditionMonitoring $m) {
                $last = $m->visits->first();

                return [
                    'id' => $m->id,
                    'condition_name' => $m->condition_name,
                    'condition_key' => $m->condition_key,
                    'started_at' => $m->started_at?->toDateString(),
                    'last_visit_date' => $last?->healthRecord?->date_recorded?->toDateString(),
                    'last_health_record_id' => $last?->health_record_id,
                ];
            })->values(),
        ]]);
    }
}
```

Check `FollowUpTask` casts `due_date` as a date (`grep -n "due_date" backend/app/Models/FollowUpTask.php`). If it is not cast, add `'due_date' => 'date'` to its `$casts` only if no existing code compares it as a string — otherwise use `\Illuminate\Support\Carbon::parse($task->due_date)` in the controller instead and keep the model unchanged.

In `backend/routes/api.php`, inside the `facility.assigned`/`actions.allowed` group, right after `Route::apiResource('health-records', HealthRecordController::class);` add:
```php
        Route::get('patients/{patient}/care-overview', [\App\Http\Controllers\Api\CareOverviewController::class, 'show']);
```

In `EnforceActionPermissions::handle()`, add as the **first** arm of the `match` (before `/corrections`):
```php
            // Either consultations.encode or clinical.history; the controller checks.
            str_contains($path, '/care-overview') => null,
```

- [ ] **Step 4: Run to verify pass**

Run: `php artisan test --filter=CareOverviewTest`
Expected: PASS (3 tests). Full-suite comparison: no new failures.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Api/CareOverviewController.php backend/routes/api.php backend/app/Http/Middleware/EnforceActionPermissions.php backend/app/Models/FollowUpTask.php backend/tests/Feature/CareOverviewTest.php
git commit -m "feat(care-plan): add minimal care-overview endpoint for Start Consultation"
```

### Task 7: Care-plan rules as pure frontend functions

**Files:**
- Create: `frontend/src/utils/carePlan.js`, `frontend/src/utils/carePlan.test.js`
- Create: `frontend/src/utils/monitoringDetails.js`, `frontend/src/utils/monitoringDetails.test.js`
- Modify: `frontend/src/utils/diagnoses.js` (`normalizeDiagnoses`), `frontend/src/utils/diagnoses.test.js`

**Interfaces:**
- Consumes: `normalizeNameKey` from `utils/diagnoses.js`; the registry shape `{ monitored_conditions: { [key]: { name, aliases, monitoring_details? } } }`.
- Produces (all used by Tasks 8–10):
```js
export const CARE_PLAN = { NONE: "none", MONITOR: "monitor", REFER: "refer", MONITOR_REFER: "monitor_refer" };
export const CARE_PLAN_OPTIONS; // [{ value, label }] in UI order
export function monitors(value) -> boolean
export function refers(value) -> boolean
export function matchConditionKey(name, registry) -> string | null
export function conditionIdentity(name, registry) -> string
export function continuedByIdentity(continuedMonitorings, registry) -> Map<identity, monitoring>
export function defaultCarePlan(diagnosis, continuedMonitorings, registry) -> string
export function carePlanFor(diagnosis, continuedMonitorings, registry) -> string // stored value or default
export function continuingRows(diagnoses, continuedMonitorings, registry) -> monitoring[] // not re-diagnosed
export function stopsRequired(diagnoses, continuedMonitorings, stops, registry) -> { [monitoringId]: true } // needs a reason
export function referredDiagnoses(diagnoses, continuedMonitorings, registry) -> diagnosis[]
export function buildReferralReason(diagnoses, continuedMonitorings, registry) -> string
export function monitoredConditionKeys(diagnoses, continuedMonitorings, stops, registry) -> Array<string|null>
export function deriveDisposition({ diagnoses, continuedMonitorings, stops, registry, serviceNeedsNextVisit }) -> { needsReferral, showsFollowUp, monitorsAny }
export function validateCarePlan({ diagnoses, continuedMonitorings, stops, registry }) -> { [errorKey]: message }
export function buildCarePlanPayload({ continuedFollowUpTaskIds, continuedMonitorings, stops, diagnoses, registry }) -> { continued_follow_up_task_ids, continued_monitoring_ids, monitoring_stops }
// monitoringDetails.js
export const MONITORING_DETAILS = { tb_dots: { label, description } };
export function monitoringDetailKeys(conditionKeys, registry) -> string[] // distinct, known keys only
```
  `continuedMonitorings` items are the `monitoring_without_follow_up` / `pending_follow_ups[].conditions` entries the modal selected, normalized to `{ id, conditionName, conditionKey }`. `stops` is `{ [monitoringId]: reasonString }`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/utils/carePlan.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  CARE_PLAN, CARE_PLAN_OPTIONS, conditionIdentity, defaultCarePlan, carePlanFor, continuingRows,
  stopsRequired, referredDiagnoses, buildReferralReason, deriveDisposition, validateCarePlan,
  buildCarePlanPayload, monitoredConditionKeys,
} from "./carePlan.js";

const registry = {
  monitored_conditions: {
    hypertension: { name: "Hypertension", aliases: ["HTN"] },
    diabetes_mellitus: { name: "Diabetes Mellitus", aliases: ["DM"] },
    tuberculosis: { name: "Tuberculosis", aliases: ["PTB"], monitoring_details: "tb_dots" },
  },
};
const htnMonitoring = { id: 3, conditionName: "Hypertension", conditionKey: "hypertension" };
const asthmaMonitoring = { id: 4, conditionName: "Asthma", conditionKey: null };

test("labels are explicit and in order", () => {
  assert.deepEqual(CARE_PLAN_OPTIONS.map((o) => o.label), [
    "No Ongoing Tracking", "Monitor at BHC", "Refer to RHU", "Monitor at BHC + Refer to RHU",
  ]);
});

test("identity uses the registry key, else the normalized name", () => {
  assert.equal(conditionIdentity("HTN", registry), "hypertension");
  assert.equal(conditionIdentity("  Post-op  Wound Care ", registry), "name:post-op wound care");
});

test("a new diagnosis defaults to no tracking; a continued one defaults to monitor", () => {
  assert.equal(defaultCarePlan({ name: "Cough" }, [htnMonitoring], registry), CARE_PLAN.NONE);
  assert.equal(defaultCarePlan({ name: "HTN" }, [htnMonitoring], registry), CARE_PLAN.MONITOR);
  assert.equal(carePlanFor({ name: "HTN", carePlan: "refer" }, [htnMonitoring], registry), "refer");
});

test("continuing rows are the continued conditions not diagnosed this visit", () => {
  const rows = continuingRows([{ id: "d1", name: "Hypertension" }], [htnMonitoring, asthmaMonitoring], registry);
  assert.deepEqual(rows.map((m) => m.id), [4]);
});

test("a re-diagnosed continued condition set to no tracking or refer needs a stop reason", () => {
  const diagnoses = [{ id: "d1", name: "HTN", carePlan: "refer" }];
  assert.deepEqual(stopsRequired(diagnoses, [htnMonitoring, asthmaMonitoring], {}, registry), { 3: true });
  const errors = validateCarePlan({ diagnoses, continuedMonitorings: [htnMonitoring], stops: { 3: "  " }, registry });
  assert.ok(errors["carePlanStop.3"]);
  assert.deepEqual(validateCarePlan({ diagnoses, continuedMonitorings: [htnMonitoring], stops: { 3: "Referred for insulin" }, registry }), {});
});

test("an explicit stop on a continuing row also needs a reason", () => {
  const errors = validateCarePlan({ diagnoses: [], continuedMonitorings: [asthmaMonitoring], stops: { 4: "" }, registry });
  assert.ok(errors["carePlanStop.4"]);
});

test("referral set and pre-filled reason follow the current diagnoses only", () => {
  const diagnoses = [
    { id: "d1", name: "Diabetes Mellitus", carePlan: "monitor_refer" },
    { id: "d2", name: "Hypertension", carePlan: "refer" },
    { id: "d3", name: "Cough", carePlan: "none" },
  ];
  assert.deepEqual(referredDiagnoses(diagnoses, [], registry).map((d) => d.id), ["d1", "d2"]);
  assert.equal(buildReferralReason(diagnoses, [], registry), "Referred for: Diabetes Mellitus; Hypertension");
  // d2 removed after being set to Refer: gone from the set and the reason.
  assert.equal(buildReferralReason(diagnoses.filter((d) => d.id !== "d2"), [], registry), "Referred for: Diabetes Mellitus");
});

test("disposition: referral, follow-up visibility, monitoring", () => {
  assert.deepEqual(
    deriveDisposition({ diagnoses: [{ name: "HTN", carePlan: "monitor_refer" }], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: false }),
    { needsReferral: true, showsFollowUp: true, monitorsAny: true },
  );
  assert.deepEqual(
    deriveDisposition({ diagnoses: [{ name: "Cough", carePlan: "none" }], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: false }),
    { needsReferral: false, showsFollowUp: false, monitorsAny: false },
  );
  assert.equal(
    deriveDisposition({ diagnoses: [], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: true }).showsFollowUp,
    true,
  );
  assert.equal(
    deriveDisposition({ diagnoses: [], continuedMonitorings: [asthmaMonitoring], stops: { 4: "Resolved" }, registry, serviceNeedsNextVisit: false }).monitorsAny,
    false,
  );
});

test("monitored condition keys include continued ones that are not stopped", () => {
  const keys = monitoredConditionKeys([{ name: "PTB", carePlan: "monitor" }], [htnMonitoring, asthmaMonitoring], { 3: "Resolved" }, registry);
  assert.deepEqual(keys.sort(), [null, "tuberculosis"].sort());
});

test("payload lists continued ids and only real stops", () => {
  const payload = buildCarePlanPayload({
    continuedFollowUpTaskIds: [9],
    continuedMonitorings: [htnMonitoring, asthmaMonitoring],
    stops: { 4: " Moved away ", 3: "" },
    diagnoses: [],
    registry,
  });
  assert.deepEqual(payload, {
    continued_follow_up_task_ids: [9],
    continued_monitoring_ids: [3, 4],
    monitoring_stops: [{ monitoring_id: 4, reason: "Moved away" }],
  });
});
```

`frontend/src/utils/monitoringDetails.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { MONITORING_DETAILS, monitoringDetailKeys } from "./monitoringDetails.js";

const registry = {
  monitored_conditions: {
    tuberculosis: { name: "Tuberculosis", monitoring_details: "tb_dots" },
    hypertension: { name: "Hypertension" },
    future_condition: { name: "Future", monitoring_details: "future_form" },
  },
};

test("only conditions declaring a known key need Monitoring Details, once each", () => {
  assert.deepEqual(monitoringDetailKeys(["tuberculosis", "tuberculosis", "hypertension", null], registry), ["tb_dots"]);
  assert.deepEqual(monitoringDetailKeys(["hypertension", null], registry), []);
});

test("a second declared key renders through the same map once it is registered", () => {
  assert.deepEqual(monitoringDetailKeys(["future_condition"], registry), []);
  MONITORING_DETAILS.future_form = { label: "Future", description: "x" };
  try {
    assert.deepEqual(monitoringDetailKeys(["future_condition", "tuberculosis"], registry), ["future_form", "tb_dots"]);
  } finally {
    delete MONITORING_DETAILS.future_form;
  }
});
```

Append to `frontend/src/utils/diagnoses.test.js`:
```js
test("normalizeDiagnoses keeps care plan and surveillance choices", () => {
  const [entry] = normalizeDiagnoses([{ id: "d1", name: "HFMD", carePlan: "monitor", includeInSurveillance: true }]);
  assert.equal(entry.carePlan, "monitor");
  assert.equal(entry.includeInSurveillance, true);
  const [plain] = normalizeDiagnoses([{ id: "d2", name: "Cough", carePlan: "bogus" }]);
  assert.equal(Object.hasOwn(plain, "carePlan"), false);
});
```
(Check the file's existing imports include `normalizeDiagnoses`; add it to the import if not.)

- [ ] **Step 2: Run to verify failure**

Run (from `frontend/`): `node --test src/utils/carePlan.test.js src/utils/monitoringDetails.test.js src/utils/diagnoses.test.js`
Expected: FAIL — modules not found / care plan dropped.

- [ ] **Step 3: Implement `monitoringDetails.js`**

```js
/**
 * Monitoring Details: extra forms a monitored condition needs beyond the ITR.
 * A registered condition declares `monitoring_details: "<key>"` in the
 * backend registry (config/clinical_registry.php). This map holds each key's
 * copy; MonitoringDetailsForms.jsx maps the same key to its form component.
 * A key missing here is ignored, so the step never shows an empty section.
 */
export const MONITORING_DETAILS = {
  tb_dots: {
    label: "TB-DOTS Treatment Card",
    description:
      "DS-TB Treatment Card (DOH Form 4b) — case finding, diagnosis, regimen, treatment supporter, dose calendar, and adverse events.",
  },
};

/** Distinct Monitoring Details keys for the monitored conditions, sorted (stable section order). */
export function monitoringDetailKeys(conditionKeys = [], registry = {}) {
  const conditions = registry?.monitored_conditions || {};
  const keys = [];
  for (const conditionKey of conditionKeys) {
    const detailsKey = conditionKey ? conditions[conditionKey]?.monitoring_details : null;
    if (detailsKey && Object.hasOwn(MONITORING_DETAILS, detailsKey) && !keys.includes(detailsKey)) {
      keys.push(detailsKey);
    }
  }
  return keys.sort();
}
```

- [ ] **Step 4: Implement `carePlan.js`**

```js
import { normalizeNameKey } from "./diagnoses.js";

/**
 * Care Plan & Next Steps rules, kept out of the workspace so they are tested.
 * See docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md.
 *
 * Defaults are UI defaults only; nothing clinical is inferred.
 */
export const CARE_PLAN = Object.freeze({
  NONE: "none",
  MONITOR: "monitor",
  REFER: "refer",
  MONITOR_REFER: "monitor_refer",
});

export const CARE_PLAN_OPTIONS = Object.freeze([
  { value: CARE_PLAN.NONE, label: "No Ongoing Tracking" },
  { value: CARE_PLAN.MONITOR, label: "Monitor at BHC" },
  { value: CARE_PLAN.REFER, label: "Refer to RHU" },
  { value: CARE_PLAN.MONITOR_REFER, label: "Monitor at BHC + Refer to RHU" },
]);

const VALUES = new Set(Object.values(CARE_PLAN));

export function isCarePlanValue(value) {
  return VALUES.has(value);
}

export function monitors(value) {
  return value === CARE_PLAN.MONITOR || value === CARE_PLAN.MONITOR_REFER;
}

export function refers(value) {
  return value === CARE_PLAN.REFER || value === CARE_PLAN.MONITOR_REFER;
}

/** Same exact, case/space-insensitive name-or-alias match the backend uses. */
export function matchConditionKey(name, registry = {}) {
  const key = normalizeNameKey(name);
  if (!key) return null;
  for (const [conditionKey, entry] of Object.entries(registry?.monitored_conditions || {})) {
    const names = [entry?.name, ...(entry?.aliases || [])];
    if (names.some((candidate) => normalizeNameKey(candidate) === key)) return conditionKey;
  }
  return null;
}

export function conditionIdentity(name, registry = {}) {
  return matchConditionKey(name, registry) || `name:${normalizeNameKey(name)}`;
}

function monitoringIdentity(monitoring, registry) {
  return monitoring?.conditionKey || conditionIdentity(monitoring?.conditionName, registry);
}

export function continuedByIdentity(continuedMonitorings = [], registry = {}) {
  return new Map(continuedMonitorings.map((monitoring) => [monitoringIdentity(monitoring, registry), monitoring]));
}

function continuedFor(diagnosis, continuedMonitorings, registry) {
  return continuedByIdentity(continuedMonitorings, registry).get(conditionIdentity(diagnosis?.name, registry)) || null;
}

/** Continued conditions stay monitored unless the worker explicitly changes them. */
export function defaultCarePlan(diagnosis, continuedMonitorings = [], registry = {}) {
  return continuedFor(diagnosis, continuedMonitorings, registry) ? CARE_PLAN.MONITOR : CARE_PLAN.NONE;
}

export function carePlanFor(diagnosis, continuedMonitorings = [], registry = {}) {
  return isCarePlanValue(diagnosis?.carePlan)
    ? diagnosis.carePlan
    : defaultCarePlan(diagnosis, continuedMonitorings, registry);
}

function diagnosedIdentities(diagnoses, registry) {
  return new Set((diagnoses || []).map((diagnosis) => conditionIdentity(diagnosis?.name, registry)));
}

/** Continued monitoring whose condition was not diagnosed this visit (Care Plan part B rows). */
export function continuingRows(diagnoses = [], continuedMonitorings = [], registry = {}) {
  const diagnosed = diagnosedIdentities(diagnoses, registry);
  return continuedMonitorings.filter((monitoring) => !diagnosed.has(monitoringIdentity(monitoring, registry)));
}

/**
 * Continued monitoring this visit ends: a re-diagnosed condition set to a
 * non-monitoring plan, or a part-B row with a stop entry. Each needs a reason.
 */
export function stopsRequired(diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}) {
  const required = {};
  for (const diagnosis of diagnoses || []) {
    const monitoring = continuedFor(diagnosis, continuedMonitorings, registry);
    if (monitoring && !monitors(carePlanFor(diagnosis, continuedMonitorings, registry))) {
      required[monitoring.id] = true;
    }
  }
  for (const monitoring of continuingRows(diagnoses, continuedMonitorings, registry)) {
    if (Object.hasOwn(stops, monitoring.id)) required[monitoring.id] = true;
  }
  return required;
}

export function referredDiagnoses(diagnoses = [], continuedMonitorings = [], registry = {}) {
  return (diagnoses || []).filter((diagnosis) => refers(carePlanFor(diagnosis, continuedMonitorings, registry)));
}

export function buildReferralReason(diagnoses = [], continuedMonitorings = [], registry = {}) {
  const names = referredDiagnoses(diagnoses, continuedMonitorings, registry).map((diagnosis) => String(diagnosis.name).trim());
  return names.length ? `Referred for: ${names.join("; ")}` : "";
}

/** Registry keys (null for free text) of every condition monitored after this visit. */
export function monitoredConditionKeys(diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}) {
  const required = stopsRequired(diagnoses, continuedMonitorings, stops, registry);
  const keys = (diagnoses || [])
    .filter((diagnosis) => monitors(carePlanFor(diagnosis, continuedMonitorings, registry)))
    .map((diagnosis) => matchConditionKey(diagnosis.name, registry));
  for (const monitoring of continuingRows(diagnoses, continuedMonitorings, registry)) {
    if (!required[monitoring.id]) keys.push(monitoring.conditionKey || null);
  }
  return keys;
}

export function deriveDisposition({ diagnoses = [], continuedMonitorings = [], stops = {}, registry = {}, serviceNeedsNextVisit = false } = {}) {
  const needsReferral = referredDiagnoses(diagnoses, continuedMonitorings, registry).length > 0;
  const monitorsAny = monitoredConditionKeys(diagnoses, continuedMonitorings, stops, registry).length > 0;
  return { needsReferral, showsFollowUp: monitorsAny || serviceNeedsNextVisit, monitorsAny };
}

export function validateCarePlan({ diagnoses = [], continuedMonitorings = [], stops = {}, registry = {} } = {}) {
  const errors = {};
  for (const monitoringId of Object.keys(stopsRequired(diagnoses, continuedMonitorings, stops, registry))) {
    if (!String(stops[monitoringId] || "").trim()) {
      errors[`carePlanStop.${monitoringId}`] = "Give a reason for stopping monitoring.";
    }
  }
  return errors;
}

export function buildCarePlanPayload({ continuedFollowUpTaskIds = [], continuedMonitorings = [], stops = {}, diagnoses = [], registry = {} } = {}) {
  const required = stopsRequired(diagnoses, continuedMonitorings, stops, registry);
  return {
    continued_follow_up_task_ids: continuedFollowUpTaskIds.map(Number),
    continued_monitoring_ids: continuedMonitorings.map((monitoring) => Number(monitoring.id)),
    monitoring_stops: Object.keys(required)
      .map((id) => ({ monitoring_id: Number(id), reason: String(stops[id] || "").trim() }))
      .filter((stop) => stop.reason),
  };
}
```

- [ ] **Step 5: Keep the new keys in `normalizeDiagnoses`**

In `frontend/src/utils/diagnoses.js`, add at the top `import { isCarePlanValue } from "./carePlan.js";` and in `normalizeDiagnoses`'s returned object, after the `reportAs` spread, add:
```js
        ...(isCarePlanValue(item.carePlan) ? { carePlan: item.carePlan } : {}),
        ...(item.includeInSurveillance === true ? { includeInSurveillance: true } : {}),
```
`carePlan.js` imports only `normalizeNameKey` from `diagnoses.js`, and ES modules tolerate this cycle because both are used at call time, not at module evaluation. If Node reports a cycle error, move `normalizeNameKey` into a new `utils/nameKey.js` imported by both.

- [ ] **Step 6: Run to verify pass**

Run: `node --test src/utils/carePlan.test.js src/utils/monitoringDetails.test.js src/utils/diagnoses.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/carePlan.js frontend/src/utils/carePlan.test.js frontend/src/utils/monitoringDetails.js frontend/src/utils/monitoringDetails.test.js frontend/src/utils/diagnoses.js frontend/src/utils/diagnoses.test.js
git commit -m "feat(care-plan): care-plan and monitoring-details rules as tested pure functions"
```

---

## Phase 2 — Care Plan, Monitoring Details, Start Consultation modal

### Task 8: Step model — Care Plan & Next Steps, Monitoring Details, TB out of programs

**Files:**
- Modify: `frontend/src/utils/consultationSteps.js`, `frontend/src/utils/consultationSteps.test.js`
- Modify: `frontend/src/utils/consultationPrograms.js`, `frontend/src/utils/consultationPrograms.test.js`
- Create: `frontend/src/utils/tbRecords.js`, `frontend/src/utils/tbRecords.test.js`
- Modify: `frontend/src/utils/healthRecordPrograms.js` (`getSpecializedRecordPrograms`), `frontend/src/components/features/records/SpecializedRecordsTab.jsx` — TB grouping by data, so `careTracking.js` (which groups through `getSpecializedRecordPrograms`) keeps finding TB records once `TB` stops being a program
- Modify: `backend/app/Services/ConsultationPrograms.php`
- Modify tests that use `TB` as a program: `backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php`, `backend/tests/Feature/ConsultationProgramsTest.php`, `backend/tests/Feature/ConsultationWorkflowRevisionTest.php`, `backend/tests/Feature/RemoveHypertensionDiabetesProgramMigrationTest.php` (only if it fails)

**Interfaces:**
- Produces: `MONITORING_STEP = "monitoring"`; `buildConsultationSteps({ selectedPrograms, primaryProgram, monitoringDetailKeys = [] })` (no `generalSelected`); `getFormSequence(programSteps)`, `getStepOrder(programSteps, monitoringDetailKeys = [])`; NEXT_STEP label `"Care Plan & Next Steps"`; `getErrorOwnerStepKey`: `tbData.*` → `MONITORING_STEP`, `carePlanStop.*` → `NEXT_STEP`, `followUpDate|followUpReason|reasonForReferral|receivingRhuId|urgencyLevel|followUpTime|followUpStatus` → `NEXT_STEP` (unchanged); `PROGRAM_CLASSIFICATIONS` without `TB`.
- Draft resume: Monitoring Details is saved as `wizardPhase: "next"` (the server allowlist is program/form/next), so a draft saved there resumes on Care Plan.

- [ ] **Step 1: Update the tests first**

In `consultationSteps.test.js`: remove every `generalSelected` argument and any test asserting the "BHC Assessment & Actions Taken" label or a sequence without `ASSESSMENT_STEP`; replace any `"TB"` program in fixtures with `"EPI"`. Add:
```js
test("Care Plan replaces Disposition and Monitoring Details appears only when needed", () => {
  const labels = buildConsultationSteps({ selectedPrograms: [], primaryProgram: "" }).map((s) => s.label);
  assert.deepEqual(labels, ["Concern & Vital Signs", "Physical Exam & Assessment", "Actions Taken", "Care Plan & Next Steps", "Review & Confirm"]);

  const withTb = buildConsultationSteps({ selectedPrograms: [], primaryProgram: "", monitoringDetailKeys: ["tb_dots"] }).map((s) => s.key);
  assert.deepEqual(withTb, [INTERVIEW_STEP, ASSESSMENT_STEP, TREATMENT_STEP, NEXT_STEP, MONITORING_STEP, REVIEW_STEP]);
  assert.deepEqual(getStepOrder([], ["tb_dots"]).slice(-3), [NEXT_STEP, MONITORING_STEP, REVIEW_STEP]);
});

test("TB and stop-reason errors route to their screens", () => {
  assert.equal(getErrorOwnerStepKey("tbData.diagnosis.tbCaseNumber"), MONITORING_STEP);
  assert.equal(getErrorOwnerStepKey("carePlanStop.3"), NEXT_STEP);
});
```
(add `MONITORING_STEP` to the test's import list). In `consultationPrograms.test.js` replace any expectation listing `TB` with the three services, and add:
```js
test("TB is no longer a consultation program", () => {
  assert.deepEqual(Object.keys(PROGRAM_CLASSIFICATIONS), ["Maternal", "Family Planning", "EPI"]);
  assert.deepEqual(getConsultationPrograms({ selectedPrograms: ["TB", "EPI"] }), ["EPI"]);
});
```
Update the existing tests that treat `TB` as a program (keep what each test is about; only the program changes):

| File | Change |
|---|---|
| `frontend/src/utils/consultationPrograms.test.js` | lines 7–8: use `"EPI"` instead of `"TB"`; lines 12–14: `selectedPrograms: ["Maternal", "EPI"], primaryProgram: "EPI"`; line 19: expect `["Maternal", "Family Planning", "EPI"]`; line 38: replace with `assert.equal(restoredClassification("TB DOTS / TB Monitoring", ""), "General Consultation");` (a TB draft resumes as General Consultation). |
| `frontend/src/utils/consultationSteps.test.js` | every `"TB"` program → `"EPI"`; the `TB` step-key constant and "TB DOTS" labels → the EPI step key and `"Child Health / EPI"`. |
| `backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php` | first assertion → `['Maternal', 'Family Planning', 'EPI']`; line 61: drop `'TB'` from the list and make `'primaryProgram' => 'Maternal'`. |
| `backend/tests/Feature/ConsultationProgramsTest.php` | lines 34, 59, 72: `'TB'` → `'Family Planning'` (add `'family_planning_data' => ['methodUsed' => 'Pills']` where the request is a record save and the FP required-field rule fires); line 51: keep asserting the rejection — `'TB'` is now simply an unknown program, so assert `assertJsonValidationErrors(['monitoring_data.primaryProgram'])`. |
| `backend/tests/Feature/ConsultationWorkflowRevisionTest.php` | line 75: `['Family Planning']` / `'Family Planning'`; line 107: replace with `$this->save(['diagnosis' => 'PTB', 'diagnoses' => [['id' => 'd1', 'name' => 'PTB', 'carePlan' => 'monitor']]])->assertUnprocessable()->assertJsonValidationErrors(['tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart']);` |
| `backend/tests/Feature/RemoveHypertensionDiabetesProgramMigrationTest.php` | lines 135–136 are stored legacy data read by a migration; change them only if this test fails, and then only to the value the migration now produces. |

Add the TB-by-data test `frontend/src/utils/tbRecords.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { isTbRecord } from "./tbRecords.js";

test("TB records are detected by data, with the legacy category and program kept", () => {
  assert.equal(isTbRecord({ category: "General Consultation", tb_data: { diagnosis: { tbCaseNumber: "TB-1" } } }), true);
  assert.equal(isTbRecord({ category: "TB DOTS / TB Monitoring" }), true);
  assert.equal(isTbRecord({ monitoringData: { selectedPrograms: ["TB"] } }), true);
  assert.equal(isTbRecord({ category: "General Consultation", tbData: {} }), false);
  assert.equal(isTbRecord({ category: "Maternal" }), false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test src/utils/consultationSteps.test.js src/utils/consultationPrograms.test.js src/utils/tbRecords.test.js` and `php artisan test --filter="RemovedHypertensionDiabetesProgramTest|ConsultationProgramsTest|ConsultationWorkflowRevisionTest"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`consultationPrograms.js`: delete the `TB: "TB DOTS / TB Monitoring",` line. Backend `ConsultationPrograms::CLASSIFICATIONS`: delete `'TB' => 'TB DOTS / TB Monitoring',`.

`consultationSteps.js`:
- Add `export const MONITORING_STEP = "monitoring";` after `REVIEW_STEP`.
- Delete the `"TB DOTS / TB Monitoring"` entry from `PROGRAM_STEP_DETAILS`.
- Replace `buildConsultationSteps` with:
```js
export function buildConsultationSteps({ selectedPrograms, primaryProgram, monitoringDetailKeys = [] } = {}) {
  const programSteps = getProgramFormSteps(selectedPrograms, primaryProgram);

  return [
    { key: INTERVIEW_STEP, phase: "form", label: "Concern & Vital Signs" },
    { key: ASSESSMENT_STEP, phase: "form", label: "Physical Exam & Assessment" },
    ...(programSteps.length > 0
      ? [{ key: PROGRAMS_STEP, phase: "form", label: "Service Details" }]
      : []),
    { key: TREATMENT_STEP, phase: "form", label: "Actions Taken" },
    { key: NEXT_STEP, phase: "next", label: "Care Plan & Next Steps" },
    // Only when a monitored condition needs data the ITR does not hold (TB today).
    ...(monitoringDetailKeys.length > 0
      ? [{ key: MONITORING_STEP, phase: "next", label: "Monitoring Details" }]
      : []),
    { key: REVIEW_STEP, phase: "review", label: "Review & Confirm" },
  ];
}
```
- Replace `getFormSequence` / `getStepOrder` with:
```js
export function getFormSequence(programSteps = []) {
  return [INTERVIEW_STEP, ASSESSMENT_STEP, ...programSteps.map((step) => step.key), TREATMENT_STEP];
}

export function getStepOrder(programSteps = [], monitoringDetailKeys = []) {
  return [
    ...getFormSequence(programSteps),
    NEXT_STEP,
    ...(monitoringDetailKeys.length > 0 ? [MONITORING_STEP] : []),
    REVIEW_STEP,
  ];
}
```
- In `getErrorOwnerStepKey`: replace `if (key.startsWith("tbData.")) return programStepKey("TB DOTS / TB Monitoring");` with `if (key.startsWith("tbData.")) return MONITORING_STEP;`, add `if (key.startsWith("carePlanStop.")) return NEXT_STEP;` before the `NEXT_STEP` line, and replace the comment above `if (key === "diagnosis")` with `// The diagnosis list lives on Physical Exam & Assessment.`
- Update the file's top doc comment: the step list is `Concern & Vital Signs -> Physical Exam & Assessment -> Service Details (when a service is selected) -> Actions Taken -> Care Plan & Next Steps -> Monitoring Details (when a monitored condition needs it) -> Review & Confirm`; "Programs are chosen in the Barangay Health Services panel".
- In the header comment of `resolveRestoredPosition`, add: "Monitoring Details is saved as the next phase, so it resumes on Care Plan."

`frontend/src/utils/tbRecords.js`:
```js
const TB_CATEGORY = "TB DOTS / TB Monitoring";

function hasContent(value) {
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((entry) =>
    entry && typeof entry === "object" ? hasContent(entry) : entry !== null && entry !== undefined && String(entry).trim() !== "",
  );
}

/**
 * A TB record: saved TB-DOTS data (new records are General Consultation or a
 * service category), or - for records saved before the Care Plan change - the
 * TB category or a "TB" program selection.
 */
export function isTbRecord(record = {}) {
  if ((record.category || record.recordType || record.patientClassification) === TB_CATEGORY) return true;
  const programs = record.selectedPrograms ?? record.monitoringData?.selectedPrograms ?? record.monitoring_data?.selectedPrograms;
  if (Array.isArray(programs) && programs.includes("TB")) return true;
  return hasContent(record.tb_data ?? record.tbData);
}
```

TB grouping by data: in `utils/healthRecordPrograms.js` `getSpecializedRecordPrograms`, directly after the `const keys = ...` line add
```js
    if (isTbRecord(record) && !keys.includes("tb")) keys.push("tb");
```
(`keys` is always a fresh array there, so pushing onto it is safe), and import `isTbRecord` from `./tbRecords.js`. In `SpecializedRecordsTab.jsx` change the filter to
```js
      isOwnPatientRecord(record, patient) &&
      (program === "tb" ? isTbRecord(record) : getSpecializedRecordType(record) === program),
```
importing `isTbRecord` from `../../../utils/tbRecords`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test $(find src config -name "*.test.js")` (includes `careTracking.test.js`, whose TB records carry `tbData`) and `php artisan test --filter="RemovedHypertensionDiabetesProgramTest|ConsultationProgramsTest|ConsultationWorkflowRevisionTest|RemoveHypertensionDiabetesProgramMigrationTest"`, then the full-suite comparison.
Expected: PASS, no new backend failures. `ConsultationWorkspace.jsx` still passes the old arguments; `npx vite build` must still succeed (extra arguments are ignored). Run it.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils backend/app/Services/ConsultationPrograms.php backend/tests frontend/src/components/features/records/SpecializedRecordsTab.jsx
git commit -m "feat(care-plan): step model with Care Plan and conditional Monitoring Details; TB leaves programs"
```

### Task 9: Care Plan section and Monitoring Details in the workspace

**Files:**
- Create: `frontend/src/components/features/health-records/wizard/CarePlanSection.jsx`
- Create: `frontend/src/components/features/health-records/wizard/MonitoringDetailsForms.jsx`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`
- Modify: `frontend/src/services/healthRecordService.js`

**Interfaces:**
- Consumes: everything from Task 7; `MONITORING_STEP` from Task 8; `ReferralFacilityField`, `ClinicalFieldGroup`, `FieldInput`, `FieldTextarea`, `TimePickerField` (existing).
- Produces:
  - `CarePlanSection` props: `{ diagnoses, continuedMonitorings, stops, registry, followUp: { date, time, reason }, referral: { reason, urgencyLevel }, referralFacilityField, showsFollowUp, errors, disabled, onCarePlanChange(diagnosisId, value), onStopChange(monitoringId, reasonOrNull), onFollowUpChange(field, value), onReferralChange(field, value) }`.
  - `MonitoringDetailsForms` props: `{ detailKeys, tbData, onTbDataChange, recordId }`; exports `MONITORING_DETAIL_FORMS` (`{ tb_dots: TbDotsDetails }`).
  - Workspace state: `continuedFollowUpTaskIds: number[]`, `continuedMonitorings: {id, conditionName, conditionKey}[]`, `monitoringStops: {[id]: string}`; draft payload keys `carePlan.{continuedFollowUpTaskIds, continuedMonitoringIds, monitoringStops}` (Task 3 schema) — `continuedMonitorings` names are re-read from `care-overview` on resume, so the draft stores ids only.
  - Save payload: `care_plan` (from `buildCarePlanPayload`), `diagnoses[].carePlan`, `tb_data` whenever `monitoringDetailKeys` includes `tb_dots`.

- [ ] **Step 1: Create `MonitoringDetailsForms.jsx`**

```jsx
import TbTreatmentCardForm from "../TbTreatmentCardForm";
import { MONITORING_DETAILS } from "../../../../utils/monitoringDetails";

function TbDotsDetails({ tbData, onTbDataChange, recordId }) {
  return <TbTreatmentCardForm value={tbData} onChange={onTbDataChange} recordId={recordId} />;
}

/**
 * monitoring_details key -> form. Adding a specialized workflow: declare the
 * key on the condition (backend registry), add its copy to
 * utils/monitoringDetails.js, its required fields to
 * App\Services\MonitoringDetails, and its form here.
 */
export const MONITORING_DETAIL_FORMS = {
  tb_dots: TbDotsDetails,
};

export default function MonitoringDetailsForms({ detailKeys = [], ...formProps }) {
  return (
    <div className="space-y-6">
      {detailKeys.map((key) => {
        const Form = MONITORING_DETAIL_FORMS[key];
        const details = MONITORING_DETAILS[key];
        if (!Form || !details) return null;
        return (
          <section key={key} aria-labelledby={`monitoring-details-${key}`}>
            <h2 id={`monitoring-details-${key}`} className="text-sm font-bold text-[#111827]">{details.label}</h2>
            <p className="mt-0.5 mb-3 text-xs leading-relaxed text-[#6B7280]">{details.description}</p>
            <Form {...formProps} />
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `CarePlanSection.jsx`**

```jsx
import { TimePickerField } from "../../../common/forms/DatePickerField";
import { ClinicalFieldGroup, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import { ATTENTION_LEVELS } from "../../../../utils/referralAttention";
import {
  CARE_PLAN_OPTIONS, carePlanFor, continuedByIdentity, conditionIdentity, continuingRows, monitors,
} from "../../../../utils/carePlan";

const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-[#374151]";

function StopReason({ monitoringId, value, error, disabled, onChange }) {
  return (
    <FieldInput
      label="Reason for stopping monitoring"
      required
      name={`carePlanStop.${monitoringId}`}
      value={value || ""}
      error={error}
      disabled={disabled}
      maxLength={500}
      onChange={(event) => onChange(monitoringId, event.target.value)}
    />
  );
}

/**
 * Care Plan & Next Steps: one plan per diagnosis, continued monitoring, then
 * the visit's single referral and single follow-up. Every rule it shows comes
 * from utils/carePlan.js.
 */
export default function CarePlanSection({
  diagnoses = [], continuedMonitorings = [], activeMonitorings = [], stops = {}, registry = {},
  followUp = {}, referral = {}, referralFacilityField = null, showsFollowUp = false,
  needsReferral = false, errors = {}, disabled = false,
  onCarePlanChange, onStopChange, onFollowUpChange, onReferralChange,
}) {
  const continuedMap = continuedByIdentity(continuedMonitorings, registry);
  const activeMap = continuedByIdentity(activeMonitorings, registry);
  const rows = continuingRows(diagnoses, continuedMonitorings, registry);

  return (
    <div className="space-y-6">
      <section aria-labelledby="care-plan-diagnoses">
        <h2 id="care-plan-diagnoses" className="text-sm font-bold text-[#111827]">This visit&apos;s diagnoses</h2>
        {diagnoses.length === 0 ? (
          <p className="mt-2 text-xs text-gray-500">No diagnosis was recorded under Assessment.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
            {diagnoses.map((diagnosis) => {
              const value = carePlanFor(diagnosis, continuedMonitorings, registry);
              const identity = conditionIdentity(diagnosis.name, registry);
              const continued = continuedMap.get(identity);
              const alreadyActive = continued || activeMap.get(identity);
              return (
                <li key={diagnosis.id} className="py-3">
                  <fieldset disabled={disabled}>
                    <legend className="text-sm font-semibold text-[#111827]">{diagnosis.name}</legend>
                    {alreadyActive && (
                      <p className="mt-0.5 text-xs text-[#6B7280]">
                        Monitored at BHC{alreadyActive.startedAt ? ` since ${alreadyActive.startedAt}` : ""}
                        {continued ? " — continued in this visit." : ". Choosing Monitor adds this visit to it."}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {CARE_PLAN_OPTIONS.map((option) => (
                        <label key={option.value} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                          <input
                            type="radio"
                            name={`care-plan-${diagnosis.id}`}
                            checked={value === option.value}
                            onChange={() => onCarePlanChange(diagnosis.id, option.value)}
                            className="h-4 w-4 accent-[#DC2626]"
                          />
                          <span className={value === option.value ? "font-semibold text-[#DC2626]" : "text-gray-600"}>{option.label}</span>
                        </label>
                      ))}
                    </div>
                    {continued && !monitors(value) && (
                      <div className="mt-2">
                        <StopReason monitoringId={continued.id} value={stops[continued.id]} error={errors[`carePlanStop.${continued.id}`]} disabled={disabled} onChange={onStopChange} />
                      </div>
                    )}
                  </fieldset>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {rows.length > 0 && (
        <section aria-labelledby="care-plan-continuing">
          <h2 id="care-plan-continuing" className="text-sm font-bold text-[#111827]">Continuing monitoring</h2>
          <ul className="mt-2 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
            {rows.map((monitoring) => {
              const stopping = Object.hasOwn(stops, monitoring.id);
              return (
                <li key={monitoring.id} className="py-3">
                  <fieldset disabled={disabled}>
                    <legend className="text-sm font-semibold text-[#111827]">{monitoring.conditionName}</legend>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                        <input type="radio" name={`continue-${monitoring.id}`} checked={!stopping} onChange={() => onStopChange(monitoring.id, null)} className="h-4 w-4 accent-[#DC2626]" />
                        <span className={!stopping ? "font-semibold text-[#DC2626]" : "text-gray-600"}>Continue monitoring</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                        <input type="radio" name={`continue-${monitoring.id}`} checked={stopping} onChange={() => onStopChange(monitoring.id, "")} className="h-4 w-4 accent-[#DC2626]" />
                        <span className={stopping ? "font-semibold text-[#DC2626]" : "text-gray-600"}>Stop monitoring</span>
                      </label>
                    </div>
                    {stopping && (
                      <div className="mt-2">
                        <StopReason monitoringId={monitoring.id} value={stops[monitoring.id]} error={errors[`carePlanStop.${monitoring.id}`]} disabled={disabled} onChange={onStopChange} />
                      </div>
                    )}
                  </fieldset>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {needsReferral && (
        <ClinicalFieldGroup title="Referral to RHU">
          {referralFacilityField}
          <div data-field="urgencyLevel">
            <p className={LABEL}>Priority</p>
            <RadioChoiceGroup
              name="urgencyLevel"
              value={referral.urgencyLevel || ""}
              options={ATTENTION_LEVELS.map((level) => ({ value: level, label: level }))}
              disabled={disabled}
              error={errors.urgencyLevel}
              onChange={(value) => onReferralChange("urgencyLevel", value)}
            />
          </div>
          <FieldTextarea
            label="Reason for referral"
            required
            name="reasonForReferral"
            value={referral.reason || ""}
            error={errors.reasonForReferral}
            disabled={disabled}
            rows={3}
            onChange={(event) => onReferralChange("reason", event.target.value)}
          />
        </ClinicalFieldGroup>
      )}

      {showsFollowUp && (
        <ClinicalFieldGroup title="Next follow-up">
          <p className="text-xs text-[#6B7280]">Optional. Linked to every condition monitored in this visit.</p>
          <FieldInput label="Follow-up date" type="date" name="followUpDate" value={followUp.date || ""} error={errors.followUpDate} disabled={disabled} onChange={(event) => onFollowUpChange("date", event.target.value)} />
          <TimePickerField label="Follow-up time" value={followUp.time || ""} disabled={disabled} onChange={(value) => onFollowUpChange("time", value)} />
          {followUp.date && (
            <FieldTextarea label="Follow-up reason" required name="followUpReason" value={followUp.reason || ""} error={errors.followUpReason} disabled={disabled} rows={2} onChange={(event) => onFollowUpChange("reason", event.target.value)} />
          )}
        </ClinicalFieldGroup>
      )}

      {!needsReferral && !showsFollowUp && rows.length === 0 && (
        <p className="border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#374151]">No follow-up or referral required.</p>
      )}
    </div>
  );
}
```
Before writing, open `components/features/health-records/fields/ClinicalFields.jsx` and `components/common/forms/DatePickerField.jsx` and match the real prop names of `ClinicalFieldGroup`, `FieldInput`, `FieldTextarea`, `RadioChoiceGroup` and `TimePickerField` (use how `NextActionSection.jsx` calls them as the reference). Keep the structure above; adjust only prop names.

- [ ] **Step 3: Wire the workspace**

In `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (search for each anchor):

1. Imports: add `CarePlanSection`, `MonitoringDetailsForms`, `MONITORING_STEP`, `{ buildCarePlanPayload, buildReferralReason, carePlanFor, deriveDisposition, monitoredConditionKeys, validateCarePlan }` from `utils/carePlan`, `{ monitoringDetailKeys as getMonitoringDetailKeys }` from `utils/monitoringDetails`.
2. State (next to `const [followUpDate, setFollowUpDate] = useState("")`):
```js
  // Care Plan & Next Steps: what this ITR continues (Start Consultation modal)
  // and stops. Names come from care-overview; drafts store ids only.
  const [continuedFollowUpTaskIds, setContinuedFollowUpTaskIds] = useState([]);
  // { id, sourceHealthRecordId } per continued follow-up; the first one's
  // source ITR becomes parent_health_record_id (display/compatibility only).
  const [continuedFollowUps, setContinuedFollowUps] = useState([]);
  const [continuedMonitorings, setContinuedMonitorings] = useState([]);
  const [monitoringStops, setMonitoringStops] = useState({});
  // Every active monitoring record of this patient (care-overview, Task 10),
  // selected or not - only used to note "Already monitored at BHC" on a row.
  const [activeMonitorings, setActiveMonitorings] = useState([]);
```
3. Derived values (after `const stepOrder = ...`, and change `consultationSteps`/`stepOrder` to pass the keys):
```js
  const carePlanDisposition = deriveDisposition({
    diagnoses, continuedMonitorings, stops: monitoringStops, registry: clinicalRegistry,
    serviceNeedsNextVisit: isImmunization,
  });
  const monitoringDetailKeys = getMonitoringDetailKeys(
    monitoredConditionKeys(diagnoses, continuedMonitorings, monitoringStops, clinicalRegistry),
    clinicalRegistry,
  );
```
   `buildConsultationSteps({ selectedPrograms, primaryProgram, monitoringDetailKeys })` and `getStepOrder(programFormSteps, monitoringDetailKeys)`. `clinicalRegistry` is already read via `useClinicalRegistry()` (search `useClinicalRegistry`); move that line above these derivations if it is declared later.
4. `isTb`: replace `const isTb = recordTypeKey === "tb dots / tb monitoring" || selectedPrograms.includes("TB");` with `const isTb = monitoringDetailKeys.includes("tb_dots");` (declare it after `monitoringDetailKeys`; move usages that precede it below, or compute `monitoringDetailKeys` earlier — it only depends on `diagnoses`, the three care-plan states and `clinicalRegistry`).
5. Navigation: the `WIZARD_NEXT` phase now has two screens. Add `const [nextScreen, setNextScreen] = useState(NEXT_STEP);` and:
   - Where the Next Care Decision "Continue" handler moves to Review (search `handleContinueToReview` or the handler bound to the Next phase's primary button), run `validateCarePlan(...)` (merge into the errors it already computes), then: if `monitoringDetailKeys.length > 0 && nextScreen === NEXT_STEP` → `setNextScreen(MONITORING_STEP)` and stop; otherwise continue to Review as today.
   - The Next phase's "Previous" from `MONITORING_STEP` → `setNextScreen(NEXT_STEP)`; from Review back → `MONITORING_STEP` when `monitoringDetailKeys.length > 0`.
   - `currentStepKey` for the progress bar: `wizardPhase === WIZARD_NEXT ? nextScreen : ...`.
   - If `monitoringDetailKeys` becomes empty while `nextScreen === MONITORING_STEP`, reset to `NEXT_STEP` (`useEffect` on `monitoringDetailKeys.length`).
6. Render: replace the `nextActionSection` usage in the Next phase (search `{nextActionSection}`) with:
```jsx
{nextScreen === MONITORING_STEP ? (
  <MonitoringDetailsForms detailKeys={monitoringDetailKeys} tbData={tbData} onTbDataChange={setTbData} recordId={null} />
) : (
  <CarePlanSection
    diagnoses={diagnoses}
    continuedMonitorings={continuedMonitorings}
    stops={monitoringStops}
    registry={clinicalRegistry}
    followUp={{ date: followUpDate, time: followUpTime, reason: followUpReason }}
    referral={{ reason: referralForm.reasonForReferral, urgencyLevel: referralForm.urgencyLevel }}
    activeMonitorings={activeMonitorings}
    referralFacilityField={
      <ReferralFacilityField
        value={receivingRhuId}
        error={validationErrors.receivingRhuId}
        disabled={patientGateLocked}
        onChange={(id) => {
          clearValidationError("receivingRhuId");
          setReceivingRhuId(id);
        }}
      />
    }
    showsFollowUp={carePlanDisposition.showsFollowUp}
    needsReferral={carePlanDisposition.needsReferral}
    errors={validationErrors}
    disabled={patientGateLocked || workspaceLocked}
    onCarePlanChange={(id, value) => setDiagnoses((current) => current.map((d) => (d.id === id ? { ...d, carePlan: value } : d)))}
    onStopChange={(monitoringId, reason) => setMonitoringStops((current) => {
      const next = { ...current };
      if (reason === null) delete next[monitoringId]; else next[monitoringId] = reason;
      return next;
    })}
    onFollowUpChange={(field, value) => ({ date: setFollowUpDate, time: setFollowUpTime, reason: setFollowUpReason })[field](value)}
    onReferralChange={(field, value) => setReferralForm((prev) => ({ ...prev, [field === "reason" ? "reasonForReferral" : field]: value }))}
  />
)}
```
   Delete the TB `FormSection` block that renders `TbTreatmentCardForm` under `showProgramBlock("TB DOTS / TB Monitoring")` (it now lives in Monitoring Details).
7. Keep `needsReferral` / `followUpStatus` in sync with the care plan (these drive every existing save rule): add
```js
  useEffect(() => {
    setNeedsReferral(carePlanDisposition.needsReferral);
    setFollowUpStatus(followUpDate ? "Follow-up Required" : "Completed");
  }, [carePlanDisposition.needsReferral, followUpDate]);
```
   and pre-fill the referral reason once when referral becomes needed and the reason is empty:
```js
  useEffect(() => {
    if (!carePlanDisposition.needsReferral) return;
    setReferralForm((prev) => (prev.reasonForReferral?.trim()
      ? prev
      : { ...prev, reasonForReferral: buildReferralReason(diagnoses, continuedMonitorings, clinicalRegistry) }));
  }, [carePlanDisposition.needsReferral]); // eslint-disable-line react-hooks/exhaustive-deps -- pre-fill once; the worker edits after
```
8. Save payload (`formData` in the finalize handler):
   - `finalNeedsReferral` becomes `carePlanDisposition.needsReferral`.
   - `effectiveFollowUpDate`: drop the `finalNeedsReferral ? "" :` guard when `carePlanDisposition.monitorsAny` (a monitored + referred visit keeps its follow-up): `const effectiveFollowUpDate = finalNeedsReferral && !carePlanDisposition.monitorsAny ? "" : followUpDate || immunizationNextScheduleDate || "";` — same change for `effectiveFollowUpTime`.
   - `diagnoses:` each entry gets its effective plan: `diagnoses.map((d) => ({ ...d, carePlan: carePlanFor(d, continuedMonitorings, clinicalRegistry) }))`.
   - `tbData: isTb ? tbData : null,`
   - add `carePlan: buildCarePlanPayload({ continuedFollowUpTaskIds, continuedMonitorings, stops: monitoringStops, diagnoses, registry: clinicalRegistry }),`
   - Continued follow-ups: when `continuedFollowUpTaskIds.length > 0`, `effectiveVisitType = "follow_up_visit"`, `followUpTaskId = continuedFollowUpTaskIds[0]`, `linkedParentRecordId` = that task's `source_health_record_id` (kept in state from the modal selection — store `continuedFollowUps` objects `{ id, sourceHealthRecordId }` alongside the ids).
9. Draft: add `carePlan: { continuedFollowUpTaskIds, continuedMonitoringIds: continuedMonitorings.map((m) => m.id), monitoringStops: Object.entries(monitoringStops).map(([monitoringId, reason]) => ({ monitoringId: Number(monitoringId), reason })) }` to the draft payload builder (search `referralForm: pickDraftFields(`), and on restore (search `setReferralForm(` in the restore function) set the three states; `continuedMonitorings` names are filled by the care-overview query in Task 10 — until then restore `{ id, conditionName: "Monitored condition", conditionKey: null }`.
10. Client validation: in `getClinicalValidationErrors`, merge `validateCarePlan({ diagnoses, continuedMonitorings, stops: monitoringStops, registry: clinicalRegistry })`. Remove the rule `if ((needsReferral || ...) && !diagnosis.trim()) errors.diagnosis = "BHC Assessment is required..."` only if `diagnosis` is always derived from `diagnoses` in the step flow (it is: `joinDiagnosisNames`); otherwise keep it.

In `frontend/src/services/healthRecordService.js` (API payload builder):
- `vital_signs`: add `fbs: record.fbs ?? null,` (Task 13 adds the input; `null` until then).
- `tb_data`: replace the category/program gate with `record.tbData || record.tb_data || null` (the workspace already sends `null` unless Monitoring Details includes TB). Keep the later `delete payload.tb_data` guards.
- add `care_plan: record.carePlan || null,` next to `diagnoses`, and `if (!hasAny(record, ["carePlan"])) delete payload.care_plan;` next to the `diagnoses` delete.
- `diagnoses` already goes through `normalizeDiagnoses`, which keeps `carePlan` (Task 7).

- [ ] **Step 4: Verify**

Run (from `frontend/`): `node --test $(find src config -name "*.test.js")`, `npx eslint .`, `npx vite build`.
Expected: all pass; eslint shows only the pre-existing RHU warning.

Then run the app (use the `run` skill, or `npm run dev` with the backend `php artisan serve` against a **local** database — never Supabase) and check by hand:
- A consultation with "Hypertension" → Monitor at BHC: Care Plan shows Next follow-up; no Monitoring Details step; save creates one `condition_monitorings` row.
- "PTB" → Monitor at BHC: Monitoring Details appears after Care Plan with the TB card; the saved record has `tb_data` and category General Consultation.
- "Diabetes Mellitus" → Monitor at BHC + Refer to RHU with a follow-up date: referral fields shown with "Referred for: Diabetes Mellitus"; after save the referral and the follow-up task both exist.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/features/health-records/wizard/CarePlanSection.jsx frontend/src/components/features/health-records/wizard/MonitoringDetailsForms.jsx frontend/src/pages/bhc/ConsultationWorkspace.jsx frontend/src/services/healthRecordService.js
git commit -m "feat(care-plan): Care Plan & Next Steps and Monitoring Details in the consultation"
```

### Task 10: Start Consultation modal

**Files:**
- Create: `frontend/src/services/careOverviewService.js`
- Create: `frontend/src/utils/startConsultation.js`, `frontend/src/utils/startConsultation.test.js`
- Create: `frontend/src/components/features/patients/profile/StartConsultationModal.jsx`
- Modify: `frontend/src/utils/consultationRoute.js`, `frontend/src/utils/consultationRoute.test.js`
- Modify: `frontend/src/hooks/usePatientConsultation.js`, `frontend/src/components/features/patients/profile/PatientProfileHeader.jsx`
- Modify: `frontend/src/components/features/followups/followUpStatusStyles.jsx` (`buildRecordFollowUpVisitPath`)
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (read the new route kind)
- Modify: `frontend/src/utils/queryKeys.js`

**Interfaces:**
- Consumes: `GET /patients/{id}/care-overview` (Task 6).
- Produces:
  - `getCareOverview(patientId)` → `{ pendingFollowUps: [{ id, dueDate, dueTime, state, isOverdue, reason, sourceHealthRecordId, sourceDate, conditions: [{ monitoringId, conditionName }] }], monitoringWithoutFollowUp: [{ id, conditionName, conditionKey, startedAt, lastVisitDate, lastHealthRecordId }] }`.
  - `queryKeys.careOverview(patientId)`.
  - `needsStartModal(overview)` → boolean; `selectionToRoute({ patientId, followUpIds, monitoringIds })` → path; `buildPatientConsultationPath` unchanged for "Start New Consultation".
  - Route: `/bhc/health-records/add?patientId=P&mode=continue&followUpIds=1,2&monitoringIds=3` → `resolveBhcConsultationRoute` returns `{ kind: "continue", patientId, followUpIds: number[], monitoringIds: number[] }`. The legacy `mode=followup&followUpId=X` resolves to `{ kind: "continue", patientId, followUpIds: [X], monitoringIds: [] }` (the Follow-ups "Record Visit" button).

- [ ] **Step 1: Write the failing tests**

`frontend/src/utils/startConsultation.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { needsStartModal, selectionToRoute } from "./startConsultation.js";

test("the modal is skipped when nothing is pending or monitored", () => {
  assert.equal(needsStartModal({ pendingFollowUps: [], monitoringWithoutFollowUp: [] }), false);
  assert.equal(needsStartModal(null), false);
  assert.equal(needsStartModal({ pendingFollowUps: [{ id: 1 }], monitoringWithoutFollowUp: [] }), true);
  assert.equal(needsStartModal({ pendingFollowUps: [], monitoringWithoutFollowUp: [{ id: 4 }] }), true);
});

test("a selection becomes a continue route", () => {
  assert.equal(
    selectionToRoute({ patientId: 17, followUpIds: [1, 2], monitoringIds: [4] }),
    "/bhc/health-records/add?patientId=17&mode=continue&followUpIds=1%2C2&monitoringIds=4",
  );
});
```
Append to `frontend/src/utils/consultationRoute.test.js`:
```js
test("continue routes carry the selected follow-ups and monitoring", () => {
  assert.deepEqual(
    resolveBhcConsultationRoute("?patientId=17&mode=continue&followUpIds=1,2&monitoringIds=4"),
    { kind: "continue", patientId: "17", followUpIds: [1, 2], monitoringIds: [4] },
  );
  assert.deepEqual(
    resolveBhcConsultationRoute("?patientId=17&mode=followup&followUpId=9"),
    { kind: "continue", patientId: "17", followUpIds: [9], monitoringIds: [] },
  );
});
```
(Remove or update the existing test asserting `{ kind: "followup", ... }`.)

Run: `node --test src/utils/startConsultation.test.js src/utils/consultationRoute.test.js` — Expected: FAIL.

- [ ] **Step 2: Implement the pure modules**

`frontend/src/utils/startConsultation.js`:
```js
/** Start Consultation shows the modal only when there is something to continue. */
export function needsStartModal(overview) {
  return Boolean(overview && (overview.pendingFollowUps?.length || overview.monitoringWithoutFollowUp?.length));
}

export function selectionToRoute({ patientId, followUpIds = [], monitoringIds = [] }, basePath = "/bhc") {
  const params = new URLSearchParams({ patientId: String(patientId), mode: "continue" });
  if (followUpIds.length) params.set("followUpIds", followUpIds.join(","));
  if (monitoringIds.length) params.set("monitoringIds", monitoringIds.join(","));
  return `${basePath}/health-records/add?${params.toString()}`;
}
```
In `consultationRoute.js`, add a helper and replace the `mode === "followup"` branch:
```js
function idList(value) {
  return String(value || "").split(",").map((part) => Number(part.trim())).filter((id) => Number.isInteger(id) && id > 0);
}
```
```js
  if (mode === "continue") {
    return { kind: "continue", patientId, followUpIds: idList(params.get("followUpIds")), monitoringIds: idList(params.get("monitoringIds")) };
  }
  if (mode === "followup") {
    return followUpId
      ? { kind: "continue", patientId, followUpIds: idList(followUpId), monitoringIds: [] }
      : patientId ? { kind: "new", patientId } : { kind: "redirect", reason: "missing-follow-up" };
  }
```
Run the two tests — Expected: PASS.

- [ ] **Step 3: Service and query key**

`frontend/src/services/careOverviewService.js`:
```js
import { apiRequest, unwrapData } from "./apiClient";

/** Pending follow-ups and unscheduled active monitoring for Start Consultation. */
export async function getCareOverview(patientId) {
  const data = unwrapData(await apiRequest(`/patients/${patientId}/care-overview`)) || {};
  return {
    pendingFollowUps: (data.pending_follow_ups || []).map((task) => ({
      id: task.id,
      dueDate: task.due_date,
      dueTime: task.due_time,
      state: task.state,
      isOverdue: task.is_overdue === true,
      reason: task.reason || "",
      sourceHealthRecordId: task.source_health_record_id,
      sourceDate: task.source_date,
      conditions: (task.conditions || []).map((c) => ({ monitoringId: c.monitoring_id, conditionName: c.condition_name })),
    })),
    monitoringWithoutFollowUp: (data.monitoring_without_follow_up || []).map((m) => ({
      id: m.id,
      conditionName: m.condition_name,
      conditionKey: m.condition_key,
      startedAt: m.started_at,
      lastVisitDate: m.last_visit_date,
      lastHealthRecordId: m.last_health_record_id,
    })),
  };
}
```
In `utils/queryKeys.js` add `careOverview: (patientId) => ["care-overview", String(patientId)],` following the file's existing pattern.

- [ ] **Step 4: The modal**

`frontend/src/components/features/patients/profile/StartConsultationModal.jsx` (same `ModalShell` pattern as `UnfinishedConsultationModal.jsx`):
```jsx
import { useState } from "react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";

function toggle(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function isToday(date) {
  return date === new Date().toLocaleDateString("en-CA");
}

function Row({ checked, onChange, title, lines }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 border-b border-[#E5E7EB] px-1 py-2.5 last:border-b-0">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 flex-none accent-[#DC2626]" />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-900">{title}</span>
        {lines.filter(Boolean).map((line) => (
          <span key={line} className="block text-xs text-slate-500">{line}</span>
        ))}
      </span>
    </label>
  );
}

/**
 * Shown by Start Consultation only when the patient has pending follow-ups or
 * active monitoring with no follow-up (utils/startConsultation.needsStartModal).
 * Continue Selected links the ticked items to the new ITR; Start New
 * Consultation leaves them untouched.
 */
export default function StartConsultationModal({ overview, onContinue, onStartNew, onCancel }) {
  const [followUpIds, setFollowUpIds] = useState([]);
  const [monitoringIds, setMonitoringIds] = useState([]);
  const pending = overview?.pendingFollowUps || [];
  const unscheduled = overview?.monitoringWithoutFollowUp || [];
  const nothingSelected = followUpIds.length === 0 && monitoringIds.length === 0;

  return (
    <ModalShell
      open={Boolean(overview)}
      title="Start Consultation"
      size="md"
      onClose={onCancel}
      footer={
        <>
          <ModalButton onClick={onCancel}>Cancel</ModalButton>
          <ModalButton onClick={onStartNew}>Start New Consultation</ModalButton>
          <ModalButton variant="primary" primary disabled={nothingSelected} onClick={() => onContinue({ followUpIds, monitoringIds })}>
            Continue Selected
          </ModalButton>
        </>
      }
    >
      <div className="space-y-4 text-[13px] text-slate-600">
        <p>This patient has follow-ups or monitored conditions. Continue them in this visit, or start a new consultation.</p>
        {pending.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Pending follow-ups</h3>
            {pending.map((task) => (
              <Row
                key={task.id}
                checked={followUpIds.includes(task.id)}
                onChange={() => setFollowUpIds((current) => toggle(current, task.id))}
                title={`${task.dueDate}${task.isOverdue ? " · Overdue" : isToday(task.dueDate) ? " · Due" : ""}`}
                lines={[
                  task.reason,
                  task.conditions.map((c) => c.conditionName).join(", "),
                  task.sourceDate && `From visit on ${task.sourceDate}`,
                ]}
              />
            ))}
          </section>
        )}
        {unscheduled.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Monitored at BHC — no follow-up scheduled</h3>
            {unscheduled.map((monitoring) => (
              <Row
                key={monitoring.id}
                checked={monitoringIds.includes(monitoring.id)}
                onChange={() => setMonitoringIds((current) => toggle(current, monitoring.id))}
                title={monitoring.conditionName}
                lines={[
                  monitoring.startedAt && `Monitoring since ${monitoring.startedAt}`,
                  monitoring.lastVisitDate && `Last visit ${monitoring.lastVisitDate}`,
                ]}
              />
            ))}
          </section>
        )}
      </div>
    </ModalShell>
  );
}
```
Check `ModalShell`'s accepted `size` values (`grep -n "size" frontend/src/components/common/modals/ModalShell.jsx`); use `"sm"` if `"md"` is not one.

- [ ] **Step 5: Open it from Start Consultation**

In `hooks/usePatientConsultation.js`: add a `useQuery({ queryKey: queryKeys.careOverview(patientId), queryFn: () => getCareOverview(patientId), enabled: Boolean(patientId), staleTime: 0 })` and return `careOverview` and `needsStartModal: !draft && needsStartModal(careOverview)`. A draft still wins: `startPath` resumes it exactly as today.

In `PatientProfileHeader.jsx`'s `ConsultationButton` usage: when `consultation.needsStartModal`, the button opens `StartConsultationModal` (local `useState`) instead of navigating; `onContinue` → `navigate(selectionToRoute({ patientId, followUpIds, monitoringIds }))`; `onStartNew` → `navigate(buildPatientConsultationPath(patientId))`. Read `ConsultationButton` first; if it renders a `<Link>`, give it an `onClick` override prop rather than duplicating it.

In `followUpStatusStyles.jsx`'s `buildRecordFollowUpVisitPath`: return `selectionToRoute({ patientId: task.patientId, followUpIds: [task.id] }, basePath)` so "Record Visit" opens the standard flow with that follow-up continued.

- [ ] **Step 6: Read the continue route in the workspace**

In `ConsultationWorkspace.jsx` where `resolveBhcConsultationRoute` is used: for `kind === "continue"`, open the step flow for the patient exactly like `kind === "new"`, and seed state from a `useQuery(queryKeys.careOverview(patientId), ...)`:
```js
const selectedFollowUps = overview.pendingFollowUps.filter((t) => route.followUpIds.includes(t.id));
setContinuedFollowUpTaskIds(selectedFollowUps.map((t) => t.id));
setContinuedFollowUps(selectedFollowUps.map((t) => ({ id: t.id, sourceHealthRecordId: t.sourceHealthRecordId })));
setContinuedMonitorings(uniqueById([
  ...selectedFollowUps.flatMap((t) => t.conditions.map((c) => ({ id: c.monitoringId, conditionName: c.conditionName, conditionKey: null }))),
  ...overview.monitoringWithoutFollowUp.filter((m) => route.monitoringIds.includes(m.id)).map((m) => ({ id: m.id, conditionName: m.conditionName, conditionKey: m.conditionKey })),
]));
```
(`uniqueById` — a two-line local helper keeping the first entry per `id`.) For **every** route kind (new, continue, draft), once the overview loads also run:
```js
setActiveMonitorings(uniqueById([
  ...overview.monitoringWithoutFollowUp.map((m) => ({ id: m.id, conditionName: m.conditionName, conditionKey: m.conditionKey, startedAt: m.startedAt })),
  ...overview.pendingFollowUps.flatMap((t) => t.conditions.map((c) => ({ id: c.monitoringId, conditionName: c.conditionName, conditionKey: null }))),
]));
```
so Care Plan can note "Monitored at BHC" on a diagnosis whose condition is already active even when the worker did not select it. Seed the continued selection only once per consultation (guard with a ref), and do the same name fill-in for a restored draft's `continuedMonitoringIds`. When a continued monitoring's `conditionKey === "tuberculosis"` and `tbData` is still empty, load its `lastHealthRecordId` record (existing `getHealthRecord` in `healthRecordService.js`) and `setTbData(normalizeTbData(record.tbData || record.tb_data))` — the same prefill the old follow-up form did.

For `pendingFollowUps` conditions the payload has no `condition_key`; `conditionKey: null` falls back to name identity, which matches because a registered condition's stored name is its registry name.

- [ ] **Step 7: Verify**

Run: `node --test $(find src config -name "*.test.js")`, `npx eslint .`, `npx vite build` — all pass.
Manual (local DB): a patient with no history → Start Consultation opens the form directly. After saving a Hypertension "Monitor at BHC" visit **with** a follow-up date → Start Consultation shows the modal with that follow-up under Pending; Continue Selected → Care Plan pre-lists Hypertension as continuing; saving fulfils the task. A visit that monitored Asthma **without** a date → the modal lists Asthma under "no follow-up scheduled". Follow-ups page "Record Visit" opens the step flow (not the old form).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/services/careOverviewService.js frontend/src/utils/startConsultation.js frontend/src/utils/startConsultation.test.js frontend/src/components/features/patients/profile/StartConsultationModal.jsx frontend/src/utils/consultationRoute.js frontend/src/utils/consultationRoute.test.js frontend/src/hooks/usePatientConsultation.js frontend/src/components/features/patients/profile/PatientProfileHeader.jsx frontend/src/components/features/followups/followUpStatusStyles.jsx frontend/src/pages/bhc/ConsultationWorkspace.jsx frontend/src/utils/queryKeys.js
git commit -m "feat(care-plan): Start Consultation modal continues follow-ups and monitoring"
```

---

## Phase 3 — Retire the legacy follow-up form and dead flags

### Task 11: Remove dead branches from the consultation

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`
- Delete: `frontend/src/components/features/health-records/PurposeOfVisitModal.jsx`
- Modify: `frontend/src/utils/visitPurpose.js` (keep only what `BhcConsultationDetails.jsx` / `PregnancyConfirmation.jsx` import) and its test
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php`, `backend/app/Services/HealthRecordDraftPayloadService.php` (drop `VisitPurpose` rules/validation)
- Modify: `backend/app/Services/VisitPurpose.php` (delete if no other reference remains) and `backend/tests/Unit/Services/RemovedHypertensionDiabetesProgramTest.php` (its `VisitPurpose::SERVICES` assertion)

**Interfaces:** none new. After this task the BHC workspace has exactly one rendering path.

- [ ] **Step 1: Make every BHC visit use the step flow**

Every entry now resolves to `kind: "new" | "continue" | "draft"` (Task 10). Replace
```js
  const usesConsultationSteps =
    !isFollowUpVisitMode && !isEditingRecord && consultationType === "new";
```
with `const usesConsultationSteps = true;` and run the build — Expected: succeeds.

- [ ] **Step 2: Delete dead constants and their branches, one identifier at a time**

For each identifier below: delete the constant, then resolve every reference by keeping the branch the constant always selected, and run `npx vite build` after each identifier.

| Identifier | Always | Keep |
|---|---|---|
| `purposeFlow` | `false` | the `false` branch; delete `visitPurpose`, `purposeOpen`, `applyVisitPurpose`, `PurposeOfVisitModal`, `PregnancyConfirmation` usage, `teenagePrenatal`, `knownVisitPurpose`, `purposePrograms`, `purposeErrors` imports/usages |
| `generalSelected` | `true` | the `true` branch (e.g. drop the "BHC Assessment" Treatment block) |
| `isEditingRecord` | `false` | the `false` branch |
| `usesConsultationSteps` | `true` | the `true` branch; then delete the constant |
| `isFollowUpVisitMode`, `isLinkedFollowUpVisit`, `isGeneralConsultationFollowUp`, `hasRouteFollowUpContext`, `routeLinkedFollowUpTask`, `followUpRecord`, `effectiveLinkedFollowUpTask`, `effectiveFollowUpParentRecordId`, `effectiveFollowUpTaskId`, `followUpPatientName` | legacy follow-up form | nothing — continued visits use `continuedFollowUps` (Task 9/10). Delete the loaders that fetch the follow-up task/record for the old form. |
| `reportingRows` free-text branch | step flow | `diagnoses` only |
| `nextActionSection` / `NextActionSection` import | replaced by Care Plan | delete from this file only (the RHU page still imports the component) |

After the table: `grep -nE "purposeFlow|generalSelected|isEditingRecord|usesConsultationSteps|isFollowUpVisitMode|followUpRecord|routeLinkedFollowUpTask|PurposeOfVisitModal|NextActionSection" frontend/src/pages/bhc/ConsultationWorkspace.jsx` — Expected: no output.

- [ ] **Step 3: Trim `visitPurpose.js` and the backend**

Keep only `VISIT_SERVICES` and `TEENAGE_PREGNANCY_MESSAGE` (still imported by `BhcConsultationDetails.jsx` and `PregnancyConfirmation.jsx`; `grep -rn "utils/visitPurpose" frontend/src` to confirm), delete `PurposeOfVisitModal.jsx`, and drop tests for removed functions. If `PregnancyConfirmation.jsx` is no longer imported anywhere, delete it too.

Backend: remove `...VisitPurpose::rules('monitoring_data.visitPurpose'),` and `VisitPurpose::validate($validator, $this);` from `HealthRecordRequest`, and `...VisitPurpose::rules('payload.visitPurpose'),` from the draft service. `grep -rn "VisitPurpose" backend/app backend/tests`; if only `RemovedHypertensionDiabetesProgramTest` remains, delete its `VisitPurpose::SERVICES` assertion and `use` line and delete `backend/app/Services/VisitPurpose.php`. Also remove the `visitPurpose` override audit block in `HealthRecordController::store()` (`$purpose = $record->monitoring_data['visitPurpose'] ?? null; ...`). Old records keep their stored `visitPurpose` JSON; only new-save validation goes.

- [ ] **Step 4: Verify**

Frontend: `node --test $(find src config -name "*.test.js")`, `npx eslint .`, `npx vite build` — all pass. Backend: full-suite comparison — no new failures.
Manual: open an **old** follow-up record's details page (Health Records → a `follow_up_visit` record) — it renders as before. Start a new consultation, a continued one, and resume a draft — all use the step flow.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src backend/app backend/tests
git commit -m "refactor(consultation): one step-based flow; remove legacy follow-up form and dead flags"
```

---

## Phase 4 — Services panel, FBS, surveillance, TB readers

### Task 12: Per-diagnosis surveillance, HFMD registry removal, TB readers

**Files:**
- Modify: `frontend/src/components/features/health-records/wizard/DiagnosisReportingField.jsx`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (Records & Surveillance block, surveillance suggestion code, `surveillanceTags` state)
- Modify: `frontend/src/utils/surveillance.js` (+ test), `frontend/src/pages/bhc/BHCReports.jsx`, `frontend/src/services/healthRecordService.js`
- Modify: `frontend/src/pages/bhc/FollowUps.jsx` (TB service-type filter)
- Modify: `backend/config/clinical_registry.php`, `backend/app/Services/ClinicalRegistry.php`, `backend/app/Http/Requests/HealthRecordRequest.php`, `backend/app/Http/Controllers/Api/HealthRecordController.php`
- Modify tests: `backend/tests/Feature/SurveillanceRegistryTest.php`, `backend/tests/Unit/Services/ClinicalRegistryTest.php`
- Create: `backend/tests/Feature/TbRecordDetectionTest.php`

**Interfaces:**
- Produces: `getSurveillanceDiagnoses(record)` in `utils/surveillance.js` → `[{ name }]` for diagnoses with `includeInSurveillance`, or — for a legacy record — `[{ name: "Hand, Foot and Mouth Disease" }]` when `getSurveillanceTags(record)` contains `"hfmd"`. `DiagnosisReportingField` gains `onSurveillanceChange(id, boolean)` and shows an "Include in Surveillance" checkbox per row.
- Backend index: `?category=TB DOTS / TB Monitoring` matches `category = that OR tb_data IS NOT NULL` (non-admin query path).

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/utils/surveillance.test.js`:
```js
test("surveillance diagnoses come from the per-diagnosis flag, with legacy HFMD kept", () => {
  assert.deepEqual(
    getSurveillanceDiagnoses({ diagnoses: [{ name: "HFMD", includeInSurveillance: true }, { name: "Cough" }] }),
    [{ name: "HFMD" }],
  );
  assert.deepEqual(
    getSurveillanceDiagnoses({ monitoring_data: { hfmdSurveillance: true } }),
    [{ name: "Hand, Foot and Mouth Disease" }],
  );
  assert.deepEqual(getSurveillanceDiagnoses({ diagnoses: [{ name: "Cough" }] }), []);
});
```
(import `getSurveillanceDiagnoses`.)

`backend/tests/Feature/TbRecordDetectionTest.php`:
```php
<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TbRecordDetectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_tb_filter_matches_legacy_category_and_new_tb_data(): void
    {
        $rhu = RuralHealthUnit::create(['name' => 'TB RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'TB BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'TB BHW', 'email' => 'tb@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $patient = Patient::create(['first_name' => 'TB', 'last_name' => 'Patient', 'sex' => 'Male', 'barangay_health_center_id' => $bhc->id]);
        $legacy = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'TB DOTS / TB Monitoring', 'barangay_health_center_id' => $bhc->id]);
        $new = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'tb_data' => ['diagnosis' => ['tbCaseNumber' => 'TB-1']], 'barangay_health_center_id' => $bhc->id]);
        HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $bhc->id]);
        $this->actingAs($user, 'sanctum');

        $ids = collect($this->getJson('/api/health-records?category='.urlencode('TB DOTS / TB Monitoring'))->assertOk()->json('data.data'))->pluck('id')->sort()->values()->all();

        $this->assertSame(collect([$legacy->id, $new->id])->sort()->values()->all(), $ids);
    }
}
```

In `SurveillanceRegistryTest`: delete `test_saving_with_hfmd_tagged_derives_the_legacy_mirror_fields`, `test_saving_with_no_tags_ticked_derives_false_and_null`, `test_an_unregistered_surveillance_key_is_rejected`, `test_surveillance_tags_round_trip_through_a_draft`; keep `test_omitting_surveillancetags_entirely_leaves_legacy_fields_untouched`; add:
```php
    public function test_include_in_surveillance_is_stored_on_the_diagnosis(): void
    {
        $id = $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Rash and fever',
            'diagnoses' => [['id' => 'd1', 'name' => 'HFMD', 'includeInSurveillance' => true]],
        ])->assertCreated()->json('data.id');

        $this->assertTrue(HealthRecord::findOrFail($id)->diagnoses[0]['includeInSurveillance']);
    }
```
Rename the class doc comment to describe per-diagnosis surveillance with legacy HFMD fields preserved. In `ClinicalRegistryTest`: delete `test_matches_surveillance_disease_by_name_or_alias`, the `isValidSurveillanceKey` assertions, and change `test_all_returns_both_lists` to expect `['monitored_conditions']` (rename to `test_all_returns_the_condition_list`).

Run: `node --test src/utils/surveillance.test.js`, `php artisan test --filter="TbRecordDetectionTest|SurveillanceRegistryTest|ClinicalRegistryTest"` — Expected: FAIL.

- [ ] **Step 2: Backend**

- `config/clinical_registry.php`: delete the `'surveillance_diseases' => [...]` block and its header bullet.
- `ClinicalRegistry`: delete `surveillanceDiseases()`, `matchSurveillance()`, `isValidSurveillanceKey()`, and the `surveillance_diseases` entry in `all()`; update the class comment.
- `HealthRecordRequest`: delete the `surveillanceTags` validation loop in `withValidator`.
- `HealthRecordController::normalizeSurveillanceData`: keep the method (it only acts when a client sends `surveillanceTags`); replace the registry-dependent comment with "Legacy clients only: derives the HFMD mirror fields from surveillanceTags." Nothing else changes, so old records and old clients keep working.
- `HealthRecordController::index()` non-admin path: replace
```php
        if ($request->query('category')) {
            $query->where('category', $request->query('category'));
        }
```
with
```php
        if ($category = $request->query('category')) {
            // New TB records are service/General Consultation with TB-DOTS data.
            $category === 'TB DOTS / TB Monitoring'
                ? $query->where(fn ($q) => $q->where('category', $category)->orWhereNotNull('tb_data'))
                : $query->where('category', $category);
        }
```
  The admin stored-function path (`akay_health_record_list`) still filters by category only; note it in `docs/ai/CURRENT.md` Open risks (Task 13) rather than redefining the SQL function here.

- [ ] **Step 3: Frontend**

- `utils/surveillance.js`: delete `matchSurveillanceDisease`; add
```js
const LEGACY_HFMD_NAME = "Hand, Foot and Mouth Disease";

/** Diagnoses included in the Surveillance Report; legacy HFMD-tagged records read as one HFMD row. */
export function getSurveillanceDiagnoses(record = {}) {
  const flagged = (Array.isArray(record.diagnoses) ? record.diagnoses : [])
    .filter((diagnosis) => diagnosis?.includeInSurveillance === true && String(diagnosis.name || "").trim())
    .map((diagnosis) => ({ name: String(diagnosis.name).trim() }));
  if (flagged.length) return flagged;
  return hasSurveillanceTag(getSurveillanceTags(record), "hfmd") ? [{ name: LEGACY_HFMD_NAME }] : [];
}
```
- `DiagnosisReportingField.jsx`: add prop `onSurveillanceChange`; in each row, after the report radios, add
```jsx
<label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
  <input type="checkbox" checked={row.includeInSurveillance === true} onChange={(event) => onSurveillanceChange(row.id, event.target.checked)} className="h-4 w-4 accent-[#DC2626]" />
  <span className={row.includeInSurveillance ? "font-semibold text-[#DC2626]" : "text-gray-600"}>Include in Surveillance</span>
</label>
```
  and update its doc comment.
- `ConsultationWorkspace.jsx`: in `reportingDecisions`, delete the whole `data-field="surveillanceTags"` block; pass `onSurveillanceChange={(id, value) => setDiagnoses((current) => current.map((d) => (d.id === id ? { ...d, includeInSurveillance: value } : d)))}` to `DiagnosisReportingField`; update the section helper text to "Choose the report for each diagnosis, and whether it is included in the Surveillance Report." Delete `surveillanceDiagnosisSuggestions`, `handleAddSurveillanceTag`, `surveillanceFieldRef`, `pendingRevealScrollRef` and its effect, the suggestion JSX under `DiagnosisListField`, the `surveillanceTags` state, its draft save/restore lines, and the `finalSurveillanceTags` / `finalHfmdSurveillance` / `finalSurveillanceCategory` payload fields (and their seven `formData` keys).
- `healthRecordService.js`: remove the `surveillanceTags` key from the API payload builder (the `"surveillanceTags"` entry in its key list, ~line 971) so new saves do not send it; keep `getSurveillanceTags` reads for display of old records.
- `BHCReports.jsx`: the Community-Based Surveillance report becomes "Surveillance Report": rows = one per `getSurveillanceDiagnoses(record)` entry (replace `isCommunitySurveillanceRecord` filtering), with a **Diagnosis** column; replace the registry-driven `surveillanceList` filter with a free-text diagnosis filter (`includes`, case-insensitive) or remove it; remove `clinicalRegistry.surveillance_diseases` usages and the "No HFMD surveillance cases" copy ("No diagnoses were included in surveillance for the selected filters."). Keep the report's key/slug so saved links keep working.
- `hooks/useClinicalRegistry.js` / `services/clinicalRegistryService.js`: drop `surveillance_diseases` from the empty shape and comments.
- TB readers (patient tabs and care tracking were switched in Task 8): in `BHCReports.jsx` and `pages/bhc/FollowUps.jsx`, wherever the "TB DOTS / TB Monitoring" service-type option is applied as a filter, match with `isTbRecord(record)` (for Follow-ups, test the task's `healthRecord`) instead of comparing the category string.

- [ ] **Step 4: Verify**

Run: `node --test $(find src config -name "*.test.js")`, `npx eslint .`, `npx vite build`, and `php artisan test --filter="TbRecordDetectionTest|SurveillanceRegistryTest|ClinicalRegistryTest"` then the full-suite comparison. Expected: all pass, no new backend failures.
`grep -rn "surveillance_diseases\|matchSurveillance\|isValidSurveillanceKey\|Add to Surveillance" frontend/src backend/app backend/config` — Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src backend/app backend/config backend/tests
git commit -m "feat(care-plan): per-diagnosis surveillance, retire HFMD registry, detect TB by data"
```

### Task 13: Barangay Health Services panel, FBS field, docs

**Files:**
- Modify: `frontend/src/components/features/health-records/wizard/ConsultationProgramPanel.jsx`
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx` (FBS input, panel titles in comments)
- Modify: `docs/ai/CURRENT.md`

- [ ] **Step 1: Panel**

In `ConsultationProgramPanel.jsx`:
- Delete `PROGRAM_GROUPS`, the grouping logic and the group headings; render `programs` as one list.
- Title "Barangay Health Services", helper "Select any service provided during this consultation. Leave unselected for a general consultation.", `aria-label="Barangay Health Services"`.
- Program titles: pass `Maternal Care` for `Maternal` (check where `wizardPrograms` builds `title` in the workspace — `grep -n "const wizardPrograms" frontend/src/pages/bhc/ConsultationWorkspace.jsx` — and set the display title there; keys stay `Maternal`, `Family Planning`, `EPI`).
- Show the "Make primary" control only when `selected.length >= 2`; keep the "Primary" badge only in that case too.
- Update the file's doc comment.

- [ ] **Step 2: FBS**

In the Concern & Vital Signs step, directly after the existing vital-sign inputs (search `setSpo2(` or the Height input), add:
```jsx
<div className="mt-4">
  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#374151]">Additional Measurements</p>
  <FieldInput
    label="Fasting Blood Sugar (FBS)"
    type="number"
    inputMode="decimal"
    min={0}
    max={1000}
    step="any"
    suffix="mg/dL"
    name="fbs"
    value={fbs}
    error={validationErrors["vital_signs.fbs"] || validationErrors.fbs}
    disabled={patientGateLocked}
    onChange={(event) => setFbs(event.target.value)}
  />
</div>
```
(match `FieldInput`'s real prop for a unit suffix; if it has none, put "mg/dL" in the label). Add `const [fbs, setFbs] = useState("");`, include `fbs` in the draft payload (`fbs`) and restore (`setFbs(payload.fbs || "")`), in `formData` (`fbs: fbs === "" ? null : Number(fbs)`), in the Review vitals summary (`fbs && \`FBS ${fbs} mg/dL\``), and map the server error key `vital_signs.fbs` to `INTERVIEW_STEP` in `getErrorOwnerStepKey` (`consultationSteps.js`: add `"fbs"` to the vitals list and `key === "vital_signs.fbs"`), with a test line in `consultationSteps.test.js`: `assert.equal(getErrorOwnerStepKey("vital_signs.fbs"), INTERVIEW_STEP);`. Nothing reads `fbs` to suggest anything.

- [ ] **Step 3: Verify**

Run: `node --test $(find src config -name "*.test.js")`, `npx eslint .`, `npx vite build`; backend full-suite comparison. Manual: the panel shows three services under "Barangay Health Services", "Make primary" appears only with two ticked; FBS "126" saves into `vital_signs.fbs` and shows on Review; a record with FBS 300 and no diabetes diagnosis gets no suggestion, monitoring or alert.

- [ ] **Step 4: Docs**

Update `docs/ai/CURRENT.md`'s handoff section: Last task (Care Plan & Next Steps, per the spec), Changes made (monitoring tables, care-overview, Start Consultation modal, one step flow, per-diagnosis surveillance, FBS, TB by data), Tests run (counts from this task), Open risks:
- `2026_09_30_000001_drop_care_pathway_tables` and `2026_09_30_000002_create_condition_monitoring_tables` not yet run on Supabase.
- Admin Health Records list (stored function `akay_health_record_list`) filters TB by category only.

Then delete the untracked `.scratch-*` baseline files.

- [ ] **Step 5: Commit**

```bash
git add frontend/src docs/ai/CURRENT.md
git commit -m "feat(care-plan): Barangay Health Services panel and optional FBS measurement"
```
