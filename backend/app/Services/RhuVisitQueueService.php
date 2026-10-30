<?php

namespace App\Services;

use App\Exceptions\RhuVisitCheckInKeyConflictException;
use App\Exceptions\RhuVisitDuplicateActiveException;
use App\Exceptions\RhuVisitStateException;
use App\Models\AuditLog;
use App\Models\FollowUpTask;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Check-in and lookup for the RHU visit queue. A visit never changes the
 * patient, the referral or any clinical record.
 */
class RhuVisitQueueService
{
    private const DENIED_MESSAGE = 'This resource is outside your assigned facility.';

    private const KEY_MAX_LENGTH = 100;

    /** One referral arrives once, so its arrival key is derived from the referral. */
    public const ARRIVAL_KEY_PREFIX = 'referral-';

    private const SEARCH_MAX_TOKENS = 5;

    private const CLOSE_NOTE_MAX_LENGTH = 500;

    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    /**
     * @return array{entry: RhuVisitQueueEntry, created: bool}
     */
    public function checkIn(User $user, int $patientId, ?int $referralId, string $checkInKey): array
    {
        return $this->performCheckIn($user, $patientId, $referralId, $checkInKey, false);
    }

    /**
     * @return array{entry: RhuVisitQueueEntry, created: bool}
     */
    private function performCheckIn(User $user, int $patientId, ?int $referralId, string $checkInKey, bool $allowReservedKey): array
    {
        $rhuId = $this->authorizeRhuUser($user);

        $key = trim($checkInKey);
        if ($key === '' || mb_strlen($key) > self::KEY_MAX_LENGTH) {
            throw ValidationException::withMessages([
                'check_in_key' => ['A check-in key of at most '.self::KEY_MAX_LENGTH.' characters is required.'],
            ]);
        }
        // Arrival keys are derived from the referral; clients may not claim that namespace.
        if (! $allowReservedKey && str_starts_with($key, self::ARRIVAL_KEY_PREFIX)) {
            throw ValidationException::withMessages([
                'check_in_key' => ['This check-in key is reserved.'],
            ]);
        }

        $patient = Patient::findOrFail($patientId);
        if (! $this->facilityAccess->canAccessPatient($user, $patient)) {
            abort_unless(
                $referralId === null && $this->facilityAccess->isCatchmentBhcPatient($user, $patient),
                403,
                self::DENIED_MESSAGE
            );
        }
        if ($patient->status === 'inactive') {
            throw ValidationException::withMessages([
                'patient_id' => ['An inactive patient cannot be checked in.'],
            ]);
        }

        $source = RhuVisitQueueEntry::SOURCE_WALK_IN;
        if ($referralId !== null) {
            $referral = Referral::findOrFail($referralId);
            $this->facilityAccess->authorizeRhuReferralAction($user, $referral);
            if ((int) $referral->patient_id !== $patient->id) {
                throw ValidationException::withMessages([
                    'referral_id' => ['This referral belongs to a different patient.'],
                ]);
            }
            $source = RhuVisitQueueEntry::SOURCE_REFERRAL;
        }

        $existing = $this->resolveExisting($rhuId, $key, $patient->id, $referralId, $source);
        if ($existing !== null) {
            return $existing;
        }

        try {
            $entry = $this->insert([
                'rural_health_unit_id' => $rhuId,
                'patient_id' => $patient->id,
                'referral_id' => $referralId,
                'source' => $source,
                'status' => RhuVisitQueueEntry::STATUS_WAITING,
                'checked_in_at' => now(),
                'checked_in_by' => $user->id,
                'check_in_key' => $key,
            ]);
        } catch (UniqueConstraintViolationException $exception) {
            // A concurrent writer won. The insert's own transaction (a savepoint
            // when nested) has rolled back, so the winner is readable here.
            return $this->resolveExisting($rhuId, $key, $patient->id, $referralId, $source)
                ?? throw $exception;
        }

        return ['entry' => $entry, 'created' => true];
    }

    /** Another RHU's visit is reported as not found. */
    public function find(User $user, int $entryId): RhuVisitQueueEntry
    {
        $rhuId = $this->authorizeRhuUser($user);

        return RhuVisitQueueEntry::query()
            ->where('rural_health_unit_id', $rhuId)
            ->whereKey($entryId)
            ->firstOrFail();
    }

    /**
     * Close a waiting visit with an audited reason. Referral status is not changed (D13).
     */
    public function close(User $user, int $entryId, string $reason, ?string $note): RhuVisitQueueEntry
    {
        $this->authorizeRhuUser($user);
        ActionPermissions::ensure($user, 'patients.register');
        $reason = trim($reason);
        if (! in_array($reason, RhuVisitQueueEntry::CLOSE_REASONS, true)) {
            throw ValidationException::withMessages([
                'reason' => ['Choose why this visit is being closed.'],
            ]);
        }
        $note = $note === null ? null : trim($note);
        if ($note === '') {
            $note = null;
        }
        if ($reason === RhuVisitQueueEntry::CLOSE_REASON_OTHER && $note === null) {
            throw ValidationException::withMessages([
                'note' => ['A note is required when the reason is Other.'],
            ]);
        }
        if ($note !== null && mb_strlen($note) > self::CLOSE_NOTE_MAX_LENGTH) {
            throw ValidationException::withMessages([
                'note' => ['The note may not be longer than '.self::CLOSE_NOTE_MAX_LENGTH.' characters.'],
            ]);
        }

        $closed = null;
        $conflictId = null;
        DB::transaction(function () use ($user, $entryId, $reason, $note, &$closed, &$conflictId): void {
            $entry = $this->lockedVisit($user, $entryId);
            if ($entry->closed_at !== null || $entry->status !== RhuVisitQueueEntry::STATUS_WAITING) {
                $conflictId = $entry->id;
                return;
            }

            $entry->update([
                'status' => RhuVisitQueueEntry::STATUS_CLOSED,
                'closed_at' => now(),
                'closed_by' => $user->id,
                'close_reason' => $reason,
                'close_note' => $note,
            ]);

            AuditLog::create([
                'user_id' => $user->id,
                'action' => 'visit_closed',
                'module' => 'rhu_visit_queue',
                'description' => implode('; ', array_filter([
                    "visit_id={$entry->id}",
                    "reason={$reason}",
                    $note !== null ? 'note_present=1' : null,
                ])).'.',
            ]);

            $closed = $entry->fresh();
        });
        if ($conflictId !== null) {
            throw new RhuVisitStateException('VISIT_NOT_WAITING', 'Only a waiting visit can be closed.', $conflictId);
        }

        return $closed ?? throw new \LogicException('Close did not persist the visit.');
    }

    /**
     * Mint one consultation identity for a waiting visit, or return the existing
     * one. Selected follow-up ids are stored on the visit; they are not fulfilled.
     * No doctor is assigned and no draft is created.
     *
     * @param  list<int>  $followUpTaskIds
     */
    public function start(User $user, int $entryId, array $followUpTaskIds = []): RhuVisitQueueEntry
    {
        $this->authorizeRhuUser($user);
        ActionPermissions::ensure($user, 'consultations.encode');

        $started = null;
        $conflict = null;
        DB::transaction(function () use ($user, $entryId, $followUpTaskIds, &$started, &$conflict): void {
            $entry = $this->lockedVisit($user, $entryId);
            if ($entry->closed_at !== null || $entry->status === RhuVisitQueueEntry::STATUS_CLOSED) {
                $conflict = ['errorCode' => 'VISIT_CLOSED', 'message' => 'A closed visit cannot be started.', 'id' => $entry->id];
                return;
            }
            if ($entry->status === RhuVisitQueueEntry::STATUS_IN_CONSULTATION
                && filled($entry->consultation_uuid)) {
                $started = $entry;
                return;
            }
            if ($entry->status !== RhuVisitQueueEntry::STATUS_WAITING || filled($entry->consultation_uuid)) {
                $conflict = ['errorCode' => 'VISIT_NOT_WAITING', 'message' => 'Only a waiting visit can start a consultation.', 'id' => $entry->id];
                return;
            }

            $entry->update([
                'status' => RhuVisitQueueEntry::STATUS_IN_CONSULTATION,
                'consultation_uuid' => (string) Str::uuid(),
                'continued_follow_up_task_ids' => $this->eligibleFollowUpTaskIds($entry, $followUpTaskIds),
            ]);
            $started = $entry->fresh();
        });
        if ($conflict !== null) {
            throw new RhuVisitStateException($conflict['errorCode'], $conflict['message'], $conflict['id']);
        }

        return $started ?? throw new \LogicException('Start did not persist the consultation identity.');
    }

    /**
     * The visit that owns this RHU ITR: in consultation, same patient and uuid.
     */
    public function authorizeInConsultation(User $user, int $entryId, int $patientId, ?string $consultationUuid): RhuVisitQueueEntry
    {
        $this->authorizeRhuUser($user);
        $entry = $this->find($user, $entryId);
        if ((int) $entry->patient_id !== $patientId
            || $entry->status !== RhuVisitQueueEntry::STATUS_IN_CONSULTATION
            || $entry->closed_at !== null
            || ! filled($entry->consultation_uuid)) {
            throw new RhuVisitStateException(
                'VISIT_NOT_IN_CONSULTATION',
                'This visit is not in consultation.',
                $entry->id
            );
        }
        if ($consultationUuid && strcasecmp((string) $entry->consultation_uuid, $consultationUuid) !== 0) {
            throw ValidationException::withMessages([
                'consultation_uuid' => ['This consultation does not match the started visit.'],
            ]);
        }

        return $entry;
    }

    /**
     * D11: finalizing the health record closes the visit as completed.
     * Safe to call again on an already-completed visit of the same uuid.
     */
    public function completeConsultation(User $user, RhuVisitQueueEntry $entry, string $consultationUuid): RhuVisitQueueEntry
    {
        $entry = RhuVisitQueueEntry::query()->whereKey($entry->id)->lockForUpdate()->firstOrFail();
        if ($entry->closed_at !== null
            && $entry->close_reason === RhuVisitQueueEntry::CLOSE_REASON_COMPLETED
            && strcasecmp((string) $entry->consultation_uuid, $consultationUuid) === 0) {
            return $entry;
        }
        if ($entry->closed_at !== null || $entry->status === RhuVisitQueueEntry::STATUS_CLOSED) {
            throw new RhuVisitStateException(
                'VISIT_CLOSED',
                'A closed visit cannot be completed.',
                $entry->id
            );
        }
        if ($entry->status !== RhuVisitQueueEntry::STATUS_IN_CONSULTATION
            || strcasecmp((string) $entry->consultation_uuid, $consultationUuid) !== 0) {
            throw new RhuVisitStateException(
                'VISIT_NOT_IN_CONSULTATION',
                'This visit is not in consultation.',
                $entry->id
            );
        }

        $entry->update([
            'status' => RhuVisitQueueEntry::STATUS_CLOSED,
            'closed_at' => now(),
            'closed_by' => $user->id,
            'close_reason' => RhuVisitQueueEntry::CLOSE_REASON_COMPLETED,
            'close_note' => null,
        ]);

        AuditLog::create([
            'user_id' => $user->id,
            'action' => 'visit_completed',
            'module' => 'rhu_visit_queue',
            'description' => "Completed visit {$entry->id} by finalizing the consultation.",
        ]);

        return $entry->fresh();
    }

    /** Return the visit's existing consultation identity. */
    public function resume(User $user, int $entryId): RhuVisitQueueEntry
    {
        $this->authorizeRhuUser($user);
        abort_unless(
            ActionPermissions::allows($user, 'consultations.encode')
            || ActionPermissions::allows($user, 'consultations.finalize'),
            403,
            'This action is not allowed for your role.'
        );
        $entry = $this->find($user, $entryId);
        if ($entry->status !== RhuVisitQueueEntry::STATUS_IN_CONSULTATION
            || ! filled($entry->consultation_uuid)
            || $entry->closed_at !== null) {
            throw new RhuVisitStateException(
                'VISIT_NOT_IN_CONSULTATION',
                'This visit is not in consultation.',
                $entry->id
            );
        }

        return $entry;
    }

    /**
     * @return Collection<int, RhuVisitQueueEntry>
     */
    public function list(User $user, bool $activeOnly = true): Collection
    {
        $rhuId = $this->authorizeRhuUser($user);

        return RhuVisitQueueEntry::query()
            ->where('rural_health_unit_id', $rhuId)
            ->when($activeOnly, fn ($query) => $query->active())
            ->with('patient')
            ->orderBy('checked_in_at')
            ->orderBy('id')
            ->get();
    }

    /**
     * D3/D4: called inside ReferralWorkflowService::transition() when a referral
     * becomes Received. An active visit already in the queue gains the referral
     * link when it has none, and is otherwise left as it is.
     */
    public function recordReferralArrival(User $user, Referral $referral): RhuVisitQueueEntry
    {
        if ($active = $this->linkActiveVisit($referral)) {
            return $active;
        }

        try {
            return $this->performCheckIn(
                $user,
                (int) $referral->patient_id,
                (int) $referral->id,
                self::ARRIVAL_KEY_PREFIX.$referral->id,
                true
            )['entry'];
        } catch (RhuVisitDuplicateActiveException $exception) {
            // A concurrent check-in committed after our lookup; link the winner instead.
            return $this->linkActiveVisit($referral) ?? throw $exception;
        }
    }

    private function linkActiveVisit(Referral $referral): ?RhuVisitQueueEntry
    {
        $active = RhuVisitQueueEntry::query()
            ->active()
            ->where('rural_health_unit_id', $referral->rural_health_unit_id)
            ->where('patient_id', $referral->patient_id)
            ->lockForUpdate()
            ->first();

        if ($active !== null && $active->referral_id === null) {
            $active->update(['referral_id' => $referral->id]);
        }

        return $active;
    }

    /**
     * The only write. Its own transaction becomes a savepoint inside a caller's
     * transaction, so a unique violation on PostgreSQL does not abort the caller.
     */
    protected function insert(array $attributes): RhuVisitQueueEntry
    {
        return DB::transaction(fn (): RhuVisitQueueEntry => RhuVisitQueueEntry::create($attributes));
    }

    /**
     * Patients the RHU may check in, found by every whitespace-separated token
     * of a name, PhilHealth number or contact number. An empty query finds nothing.
     *
     * @return list<array{patient: Patient, active_visit_id: int|null}>
     */
    public function searchPatients(User $user, string $query): array
    {
        $rhuId = $this->authorizeRhuUser($user);
        // A handful of tokens is plenty for a name; each one adds a group of OR conditions.
        $tokens = array_slice(preg_split('/\s+/', trim($query), -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, self::SEARCH_MAX_TOKENS);
        if ($tokens === []) {
            return [];
        }

        $patients = $this->facilityAccess->scopeRhuWalkInPatients(Patient::query(), $user)
            ->where(fn ($inactive) => $inactive->whereNull('status')->orWhere('status', '!=', 'inactive'));
        foreach ($tokens as $token) {
            // Lower-cased on both sides: PostgreSQL LIKE is case-sensitive, SQLite's is not.
            // '!' is the escape character because it needs no quoting on any driver.
            $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($token)).'%';
            $patients->where(function ($match) use ($like): void {
                foreach (['first_name', 'middle_name', 'last_name', 'philhealth_number', 'contact_number'] as $column) {
                    $match->orWhereRaw("LOWER({$column}) LIKE ? ESCAPE '!'", [$like]);
                }
            });
        }

        return $this->withActiveVisitIds($rhuId, $patients->orderBy('id')->limit(10)->get());
    }

    /**
     * Active patients this RHU can see with the same first name, last name
     * (trimmed, case-insensitive) and birthdate. Without a birthdate nothing is
     * matched: a name alone is not enough to call someone a duplicate.
     *
     * @return list<array{patient: Patient, active_visit_id: int|null}>
     */
    public function findPossibleDuplicates(User $user, string $firstName, string $lastName, ?string $birthdate): array
    {
        $rhuId = $this->authorizeRhuUser($user);
        if ($birthdate === null || trim($birthdate) === '') {
            return [];
        }

        $matches = Patient::query()
            ->where('rural_health_unit_id', $rhuId)
            ->where(fn ($inactive) => $inactive->whereNull('status')->orWhere('status', '!=', 'inactive'))
            ->whereRaw('lower(trim(first_name)) = ?', [mb_strtolower(trim($firstName))])
            ->whereRaw('lower(trim(last_name)) = ?', [mb_strtolower(trim($lastName))])
            ->whereDate('birthdate', Carbon::parse($birthdate)->toDateString())
            ->orderBy('id')
            ->limit(5)
            ->get();

        return $this->withActiveVisitIds($rhuId, $matches);
    }

    /**
     * @param  iterable<Patient>  $patients
     * @return list<array{patient: Patient, active_visit_id: int|null}>
     */
    private function withActiveVisitIds(int $rhuId, iterable $patients): array
    {
        $patients = collect($patients);
        $visits = RhuVisitQueueEntry::query()
            ->active()
            ->where('rural_health_unit_id', $rhuId)
            ->whereIn('patient_id', $patients->pluck('id'))
            ->pluck('id', 'patient_id');

        return $patients
            ->map(fn (Patient $patient): array => ['patient' => $patient, 'active_visit_id' => $visits[$patient->id] ?? null])
            ->values()
            ->all();
    }

    /**
     * @param  list<mixed>  $ids
     * @return list<int>
     */
    private function eligibleFollowUpTaskIds(RhuVisitQueueEntry $entry, array $ids): array
    {
        $selected = [];
        foreach ($ids as $id) {
            $taskId = (int) $id;
            if ($taskId > 0 && ! in_array($taskId, $selected, true)) {
                $selected[] = $taskId;
            }
        }
        if ($selected === []) {
            return [];
        }

        $tasks = FollowUpTask::query()->whereIn('id', $selected)->get()->keyBy('id');
        foreach ($selected as $index => $taskId) {
            $task = $tasks->get($taskId);
            $samePatient = $task !== null && (int) $task->patient_id === (int) $entry->patient_id;
            $sameFacility = $task !== null && (int) $task->rural_health_unit_id === (int) $entry->rural_health_unit_id;
            if (! $samePatient || ! $sameFacility) {
                throw ValidationException::withMessages([
                    "follow_up_task_ids.$index" => 'This follow-up does not belong to this patient.',
                ]);
            }
            $pending = in_array($task->state, FollowUpTask::ACTIVE_STATES, true)
                && $task->fulfilled_at === null
                && $task->rescheduled_to_id === null;
            if (! $pending) {
                throw ValidationException::withMessages([
                    "follow_up_task_ids.$index" => 'This follow-up is no longer pending.',
                ]);
            }
        }

        return $selected;
    }

    private function lockedVisit(User $user, int $entryId): RhuVisitQueueEntry
    {
        $rhuId = $this->authorizeRhuUser($user);

        return RhuVisitQueueEntry::query()
            ->where('rural_health_unit_id', $rhuId)
            ->whereKey($entryId)
            ->lockForUpdate()
            ->firstOrFail();
    }

    /** Only RHU staff with an active facility assignment; returns their RHU id. */
    private function authorizeRhuUser(User $user): int
    {
        abort_unless(
            $user->isRhu() && $this->facilityAccess->hasValidFacilityAssignment($user),
            403,
            self::DENIED_MESSAGE
        );

        return (int) $user->rural_health_unit_id;
    }

    /**
     * @return array{entry: RhuVisitQueueEntry, created: bool}|null
     */
    private function resolveExisting(int $rhuId, string $key, int $patientId, ?int $referralId, string $source): ?array
    {
        $sameKey = RhuVisitQueueEntry::query()
            ->where('rural_health_unit_id', $rhuId)
            ->where('check_in_key', $key)
            ->first();

        if ($sameKey !== null) {
            // A walk-in visit may gain a referral link after check-in (D4), so its
            // referral_id is not part of what the original request sent.
            $sameReferral = $source === RhuVisitQueueEntry::SOURCE_WALK_IN
                || (int) $sameKey->referral_id === $referralId;
            $samePayload = (int) $sameKey->patient_id === $patientId
                && $sameKey->source === $source
                && $sameReferral;

            if (! $samePayload) {
                throw new RhuVisitCheckInKeyConflictException();
            }

            return ['entry' => $sameKey, 'created' => false];
        }

        $active = RhuVisitQueueEntry::query()
            ->active()
            ->where('rural_health_unit_id', $rhuId)
            ->where('patient_id', $patientId)
            ->first();

        if ($active !== null) {
            throw new RhuVisitDuplicateActiveException($active);
        }

        return null;
    }
}
