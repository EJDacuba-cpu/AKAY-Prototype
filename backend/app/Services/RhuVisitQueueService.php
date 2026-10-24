<?php

namespace App\Services;

use App\Exceptions\RhuVisitCheckInKeyConflictException;
use App\Exceptions\RhuVisitDuplicateActiveException;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Check-in and lookup for the RHU visit queue. A visit never changes the
 * patient, the referral or any clinical record.
 */
class RhuVisitQueueService
{
    private const DENIED_MESSAGE = 'This resource is outside your assigned facility.';

    private const KEY_MAX_LENGTH = 100;

    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    /**
     * @return array{entry: RhuVisitQueueEntry, created: bool}
     */
    public function checkIn(User $user, int $patientId, ?int $referralId, string $checkInKey): array
    {
        $rhuId = $this->authorizeRhuUser($user);

        $key = trim($checkInKey);
        if ($key === '' || mb_strlen($key) > self::KEY_MAX_LENGTH) {
            throw ValidationException::withMessages([
                'check_in_key' => ['A check-in key of at most '.self::KEY_MAX_LENGTH.' characters is required.'],
            ]);
        }

        $patient = Patient::findOrFail($patientId);
        $this->facilityAccess->authorizePatient($user, $patient);
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
     * The only write. Its own transaction becomes a savepoint inside a caller's
     * transaction, so a unique violation on PostgreSQL does not abort the caller.
     */
    protected function insert(array $attributes): RhuVisitQueueEntry
    {
        return DB::transaction(fn (): RhuVisitQueueEntry => RhuVisitQueueEntry::create($attributes));
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
