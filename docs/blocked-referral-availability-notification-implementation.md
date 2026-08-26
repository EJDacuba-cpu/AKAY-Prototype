# Blocked Referral / Doctor Availability Notification — Implementation Plan

**Status:** Approved for implementation. Decisions locked: **1A** (persist the
blocked attempt in a new `referral_holds` table — no TRK-02 status change) and
**2B** (notify on the actual availability transition — no cron, no
`expected_available_at` trigger).

**Supersedes nothing.** This is the concrete build-out of
`BlockedReferralDoctorAvailabilityPlan.md` §3, narrowed by the two decisions
above. `ReferralSubmissionGate.php` (DOC-14) is **not modified** — every claim
in the original plan's §3.4 ("the actual gate is unchanged") stays literally
true after this lands.

**Open items carried forward, not resolved here** (plan §5.1, §5.2): RHU
visibility of the waiting count, and Priority/Urgent fallback instructions.
Both are additive on top of this foundation and are called out at the end.

---

## 1. Why this shape

- **1A over a new TRK-02 status:** a blocked attempt never became a referral,
  so it does not belong in the `referrals` table or its status machine. Adding
  a status there would require auditing seven call sites
  (`ReferralNoShowService`, `ReferralWorkflowService`,
  `ReferralStatusRequest`, the `akay_referral_json` stored function defined
  twice in `2026_06_14_000001_create_akay_stored_functions.php`, etc.) for a
  state that isn't really a referral state. A dedicated table has zero blast
  radius on existing referral code.
- **Intent-only, not payload-storing:** the hold stores who/what/where, not a
  copy of clinical data. "Resubmit" re-opens the referral form pre-filled
  from the hold's fields; the BHW re-confirms and submits through the
  existing `POST /referrals` path unchanged. This avoids taking on
  `health_record_drafts`-style encryption-at-rest for a v1 feature.
- **2B over time-based reminders:** `RhuProviderController::update()` is the
  one place `availability_status` ever changes. Hooking it means the
  notification fires on truth (an actual flip to Available), not a guess —
  consistent with DOC-19's "compute from live state, never a stored
  prediction." It also needs no new scheduled job, config, or cron entry.
  `expected_available_at` is added anyway, but purely as **information shown
  to the BHW** (e.g. "Dr. Santos — back around 2:00 PM"), never as a trigger
  and never as a value any code branches on.

---

## 2. Data model

### 2.1 New table: `referral_holds`

New migration `backend/database/migrations/2026_08_26_000001_create_referral_holds_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A referral submission blocked by DOC-14 (zero available providers at the
 * receiving RHU). Recorded so the BHW is notified when a provider there
 * becomes available again, without inventing a "Blocked" referrals row or
 * TRK-02 status - the referral was never created, so it has no TRK-02 state
 * to be in.
 *
 * This table is written to ONLY after ReferralSubmissionGate::assertCanSubmit()
 * has already thrown NO_PROVIDER_AVAILABLE and that transaction has rolled
 * back. It never participates in the gate decision itself (DOC-14 stays a
 * live, uncached check) and is not read by ReferralSubmissionGate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('referral_holds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('barangay_health_center_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rural_health_unit_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            // Intent, not payload: enough to prefill the referral form and to
            // show the BHW what they were trying to send. No clinical text.
            $table->foreignId('health_record_id')->nullable()->constrained()->nullOnDelete();
            $table->string('urgency_level')->nullable();
            $table->foreignId('preferred_provider_id')->nullable()
                ->constrained('rhu_providers')->nullOnDelete();

            $table->string('status')->default('waiting'); // waiting|resubmitted|discarded|expired
            $table->timestamp('last_notified_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_referral_id')->nullable()
                ->constrained('referrals')->nullOnDelete();
            $table->timestamps();

            $table->index(
                ['rural_health_unit_id', 'status'],
                'referral_holds_rhu_status_idx'
            );
            $table->index(
                ['created_by', 'status'],
                'referral_holds_creator_status_idx'
            );
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'ALTER TABLE public.referral_holds ADD CONSTRAINT referral_holds_status_check '
            ."CHECK (status IN ('waiting', 'resubmitted', 'discarded', 'expired'))"
        );

        // Phase 2B posture (docs/database-exposure-containment.md): every
        // table created after that migration ran must enable RLS itself.
        // Safe now for the same reason it is safe on rhu_providers - Laravel
        // connects as table owner, which PostgreSQL exempts from RLS.
        DB::statement('ALTER TABLE public.referral_holds ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('referral_holds');
    }
};
```

**Note on `is_active` scoping:** `preferred_provider_id` intentionally has no
uniqueness or active-only constraint here — it is a snapshot reference for
display, matching how `referrals.preferred_provider_id` already behaves
(`2026_08_17_000003_add_provider_preference_and_reschedule_to_referrals.php`).
If the provider is later deactivated, the FK's `nullOnDelete` is not hit (soft
delete via `is_active = false` doesn't delete the row), so the reference
survives; the UI should just re-check `is_active` before offering it as a
prefill.

### 2.2 New column: `rhu_providers.expected_available_at`

New migration `backend/database/migrations/2026_08_26_000002_add_expected_available_at_to_rhu_providers.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * DOC-22-adjacent: an RHU-supplied, human-readable estimate of when an
 * Unavailable provider expects to be back (e.g. "In a meeting until 2pm" as a
 * timestamp instead of only free text in `remarks`).
 *
 * DISPLAY ONLY. Nothing reads this column to trigger a notification, change
 * availability_status, or feed the DOC-14 gate - doing so would repeat
 * exactly the drift DOC-19 warns against, since real schedules "change from
 * time to time" (confirmed in interview). The notification in this feature
 * fires off the ACTUAL availability_status transition
 * (RhuProviderController::update), never off this column.
 *
 * Consistent with DOC-15a-V: this is RHU-written informational data, not a
 * column that designates or automates a replacement provider.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->timestamp('expected_available_at')->nullable()->after('remarks');
        });
    }

    public function down(): void
    {
        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->dropColumn('expected_available_at');
        });
    }
};
```

---

## 3. Backend

### 3.1 `ReferralHold` model — `backend/app/Models/ReferralHold.php`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReferralHold extends Model
{
    public const STATUS_WAITING = 'waiting';
    public const STATUS_RESUBMITTED = 'resubmitted';
    public const STATUS_DISCARDED = 'discarded';
    public const STATUS_EXPIRED = 'expired';

    protected $fillable = [
        'patient_id',
        'barangay_health_center_id',
        'rural_health_unit_id',
        'created_by',
        'health_record_id',
        'urgency_level',
        'preferred_provider_id',
        'status',
        'last_notified_at',
        'resolved_at',
        'resolved_referral_id',
    ];

    protected $casts = [
        'last_notified_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function ruralHealthUnit(): BelongsTo
    {
        return $this->belongsTo(RuralHealthUnit::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
```

### 3.2 `ReferralHoldService` — `backend/app/Services/ReferralHoldService.php`

```php
<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\ReferralHold;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Records a DOC-14 blocked-submission attempt and, separately, notifies the
 * BHWs waiting on it once a provider at that RHU actually becomes available.
 *
 * Deliberately outside ReferralSubmissionGate: the gate stays a pure,
 * side-effect-free live check (plan section 3.4). This service is called
 * only AFTER the gate has already thrown and that transaction has already
 * rolled back - so recordBlockedAttempt() always runs in its own, fresh
 * transaction, never nested inside the one that failed.
 */
class ReferralHoldService
{
    public function __construct(
        private readonly UserNotificationService $notifications
    ) {
    }

    /**
     * @param  array{health_record_id?: int|null, urgency_level?: string|null, preferred_provider_id?: int|null}  $data
     */
    public function recordBlockedAttempt(
        User $bhw,
        Patient $patient,
        int $barangayHealthCenterId,
        RuralHealthUnit $rhu,
        array $data
    ): ReferralHold {
        return DB::transaction(fn (): ReferralHold => ReferralHold::create([
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $barangayHealthCenterId,
            'rural_health_unit_id' => $rhu->id,
            'created_by' => $bhw->id,
            'health_record_id' => $data['health_record_id'] ?? null,
            'urgency_level' => $data['urgency_level'] ?? null,
            'preferred_provider_id' => $data['preferred_provider_id'] ?? null,
            'status' => ReferralHold::STATUS_WAITING,
        ]));
    }

    /**
     * Called from RhuProviderController::update() right after a provider's
     * availability_status flips to Available. Notifies every BHW with a
     * still-waiting hold at this RHU. Not deduplicated by
     * notifyUsersOnce()'s permanent per-entity key - a BHW who has not yet
     * acted should hear about EVERY subsequent availability window, not just
     * the first. A short cooldown (last_notified_at) prevents a burst of
     * near-simultaneous provider updates from paging the same BHW repeatedly.
     */
    public function notifyWaitingHolds(RuralHealthUnit $rhu): void
    {
        $cooldownMinutes = config('operations.referral_holds.notify_cooldown_minutes');

        ReferralHold::query()
            ->where('rural_health_unit_id', $rhu->id)
            ->where('status', ReferralHold::STATUS_WAITING)
            ->where(function ($query) use ($cooldownMinutes): void {
                $query->whereNull('last_notified_at')
                    ->orWhere('last_notified_at', '<=', now()->subMinutes($cooldownMinutes));
            })
            ->with(['patient', 'creator'])
            ->get()
            ->each(function (ReferralHold $hold) use ($rhu): void {
                $patientName = $hold->patient?->full_name ?: 'A previously blocked referral';

                $this->notifications->notifyUser(
                    $hold->creator,
                    'Doctor Now Available',
                    "{$rhu->name} may now have an available doctor - {$patientName} can be resubmitted.",
                    'referral_hold_available',
                    null,
                    "/bhc/referrals/create?resume_hold={$hold->id}",
                    'referral_hold',
                    $hold->id
                );

                $hold->update(['last_notified_at' => now()]);
            });
    }

    public function discard(ReferralHold $hold): void
    {
        $hold->update([
            'status' => ReferralHold::STATUS_DISCARDED,
            'resolved_at' => now(),
        ]);
    }

    public function markResubmitted(ReferralHold $hold, int $referralId): void
    {
        $hold->update([
            'status' => ReferralHold::STATUS_RESUBMITTED,
            'resolved_at' => now(),
            'resolved_referral_id' => $referralId,
        ]);
    }
}
```

Add `'referral_holds' => ['notify_cooldown_minutes' => max(1, (int) env('AKAY_REFERRAL_HOLD_NOTIFY_COOLDOWN_MINUTES', 15))]`
to `backend/config/operations.php`, next to the existing `scheduler` block —
this is the only new config key this feature needs.

### 3.3 Wiring the block into `ReferralHoldService` — `ReferralController::store()`

`ReferralCreationService::create()` runs entirely inside the controller's
`DB::transaction()` (`ReferralController.php:118-120`). If
`recordBlockedAttempt()` ran inside that same transaction, it would be rolled
back along with everything else the moment the gate throws — so the hold must
be written **after** the transaction has already unwound, in the `catch`
block:

```php
// ReferralController.php — add to the use block:
use App\Exceptions\ReferralSubmissionBlockedException;
use App\Services\ReferralHoldService;
use App\Services\ReferralRoutingService;

public function store(
    ReferralRequest $request,
    ReferralCreationService $referralCreation,
    ReferralRoutingService $referralRouting,
    ReferralHoldService $referralHolds
) {
    // ...existing $user/$data/$patient/$record/client_submission_id block, unchanged...

    try {
        $referral = DB::transaction(
            fn (): Referral => $referralCreation->create($request, $patient, $data, $record)
        );
    } catch (ReferralSubmissionBlockedException $exception) {
        if ($exception->blockCode === ReferralSubmissionBlockedException::NO_PROVIDER_AVAILABLE) {
            $route = $referralRouting->resolveForBhw($user);

            $referralHolds->recordBlockedAttempt($user, $patient, $route['bhc']->id, $route['rhu'], [
                'health_record_id' => $record?->id,
                'urgency_level' => $data['urgency_level'] ?? null,
                'preferred_provider_id' => $data['preferred_provider_id'] ?? null,
            ]);
        }

        throw $exception;
    } catch (QueryException $exception) {
        // ...existing handling, unchanged...
    }
```

This is the only change to `ReferralController.php`. `ReferralRoutingService::resolveForBhw()`
is called a second time here — it is a couple of cheap lookups (already the
first thing `ReferralCreationService::create()` does), and this only runs on
the already-slow, already-failing path, not the happy path.
`ReferralSubmissionBlockedException::render()` is untouched, so the BHW's
HTTP response (422, same JSON body) is byte-for-byte identical to today.

### 3.4 Resolving a hold on successful resubmission

`ReferralController::store()` reads `$data = $request->validated();`, so a
new field must be added to `ReferralRequest::rules()` (alongside
`preferred_provider_id`) or it will be silently dropped:

```php
'resume_hold_id' => ['nullable', 'integer', 'exists:referral_holds,id'],
```

In `ReferralCreationService::create()`, after
the referral is successfully created (end of the method, right before the
`return $referral;`):

```php
if (! empty($data['resume_hold_id'])) {
    $hold = ReferralHold::query()
        ->where('id', $data['resume_hold_id'])
        ->where('created_by', $user->id)
        ->where('status', ReferralHold::STATUS_WAITING)
        ->first();

    if ($hold) {
        app(ReferralHoldService::class)->markResubmitted($hold, $referral->id);
    }
}
```

Scoped to `created_by = $user->id` and `status = waiting` so a BHW cannot
resolve someone else's hold or double-resolve one. This runs inside the same
transaction as referral creation, which is correct here — if referral
creation fails, resolving the hold should roll back with it.

### 3.5 Notification hook — `RhuProviderController::update()`

One addition, right after the existing `$statusChanged` computation
(`RhuProviderController.php:125-135`), still inside the transaction:

```php
$provider->update([...$data, 'updated_by' => $user->id]);

$statusChanged = array_key_exists('availability_status', $data)
    && $data['availability_status'] !== $previousStatus;

if ($statusChanged && $provider->availability_status === RhuProvider::STATUS_AVAILABLE) {
    app(ReferralHoldService::class)->notifyWaitingHolds($provider->ruralHealthUnit);
}

$auditLogger->log(/* ...unchanged... */);
```

Calling this inside the transaction is fine: `notifyWaitingHolds()` opens no
transaction of its own, and `UserNotificationService::notifyUser()` just
inserts rows — if the outer transaction later rolled back for an unrelated
reason, the notification insert rolls back with it, which is the correct
behavior (don't notify about an update that didn't actually happen).

### 3.6 New endpoints — discard and list

`ReferralHoldController` — `backend/app/Http/Controllers/Api/ReferralHoldController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Models\ReferralHold;
use App\Services\ReferralHoldService;
use Illuminate\Http\Request;

class ReferralHoldController extends Controller
{
    public function index(Request $request)
    {
        $holds = ReferralHold::query()
            ->where('created_by', $request->user()->id)
            ->where('status', ReferralHold::STATUS_WAITING)
            ->with(['patient:id,first_name,last_name', 'ruralHealthUnit:id,name'])
            ->latest()
            ->get();

        return response()->json(['data' => $holds]);
    }

    public function discard(Request $request, ReferralHold $referralHold, ReferralHoldService $holds)
    {
        abort_unless($referralHold->created_by === $request->user()->id, 403);
        abort_unless($referralHold->status === ReferralHold::STATUS_WAITING, 422, 'This hold is already resolved.');

        $holds->discard($referralHold);

        return response()->json(['data' => ['discarded' => true]]);
    }
}
```

Routes in `backend/routes/api.php`, inside the existing
`Route::middleware('role:bhw')->group(...)` block that already holds the
`health-record-drafts` routes (`routes/api.php:99-105`):

```php
Route::middleware('role:bhw')->group(function () {
    // ...existing health-record-drafts routes...
    Route::get('/referral-holds', [ReferralHoldController::class, 'index']);
    Route::post('/referral-holds/{referralHold}/discard', [ReferralHoldController::class, 'discard']);
});
```

Authorization is enforced in the controller (`created_by` check) rather than
a Form Request, matching how simple ownership checks are done elsewhere in
this codebase for single-owner resources.

### 3.7 Expiring stale holds

A hold nobody acts on should not sit as `waiting` forever. Following the
`HealthRecordDraftPruner` pattern exactly:

`backend/app/Services/ReferralHoldPruner.php`:

```php
<?php

namespace App\Services;

use App\Models\ReferralHold;

class ReferralHoldPruner
{
    public function prune(bool $dryRun = false): int
    {
        $query = ReferralHold::query()
            ->where('status', ReferralHold::STATUS_WAITING)
            ->where('created_at', '<=', now()->subDays(
                config('operations.referral_holds.expire_after_days')
            ));

        if ($dryRun) {
            return $query->count();
        }

        return $query->update(['status' => ReferralHold::STATUS_EXPIRED]);
    }
}
```

Add to `backend/routes/console.php`:

```php
Artisan::command('referral-holds:prune {--dry-run : Count eligible holds without changing them}', function (ReferralHoldPruner $pruner) {
    $count = $pruner->prune((bool) $this->option('dry-run'));

    $this->info($this->option('dry-run')
        ? "{$count} waiting referral hold(s) would be expired."
        : "{$count} waiting referral hold(s) expired.");
})->purpose('Expire referral holds nobody acted on');

Schedule::command('referral-holds:prune')
    ->dailyAt(config('operations.scheduler.referral_hold_prune_time'))
    ->timezone(config('app.timezone'))
    ->withoutOverlapping(config('operations.scheduler.referral_hold_prune_overlap_minutes'));
```

Add to `config/operations.php`'s `scheduler` block:

```php
'referral_hold_prune_time' => env('AKAY_REFERRAL_HOLD_PRUNE_TIME', '03:15'),
'referral_hold_prune_overlap_minutes' => max(1, (int) env('AKAY_REFERRAL_HOLD_PRUNE_OVERLAP_MINUTES', 60)),
```

And add `'expire_after_days' => max(1, (int) env('AKAY_REFERRAL_HOLD_EXPIRE_AFTER_DAYS', 14))`
to the `referral_holds` config key from §3.2. 14 days is a starting default,
not a locked decision — adjust to whatever cadence matches how long a blocked
case realistically stays clinically relevant.

### 3.8 `RhuProviderRequest` — allow the new field

```php
'expected_available_at' => ['nullable', 'date'],
```

Added to the `rules()` array alongside `remarks`.

### 3.9 `ProviderAvailabilityService::summarize()` — surface the field

Add `'expected_available_at' => $provider->expected_available_at` to the
per-provider array at `ProviderAvailabilityService.php:41-48`, so it reaches
both the RHU roster screen and the BHW-facing availability read without a
second endpoint.

---

## 4. Frontend

### 4.1 RHU side — `DoctorSchedule.jsx`

Add an optional datetime input next to the existing `remarks` field for an
Unavailable provider, wired through the existing provider-update mutation in
`useDoctorAvailability.js` (`update` mutation already invalidates both
`providers()` and `providerAvailability()` query keys — no new invalidation
needed). Label it as an estimate, e.g. *"Expected back (optional estimate)"*,
so nobody mistakes it for something the system acts on.

### 4.2 BHW side — catching the block and offering the hold

`CreateReferral.jsx` already special-cases `NO_PROVIDER_AVAILABLE` at
line 618. Extend that branch only — no new error-handling path:

```js
if (isNoProviderAvailableError(error)) {
  setShowConfirmModal(false);
  setSubmissionErrorNotice(
    error?.message ||
      "The receiving Rural Health Unit has no available doctor right now. " +
      "This attempt has been saved — you'll be notified here when a doctor becomes available.",
  );
  return;
}
```

The wording change reflects the new behavior: nothing else in this branch
needs to change, since `ReferralHoldService::recordBlockedAttempt()` already
ran server-side by the time this response reaches the client.

### 4.3 Resuming a hold

The notification's `link_url` is
`/bhc/referrals/create?resume_hold={id}`. On mount, `CreateReferral.jsx`
checks for `resume_hold` in the query string; if present, calls
`GET /referral-holds` (or a small dedicated fetch — implementer's choice,
either is one call), finds the matching hold, and pre-fills:
`patient_id`, `health_record_id`, `urgency_level`, `preferred_provider_id`.
The BHW reviews and submits normally; the form includes `resume_hold_id:
<id>` in the payload sent to `POST /referrals` so §3.4's resolution logic
fires.

A small "Waiting on Doctor Availability" list (calling
`GET /referral-holds`) is a reasonable addition to the BHC referrals page so
a BHW doesn't have to wait for the notification bell — same data source, just
a persistent view instead of a one-time push. This is additive UI and not
required for the feature to function.

### 4.4 Discard action

A "Discard" button next to each item in that list calls
`POST /referral-holds/{id}/discard` and invalidates the `referral-holds`
query key.

---

## 5. Tests

- **`ReferralSubmissionGateTest.php`** — add a case asserting the gate's
  behavior is byte-for-byte unchanged when a `waiting` hold already exists
  for the same patient/RHU (guards against ever letting a hold influence
  DOC-14, which must stay a live, uncached check).
- **New `ReferralHoldServiceTest.php`** —
  - `recordBlockedAttempt()` persists the right FKs and defaults to `waiting`.
  - `notifyWaitingHolds()` notifies only `waiting` holds for the given RHU,
    respects the cooldown, and updates `last_notified_at`.
  - `discard()` / `markResubmitted()` transition status and set `resolved_at`.
- **New `ReferralHoldControllerTest.php`** — a BHW cannot discard another
  BHW's hold (403); discarding an already-resolved hold 422s; `index` returns
  only the caller's `waiting` holds.
- **`ReferralControllerTest.php`** (or wherever referral creation is
  integration-tested) — a blocked submission creates exactly one
  `referral_holds` row with `status = waiting`; the HTTP response body/status
  is unchanged from today (422, same `code`).
- **`RhuProviderControllerTest.php`** — flipping a provider to Available with
  a waiting hold at that RHU triggers exactly one notification per hold;
  flipping to Unavailable, or updating an unrelated field, triggers none.
- **`ReferralHoldPrunerTest.php`** — mirrors `HealthRecordDraftPrunerTest.php`
  structure: dry-run counts without mutating, real run expires only
  `waiting` holds older than the configured window.

---

## 6. Rollout sequence

1. Migrations (§2.1, §2.2) — additive only, no backfill needed since no holds
   exist yet.
2. Backend: model, service, pruner, config keys, controller changes (§3.1–3.9).
   Ship behind nothing special — every change here is additive except the two
   small edits to `ReferralController::store()` and
   `RhuProviderController::update()`, both of which are no-ops until a
   `NO_PROVIDER_AVAILABLE` block or an availability flip actually occurs.
3. Backend tests (§5) green, including the new gate-unchanged regression case.
4. Frontend (§4) — wire the notice copy, the resume flow, and (optional) the
   waiting-holds list.
5. Add `referral-holds:prune` to the crontab alongside the existing
   `schedule:run` entry — no separate cron line needed, since
   `php artisan schedule:run` already dispatches everything registered in
   `routes/console.php` (`docs/deployment-operations.md`).

---

## 7. What this deliberately leaves open

- **RHU visibility (plan §5.1):** not built here. `referral_holds` is
  queryable by `rural_health_unit_id`, so a follow-up "N referrals waiting on
  your availability" count for the RHU dashboard is a small additive change
  once you decide count-only vs. detail (see the prior analysis's Decision 4).
- **Priority/Urgent fallback (plan §5.2):** unaffected by this document — the
  gate still blocks Priority identically to Routine, per DOC-14/URG-05.
  Recommended: display a fallback instruction ("call the RHU directly") in
  the same `submissionErrorNotice` in `CreateReferral.jsx` when
  `urgency_level` is Priority, without altering the block itself. That is a
  one-line frontend change on top of §4.2's edit, not included here since it
  needs the wording signed off (plan's own §5.2 flags this as pending
  stakeholder input).
- **FR/TRK-02 documentation (plan §5.3):** mostly moot under 1A — no TRK-02
  status is added. What remains is documenting the new FR for the
  reminder/notification behavior itself, which is process work, not code.
