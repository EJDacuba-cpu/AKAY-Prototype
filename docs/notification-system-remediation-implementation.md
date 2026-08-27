# Notification System Remediation — Implementation Plan (Decisions A–E)

**Status:** Ready to build. All decisions locked (v2, per
`notificationremediationplanAtoE.md`). **No file in the repository has been
touched by this document.**

**Findings addressed:** N1–N11, from the static audit of
`NotificationController`, `UserNotificationService`,
`FollowUpNotificationService`, and the frontend notification stack
(`useNotificationsContext.jsx`, `notificationService.js`,
`NotificationsPage.jsx`).

**Repository state this plan was written against:** `main` at `7446f0f`
(includes the merged referral-hold feature). That feature touches zero
notification files — confirmed by diff — so it has no bearing on anything
below, but it does establish the current, authoritative shape of
`config/operations.php` and `routes/console.php`, which this plan's own
config keys and scheduled commands are placed alongside.

---

## 1. Decision summary

| Decision | Fixes | Locked choice |
|---|---|---|
| A | N1 — GET requests mutate clinical state | **A1** — move the No-Show transition into a scheduled command |
| B | N2 + N3 — duplicate notifications vs. permanent silence | **B4** — `dedup_key`, unique-indexed, written via `insertOrIgnore` |
| C | N4 + N5 — missing index, unbounded growth | **C2** (partial index) + **C3** (pruner + schedule) |
| D | N6, N10, N11 — counts, Trash, mark-unread, cap, search | **D-1 through D-8** |
| E | N8 — PHI in plaintext notification messages | **E3 now → E2 later** (sequence, not a choice) |

---

## 2. Decision A — write-on-read (N1)

### 2.1 The actual scope of the fix

`notifyDueForUser(User $user)` is called from **two** places, not one:

- `NotificationController::index()` (`:14`)
- `FollowUpTaskController::index()` (`:42`)

Both must be cleaned up, or N1 stays half-fixed. The method itself mixes two
concerns that need to separate: **transitioning** overdue tasks to No-Show
(a real state change — this is the N1 violation) and **notifying** about
that transition (a write, but an idempotent, deduped one that every other
notification call site already performs on request paths without issue).
Only the transition needs to leave the read path.

### 2.2 Rewrite `FollowUpNotificationService`

The current method is scoped to one BHW's BHC (`$user->barangay_health_center_id`)
because it only ever ran inside that user's own request. A scheduled command
has no calling user, so the method needs to sweep every BHC in one pass and
notify each BHC's own active BHWs — the same fan-out
`ReferralNoShowService::markOverduePending()` already does globally for
referrals.

```php
<?php

namespace App\Services;

use App\Models\FollowUpTask;
use App\Models\User;
use Illuminate\Support\Collection;

class FollowUpNotificationService
{
    public function __construct(private readonly UserNotificationService $notifications)
    {
    }

    /**
     * Transitions overdue follow-ups to No-Show and notifies the owning
     * BHC's active BHWs about both No-Show and due-today tasks. Runs off the
     * read path (Decision A1) - called only from follow-ups:mark-no-show.
     *
     * @return array{transitioned: int, notified: int}
     */
    public function sweep(bool $dryRun = false): array
    {
        $today = now()->toDateString();
        $activeStates = [FollowUpTask::STATE_PENDING, FollowUpTask::STATE_RESCHEDULED];

        $overdueQuery = FollowUpTask::query()
            ->whereIn('state', $activeStates)
            ->whereDate('due_date', '<', $today);
        $dueTodayQuery = FollowUpTask::query()
            ->whereIn('state', $activeStates)
            ->whereDate('due_date', $today);

        if ($dryRun) {
            return [
                'transitioned' => (clone $overdueQuery)->count(),
                'notified' => (clone $overdueQuery)->count() + (clone $dueTodayQuery)->count(),
            ];
        }

        /** @var array<int, Collection<int, User>> $bhwCache */
        $bhwCache = [];
        $bhwsFor = function (int $barangayHealthCenterId) use (&$bhwCache): Collection {
            return $bhwCache[$barangayHealthCenterId] ??= User::query()
                ->where('role', User::ROLE_BHW)
                ->where('barangay_health_center_id', $barangayHealthCenterId)
                ->where('status', User::STATUS_ACTIVE)
                ->get();
        };

        $notified = 0;
        $overdue = $overdueQuery->with('patient')->get();

        foreach ($overdue as $task) {
            $patientName = $task->patient?->full_name ?: 'The patient';
            $taskDate = $task->due_date?->toDateString() ?: 'unknown-date';

            $task->update(['state' => FollowUpTask::STATE_NO_SHOW, 'no_show_at' => now()]);

            $this->notifications->notifyUsersOnce(
                $bhwsFor((int) $task->barangay_health_center_id),
                'No-Show',
                "{$patientName} missed the scheduled follow-up date.",
                'follow_up_no_show',
                null,
                "/bhc/follow-ups?task={$task->id}&open=no_show",
                "follow_up_task_no_show_{$taskDate}",
                $task->id
            );
            $notified++;
        }

        $dueTodayQuery->with('patient')->get()->each(function (FollowUpTask $task) use (&$notified, $bhwsFor, $today): void {
            $patientName = $task->patient?->full_name ?: 'The patient';

            $this->notifications->notifyUsersOnce(
                $bhwsFor((int) $task->barangay_health_center_id),
                'Follow-up Today',
                "{$patientName} is scheduled for follow-up today.",
                'follow_up_due_today',
                null,
                "/bhc/follow-ups?task={$task->id}&open=due",
                "follow_up_task_due_{$today}",
                $task->id
            );
            $notified++;
        });

        return ['transitioned' => $overdue->count(), 'notified' => $notified];
    }
}
```

`notifyDueForUser()` is removed entirely — nothing else calls it.

### 2.3 New command + schedule — `backend/routes/console.php`

```php
use App\Services\FollowUpNotificationService; // add to the use block

Artisan::command('follow-ups:mark-no-show {--dry-run : Count eligible follow-ups without changing them}', function (FollowUpNotificationService $followUps) {
    $result = $followUps->sweep((bool) $this->option('dry-run'));

    $this->info($this->option('dry-run')
        ? "{$result['transitioned']} overdue follow-up(s) would be marked No-Show; {$result['notified']} notification(s) would be sent."
        : "{$result['transitioned']} overdue follow-up(s) marked No-Show; {$result['notified']} notification(s) sent.");
})->purpose('Transition overdue follow-ups to No-Show and notify BHWs, off the read path');
```

```php
Schedule::command('follow-ups:mark-no-show')
    ->hourly()
    ->timezone(config('app.timezone'))
    ->withoutOverlapping(config('operations.scheduler.follow_up_no_show_overlap_minutes'));
```

Placed alongside the existing `referrals:mark-no-show` entries (`:16-23`,
`:54-57`) — same hourly cadence, same `withoutOverlapping` pattern.

### 2.4 Config — `backend/config/operations.php`

Add to the `scheduler` block, next to `no_show_overlap_minutes`:

```php
'follow_up_no_show_overlap_minutes' => max(
    1,
    (int) env('AKAY_FOLLOW_UP_NO_SHOW_OVERLAP_MINUTES', 60)
),
```

### 2.5 Controller edits

`NotificationController.php` — remove the injected service and the call:

```php
public function index(Request $request)
{
    return response()->json([
        'data' => $request->user()
            ->notifications()
            ->whereNull('cleared_at')
            ->latest()
            ->paginate($request->integer('per_page', 50)), // D-1, see §5.1
    ]);
}
```

(`per_page` default changes from 25 to 50 here — that edit is D-1, folded in
at this call site since it's the same line.)

`FollowUpTaskController.php` — remove the same injected service and the
identical call at its `index()` method, no other change.

---

## 3. Decision B — duplicate vs. permanently silenced notifications (N2 + N3)

### 3.1 Why call sites need zero changes

`notifyUserOnce()`'s existing dedup already branches on exactly three
identity shapes (`entityType`+`entityId`, else `referralId`, else
`title`+`message`) — see `UserNotificationService.php:52-60`. B4 replaces the
race-prone `exists()`-then-`create()` with a single atomic `insertOrIgnore`
keyed on a `dedup_key` computed from those same three shapes. Because
`FollowUpNotificationService` already embeds the date inside `entityType`
(`"follow_up_task_no_show_{$taskDate}"`, unchanged in §2.2 above), a
key built from `(userId, type, entityType, entityId)` is **already**
date-bucketed for free — no call site needs to pass a new parameter.

### 3.2 Migration — add `dedup_key`

```php
Schema::table('notifications', function (Blueprint $table) {
    $table->string('dedup_key')->nullable()->unique()->after('entity_id');
});
```

Plain `unique()` is correct here, not a partial index: PostgreSQL treats
every `NULL` in a unique column as distinct from every other `NULL`, so rows
written via the always-insert `notifyUser()` path (which has no dedup
identity and will leave this column `null`) never collide with each other.

### 3.3 `UserNotification` model

Add `'dedup_key'` to `$fillable` (needed for tests and any future code that
constructs rows through the model rather than `insertOrIgnore`).

### 3.4 `UserNotificationService::notifyUserOnce()` — rewrite

```php
public function notifyUserOnce(
    ?User $user,
    string $title,
    string $message,
    string $type,
    ?int $referralId = null,
    ?string $linkUrl = null,
    ?string $entityType = null,
    ?int $entityId = null
): void {
    if (! $user) {
        return;
    }

    UserNotification::query()->insertOrIgnore([[
        'user_id' => $user->id,
        'title' => $title,
        'message' => $message,
        'link_url' => $linkUrl,
        'type' => $type,
        'entity_type' => $entityType,
        'entity_id' => $entityId,
        'related_referral_id' => $referralId,
        'dedup_key' => $this->dedupKey($user->id, $type, $entityType, $entityId, $referralId, $title, $message),
        'created_at' => now(),
        'updated_at' => now(),
    ]]);
}

private function dedupKey(
    int $userId,
    string $type,
    ?string $entityType,
    ?int $entityId,
    ?int $referralId,
    string $title,
    string $message
): string {
    if ($entityType !== null && $entityId !== null) {
        return "{$userId}:{$type}:{$entityType}:{$entityId}";
    }

    if ($referralId !== null) {
        return "{$userId}:{$type}:referral:{$referralId}";
    }

    return "{$userId}:{$type}:".hash('crc32b', $title.'|'.$message);
}
```

`insertOrIgnore` issues a raw insert — `is_read` (`default(false)`) is left
out of the array on purpose so the column's DB default applies, matching
current behavior. `notifyUser()` (the always-insert variant used by
`account_created`, `password_reset`, `referral_hold_available`, etc.) is
**not changed** — those calls have no "once" semantics to protect and should
keep inserting unconditionally.

### 3.5 Sequencing

Land after §2 (A1) is deployed and has been running for at least one full
scheduled cycle, exactly as locked — fewer concurrent writers on this path
makes the switch from advisory (`exists()`) to atomic (`insertOrIgnore`)
easier to verify against production traffic.

---

## 4. Decision C — indexing and retention (N4 + N5)

### 4.1 C2 — partial index

```php
DB::statement(
    'CREATE INDEX notifications_user_unresolved_idx '
    .'ON notifications (user_id, created_at DESC) WHERE cleared_at IS NULL'
);
```

Raw `DB::statement`, matching the existing precedent for a `WHERE`-qualified
index (`rhu_providers_rhu_active_name_unique`,
`2026_08_17_000002_create_rhu_providers_table.php:59-62`) — the schema
builder has no fluent API for a partial index's `WHERE` clause. Down
migration: `DROP INDEX IF EXISTS notifications_user_unresolved_idx`.

This migration is independent of everything else in this plan (confirmed:
D-3, the one decision that would have forced a different `ORDER BY`, was
reversed — see §5.3) and can ship first, alone, with zero behavior change.

### 4.2 C3 — pruner

New `backend/app/Services/NotificationPruner.php`, mirroring
`HealthRecordDraftPruner` and `ReferralHoldPruner` exactly — this is the
**third** instance of this pattern, following the merged referral-hold work:

```php
<?php

namespace App\Services;

use App\Models\UserNotification;

class NotificationPruner
{
    public function prune(bool $dryRun = false): int
    {
        $query = UserNotification::query()
            ->whereNotNull('cleared_at')
            ->where('cleared_at', '<=', now()->subDays(
                config('operations.notifications.cleared_retention_days')
            ));

        if ($dryRun) {
            return $query->count();
        }

        return $query->delete();
    }
}
```

Scoped to **cleared** notifications only, matching how
`health_record_drafts` only purges rows already moved to a terminal state
(`consumed`/`discarded`/`expired`) rather than touching anything still
active. An uncleared notification — including one nobody has read — is left
alone indefinitely; deleting something the user hasn't acted on yet would be
a correctness regression, not cleanup.

Console command + schedule, same shape as `referral-holds:prune`:

```php
Artisan::command('notifications:prune {--dry-run : Count eligible notifications without deleting them}', function (NotificationPruner $pruner) {
    $count = $pruner->prune((bool) $this->option('dry-run'));

    $this->info($this->option('dry-run')
        ? "{$count} cleared notification(s) would be pruned."
        : "{$count} cleared notification(s) pruned.");
})->purpose('Permanently delete cleared notifications past their retention window');

Schedule::command('notifications:prune')
    ->dailyAt(config('operations.scheduler.notification_prune_time'))
    ->timezone(config('app.timezone'))
    ->withoutOverlapping(config('operations.scheduler.notification_prune_overlap_minutes'));
```

Config additions — `scheduler` block:

```php
'notification_prune_time' => env('AKAY_NOTIFICATION_PRUNE_TIME', '03:45'),
'notification_prune_overlap_minutes' => max(
    1,
    (int) env('AKAY_NOTIFICATION_PRUNE_OVERLAP_MINUTES', 60)
),
```

New top-level key, alongside `referral_holds`:

```php
'notifications' => [
    'cleared_retention_days' => max(
        1,
        (int) env('AKAY_NOTIFICATION_CLEARED_RETENTION_DAYS', 7)
    ),
],
```

7 days by default — see §5.5 (D-6) for why this figure, not a separately
guessed one.

---

## 5. Decision D — pagination, counts, Trash, mark-unread, search

### 5.1 D-1 — cap default: 50

Already folded into §2.5's `NotificationController::index()` edit
(`per_page` default 25 → 50). No other change.

### 5.2 D-2 — escape hatch ("Show more")

`unwrapList()` (`apiClient.js:278-283`) discards Laravel's pagination
envelope (`current_page`, `last_page`, `total`) and keeps only the row
array — which is why the frontend currently has no way to ask for page 2.
Fixing that means `notificationService.js` must track pagination state
alongside the notification cache, not just the flat array it holds today:

```js
// notificationService.js — new module-level state, alongside notificationCache
let notificationPage = { current: 1, last: 1, total: 0 };

export function getNotificationPageInfo() {
  return notificationPage;
}

export function hasMoreNotifications() {
  return notificationPage.current < notificationPage.last;
}
```

`refreshNotifications()` gains a `page` and `append` option. Its fetch
becomes `apiRequest(\`/notifications?page=${page}&per_page=50\`)`, and
instead of `unwrapList(response)` it reads the paginator directly
(`response?.data` is the Laravel paginator object: `{ data: [...], current_page, last_page, total }`):

```js
const paginator = response?.data ?? {};
const page = unwrapList(response); // reuses the existing helper unchanged
notificationPage = {
  current: paginator.current_page ?? 1,
  last: paginator.last_page ?? 1,
  total: paginator.total ?? page.length,
};
notificationCache = append ? [...notificationCache, ...page] : page;
```

New export:

```js
export async function loadMoreNotifications() {
  return refreshNotifications({
    page: notificationPage.current + 1,
    append: true,
    force: true,
    maxAgeMs: 0,
  });
}
```

`useNotificationsContext.jsx` exposes `loadMoreNotifications` and
`hasMoreNotifications` from context. `NotificationsPage.jsx` renders a
"Show 50 more" button beneath the list when `hasMoreNotifications()` is
true, wired to call it.

**Scope note:** this only applies to the full "See All" page. The dropdown
preview (`useNotificationsContext.jsx:225`, `.slice(0, 5)` over the cache)
is unaffected — it already only ever shows the first 5 of whatever's loaded
and has no cap-related bug to fix.

### 5.3 D-3 — reversed, no change in this plan

The v1 idea (sort the inbox by age of the underlying issue rather than
notification recency) is **not implemented here**. `notifications` has no
stored "issue age" column, and computing one means joining out to
`follow_up_tasks` / `referrals` / `medicines` per row — not expressible as
one indexed `ORDER BY`, and it would have silently invalidated §4.1's C2
index (built for `ORDER BY created_at DESC`). The underlying need — don't
let the oldest overdue item go unseen — is reassigned to the separately
tracked Dashboard To-Do Widget, which is a small, purpose-built "needs
attention" query, not a reshuffled notification feed. No file touched by
this plan implements D-3.

### 5.4 D-4 — `GET /notifications/counts`

The frontend classifier (`NotificationsPage.jsx:39-89`,
`getNotificationCategory`) is a keyword scan over `type` / `entityType` /
`title` / `message` — not a fixed enum — so it can't be ported to SQL
verbatim without becoming a fragile parallel implementation. Instead, the
endpoint classifies on the actual, finite set of `type` values every backend
call site emits today (verified by grep across every `notifyUser*` call
site in the codebase):

| `type` value | Category |
|---|---|
| `follow_up_no_show`, `follow_up_due_today` | `followups` |
| `incoming_referral`, `referral_submitted`, `referral_received`, `referral_late_arrival`, `referral_no_show`, `referral_completed`, `referral_hold_available` | `referrals` |
| everything else (`password_reset_request`, `password_reset`, `account_created`, `account_deactivated`) | `system` |

**Observation, not a bug to fix here:** no backend code currently emits a
`medicine`-category notification. The frontend's "Medicine" filter tab
exists and will show 0 both before and after this change — that's a
pre-existing gap in what the app notifies about, not something this
counts endpoint introduces or needs to paper over.

```php
public function counts(Request $request)
{
    $inbox = $request->user()->notifications()
        ->whereNull('cleared_at')
        ->whereNull('trashed_at'); // trashed items are excluded from Inbox - see D-5

    $followupTypes = ['follow_up_no_show', 'follow_up_due_today'];
    $referralTypes = [
        'incoming_referral', 'referral_submitted', 'referral_received',
        'referral_late_arrival', 'referral_no_show', 'referral_completed',
        'referral_hold_available',
    ];

    return response()->json(['data' => [
        'inbox' => (clone $inbox)->count(),
        'unread' => (clone $inbox)->where('is_read', false)->count(),
        'followups' => (clone $inbox)->whereIn('type', $followupTypes)->count(),
        'referrals' => (clone $inbox)->whereIn('type', $referralTypes)->count(),
        'medicine' => 0,
        'system' => (clone $inbox)
            ->whereNotIn('type', [...$followupTypes, ...$referralTypes])
            ->count(),
        'trash' => $request->user()->notifications()->whereNotNull('trashed_at')->count(),
    ]]);
}
```

Route, inside the existing authenticated group next to the other
notification routes:

```php
Route::get('/notifications/counts', [NotificationController::class, 'counts']);
```

Frontend: a new `getNotificationCounts()` call in `notificationService.js`,
fetched alongside `refreshNotifications()` and exposed from context;
`NotificationsPage.jsx`'s `counts` `useMemo` (`:165-184`) is deleted and
replaced with this server value. The unread badge elsewhere in the app
(wherever it reads `getUnreadNotificationCount()`,
`notificationService.js:277-280`) switches to the same endpoint's `unread`
field instead of `.filter(...).length` over the capped cache.

### 5.5 D-5 — Trash needs a real backend (N10)

`moveNotificationsToTrash` / `restoreNotificationsFromTrash`
(`useNotificationsContext.jsx:229-264`) are confirmed `useState`-only, no
API call, no `localStorage`. State survives mid-session (re-applied on every
refetch via `applyNotificationTrashState`) but is lost on page reload.

**Migration** — same one that adds `trashed_at`, alongside D-7's need below:

```php
Schema::table('notifications', function (Blueprint $table) {
    $table->timestamp('trashed_at')->nullable()->after('cleared_at')->index();
});
```

**Interaction with `cleared_at` — this needs to be decided explicitly, not
left implicit:** `cleared_at` and `trashed_at` become two independent
terminal-ish states. `NotificationController::index()` (the Inbox) must
exclude **both**:

```php
->whereNull('cleared_at')
->whereNull('trashed_at')
```

A new endpoint serves the Trash tab specifically (it currently has no
backend query path at all — `trashNotifications` in
`NotificationsPage.jsx:161-164` filters the same already-fetched array by a
client flag):

```php
public function trashed(Request $request)
{
    return response()->json([
        'data' => $request->user()
            ->notifications()
            ->whereNotNull('trashed_at')
            ->latest('trashed_at')
            ->paginate($request->integer('per_page', 50)),
    ]);
}

public function trash(Request $request, UserNotification $notification)
{
    abort_unless($notification->user_id === $request->user()->id, 403);
    $notification->update(['trashed_at' => now()]);

    return response()->json(['data' => $notification->fresh()]);
}

public function restore(Request $request, UserNotification $notification)
{
    abort_unless($notification->user_id === $request->user()->id, 403);
    $notification->update(['trashed_at' => null]);

    return response()->json(['data' => $notification->fresh()]);
}
```

Bulk variants (`moveNotificationsToTrash`/`restoreNotificationsFromTrash`
both accept an array of ids in the frontend today) need bulk routes rather
than N sequential PATCHes — matching how `markAllRead` already operates on
a whole scope in one query:

```php
public function trashMany(Request $request)
{
    $ids = $request->array('ids');
    $request->user()->notifications()->whereIn('id', $ids)->update(['trashed_at' => now()]);

    return response()->json(['message' => 'Notifications moved to Trash.']);
}

public function restoreMany(Request $request)
{
    $ids = $request->array('ids');
    $request->user()->notifications()->whereIn('id', $ids)->update(['trashed_at' => null]);

    return response()->json(['message' => 'Notifications restored.']);
}
```

Routes:

```php
Route::get('/notifications/trash', [NotificationController::class, 'trashed']);
Route::post('/notifications/trash', [NotificationController::class, 'trashMany']);
Route::post('/notifications/restore', [NotificationController::class, 'restoreMany']);
```

Frontend: `moveNotificationsToTrash`/`restoreNotificationsFromTrash` in
`useNotificationsContext.jsx` call these endpoints instead of only touching
`notificationTrashMap`; `NotificationsPage.jsx`'s `trash` filter switches
from filtering the main cache to fetching `/notifications/trash` when that
tab is active (or, simpler for v1: keep fetching the main list's
`isTrashed` flag as today, now server-truthful since the flag is derived
from a real `trashed_at` on the returned row instead of a client map —
`normalizeNotification()` in `notificationService.js:43-83` already has a
slot for this, add `trashedAt: notification.trashed_at` there).

### 5.6 D-6 — Trash retention: 7 days

Handled by the **same** pruner as C3 (§4.2) — `trashed_at` uses the same
`cleared_retention_days` window as `cleared_at`, since both represent
"already dismissed, kept briefly for recovery." Extend the pruner's query:

```php
$query = UserNotification::query()
    ->where(fn ($q) => $q->whereNotNull('cleared_at')->orWhereNotNull('trashed_at'))
    ->where(function ($q) use ($cutoff) {
        $q->where('cleared_at', '<=', $cutoff)->orWhere('trashed_at', '<=', $cutoff);
    });
```

(`$cutoff = now()->subDays(config('operations.notifications.cleared_retention_days'))`,
computed once.) 7 days matches `health_record_drafts.terminal_retention_days`
(`config/health_record_drafts.php` — confirmed default `7`, distinct from
its 30-day `expiry_days`, which governs a different phase: still-active,
not yet dismissed). No separate config key or separate scheduled job needed.

### 5.7 D-7 — mark-as-unread needs a real backend (N11)

`markSelectedAsUnread` (`useNotificationsContext.jsx:266-275`) is
client-state-only, and no unread route exists anywhere in
`NotificationController` or `routes/api.php`. Worse than Trash: nothing
re-applies this client flag after a refetch, so any refetch (route change,
another mutation's `force: true` refresh) silently reverts it.

```php
public function markUnread(Request $request, UserNotification $notification)
{
    abort_unless($notification->user_id === $request->user()->id, 403);
    $notification->update(['is_read' => false]);

    return response()->json(['data' => $notification->fresh()]);
}
```

```php
Route::patch('/notifications/{notification}/unread', [NotificationController::class, 'markUnread']);
```

Bulk variant, mirroring the existing `markSelectedAsRead` shape:

```php
public function markManyUnread(Request $request)
{
    $ids = $request->array('ids');
    $request->user()->notifications()->whereIn('id', $ids)->update(['is_read' => false]);

    return response()->json(['message' => 'Notifications marked unread.']);
}
```

```php
Route::post('/notifications/mark-unread', [NotificationController::class, 'markManyUnread']);
```

`markSelectedAsUnread` in `useNotificationsContext.jsx` calls this instead
of only touching local state — same shape as how `markNotificationsAsRead`
already calls its endpoint then re-syncs (`notificationService.js:234-258`).

Built in the same PR as D-5 — same migration, same controller, same
frontend hook file, no reason to split the work.

### 5.8 D-8 — search must be server-side

`NotificationsPage.jsx:187-199` filters `searchTerm` over the client-side
array only. Under D-1's 50-row cap, a search silently misses anything
beyond page 1 — and once E2 (§6) removes patient names from `message`
entirely, a name search would have nothing left in the fetched text to
match, breaking outright rather than degrading.

```php
public function index(Request $request)
{
    $query = $request->user()->notifications()
        ->whereNull('cleared_at')
        ->whereNull('trashed_at');

    if ($search = trim((string) $request->string('search'))) {
        $query->where(fn ($q) => $q
            ->where('title', 'ilike', "%{$search}%")
            ->orWhere('message', 'ilike', "%{$search}%"));
    }

    return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 50))]);
}
```

Frontend: `refreshNotifications()` forwards a `search` param (same
`URLSearchParams`-filter-empty-values convention already used in
`followUpTaskService.js:105-107`); `NotificationsPage.jsx` debounces
`searchTerm` into a fetch instead of filtering the local array.
**Re-checked when E2 lands** (§6): once `message` no longer contains a
resolved name, this `LIKE` needs to join out to the entity instead of
matching stored text — noted there, not solved here.

---

## 6. Decision E — PHI in notification message bodies (N8)

### 6.1 E3 (this plan) — bring `notifications` into Phase 2B scope

Rides on the same migration that adds `dedup_key`, `trashed_at`, or as its
own no-op-on-data migration:

```php
if (DB::connection()->getDriverName() === 'pgsql') {
    DB::statement('ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY');
}
```

Matches the posture already applied to `rhu_providers` and `referral_holds`
(`2026_08_17_000002...php:73-85`, `2026_08_26_000001...php`): Laravel
connects as table owner, exempt from RLS, so this changes nothing the
application can see; it just closes the gap for `notifications` alongside
every other post-Phase-2B table. Retention (§4.2/§5.6) rides the same step.

### 6.2 E2 (next, separate project) — remove PHI from the table

Not implemented in this plan. Recorded here so the dependency is visible:
storing only `entity_type`/`entity_id` and resolving the patient's name
client-side at render time (from data the viewer is already authorized to
see) removes the stale-name problem for free, but requires revisiting §5.8's
search (`LIKE` on `message` no longer has a name to match) before it ships.

---

## 7. Consolidated rollout order

1. **§4.1 (C2)** — index migration. Zero dependency, zero behavior change.
2. **§2 (A1)** — `FollowUpNotificationService::sweep()`, the new command and
   schedule entry, and the two controller edits removing `notifyDueForUser()`
   from the read path.
3. **§3 (B4)** — `dedup_key` migration + `notifyUserOnce()` rewrite. Only
   after step 2 has run on a schedule at least once in the target
   environment.
4. **§5.5 + §5.7 (D-5 + D-7)** — one migration (`trashed_at`), one
   controller (six new/changed methods), one frontend hook file. Independent
   of steps 2–3; can be built in parallel.
5. **§5.4 + §5.1 + §5.2 + §5.8 (D-4, D-1, D-2, D-8)** — the user-visible
   correctness pass: real counts, the 50-row default with a working "show
   more," and search that survives both the cap and (later) E2.
6. **§4.2 + §6.1 (C3 + E3)** — one pruner, one RLS statement, same PR.
7. **§5.6 (D-6)** — rides step 6's pruner; no separate work.
8. **§6.2 (E2)** — scheduled as the next project, not blocking anything
   above. Re-open §5.8 when it starts.

---

## 8. Tests

- **A1:** `follow-ups:mark-no-show --dry-run` counts without mutating;
  a real run transitions exactly the overdue set and notifies each task's
  own BHC's BHWs, not a global list; `GET /api/notifications` and
  `GET /api/follow-up-tasks` no longer change any `follow_up_tasks` row.
- **B4:** two concurrent `notifyUserOnce()` calls with identical identity
  produce exactly one row (simulate via two immediate calls in one test, or
  a DB-level unique-violation assertion); clearing a notification and then
  re-triggering the same *entity* on a new date bucket produces a fresh row.
- **C2:** no behavioral test needed; confirm via `EXPLAIN` in a manual check
  that the hot query uses the new index, not a sequential scan.
- **C3:** dry-run counts only cleared/trashed rows past the window; a real
  run deletes only those; an uncleared, non-trashed notification of any age
  is never touched.
- **D-1/D-2:** `per_page` defaults to 50; requesting `page=2` returns the
  next slice; `hasMoreNotifications()` is false once `current === last`.
- **D-4:** counts match a hand-seeded set across all four category types,
  including one row for every emitted `type` value in §5.4's table.
- **D-5/D-6/D-7:** trashing then restoring round-trips `trashed_at`; a
  trashed item is excluded from `index()` and `counts()`'s inbox figures but
  present in `trashed()`; the pruner deletes a trashed row past the window
  and leaves one inside it; `markUnread` flips `is_read` and a subsequent
  `index()` call reflects it (regression test for N11's "flickers back"
  failure mode); every new single-item endpoint 403s for a non-owner.
- **D-8:** a search term matching only a row beyond the first page still
  returns it (proves search isn't limited to the cached/capped set).
- **E3:** `\d+ notifications` (or the catalog-driven check already used
  elsewhere in this codebase) confirms `relrowsecurity = true` post-migration
  on PostgreSQL; skipped on SQLite, matching every existing RLS migration's
  own guard.

---

## 9. Explicitly out of scope

- The Dashboard To-Do Widget (absorbs D-3's original intent) — tracked
  separately, not part of this repository's scope per prior instruction.
- Phase 2B database-level containment (the D1/D2 default-privilege
  assertion defects) — tracked in `phase-2b-containment-defects.md`; §6.1
  above rides on Phase 2B's RLS posture but does not resolve that plan.
- N9 (untested 403 path on the *existing* `markRead`/`destroy` endpoints) —
  picked up as part of §8's test pass above since the same endpoints are
  being touched anyway, but was already flagged as independently pickable
  regardless of this plan's sequencing.
