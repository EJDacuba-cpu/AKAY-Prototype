<?php

namespace App\Services;

use App\Exceptions\DraftFinalizationConflictException;
use App\Exceptions\DraftVersionConflictException;
use App\Models\AuditLog;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class HealthRecordDraftService
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly HealthRecordDraftPayloadService $payloads
    ) {}

    public function listFor(User $user, int $perPage): LengthAwarePaginator
    {
        $this->ensureBhw($user);
        $this->expireOwnedDrafts($user);

        return HealthRecordDraft::query()
            ->where('owner_user_id', $user->id)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '>', now())
            ->with('patient:id,first_name,middle_name,last_name')
            ->latest('last_saved_at')
            ->paginate($perPage);
    }

    public function create(User $user, array $data): HealthRecordDraft
    {
        $this->ensureBhw($user);
        $patient = $this->authorizedPatient($user, (int) $data['patient_id']);
        $payload = $this->payloads->sanitize($data['payload']);
        $this->authorizeMedicineSelections($user, $payload);
        $ciphertext = $this->encrypt($payload);

        return DB::transaction(function () use ($user, $patient, $data, $ciphertext): HealthRecordDraft {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $activeCount = HealthRecordDraft::query()
                ->where('owner_user_id', $user->id)
                ->where('status', HealthRecordDraft::STATUS_ACTIVE)
                ->where('expires_at', '>', now())
                ->count();

            if ($activeCount >= config('health_record_drafts.max_active_per_user')) {
                throw ValidationException::withMessages([
                    'draft' => ['You have reached the active draft limit. Discard an older draft before creating another.'],
                ]);
            }

            return HealthRecordDraft::create([
                'public_id' => (string) Str::uuid(),
                'owner_user_id' => $user->id,
                'barangay_health_center_id' => $user->barangay_health_center_id,
                'patient_id' => $patient->id,
                'classification' => $data['classification'],
                'encrypted_payload' => $ciphertext,
                'version' => 1,
                'status' => HealthRecordDraft::STATUS_ACTIVE,
                'expires_at' => now()->addDays(config('health_record_drafts.expiry_days')),
                'last_saved_at' => now(),
            ]);
        });
    }

    public function loadOwnedActive(User $user, string $publicId): HealthRecordDraft
    {
        $this->ensureBhw($user);
        $this->expireOwnedDrafts($user, $publicId);

        $draft = HealthRecordDraft::query()
            ->where('public_id', $publicId)
            ->where('owner_user_id', $user->id)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '>', now())
            ->with('patient:id,first_name,middle_name,last_name,barangay_health_center_id')
            ->first();

        if ($draft === null
            || $draft->patient === null
            || ! $this->facilityAccess->canAccessPatient($user, $draft->patient)) {
            throw (new ModelNotFoundException)->setModel(HealthRecordDraft::class);
        }

        return $draft;
    }

    public function update(User $user, string $publicId, array $data): HealthRecordDraft
    {
        $draft = $this->loadOwnedActive($user, $publicId);
        $patient = $this->authorizedPatient($user, (int) $data['patient_id']);
        $payload = $this->payloads->sanitize($data['payload']);
        $this->authorizeMedicineSelections($user, $payload);
        $ciphertext = $this->encrypt($payload);
        $expectedVersion = (int) $data['version'];

        $updated = HealthRecordDraft::query()
            ->whereKey($draft->id)
            ->where('owner_user_id', $user->id)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '>', now())
            ->where('version', $expectedVersion)
            ->update([
                'patient_id' => $patient->id,
                'classification' => $data['classification'],
                'encrypted_payload' => $ciphertext,
                'version' => DB::raw('version + 1'),
                'expires_at' => now()->addDays(config('health_record_drafts.expiry_days')),
                'last_saved_at' => now(),
                'updated_at' => now(),
            ]);

        if ($updated !== 1) {
            throw new DraftVersionConflictException;
        }

        return $draft->fresh(['patient']);
    }

    public function discard(User $user, string $publicId): HealthRecordDraft
    {
        $draft = $this->loadOwnedActive($user, $publicId);
        $updated = HealthRecordDraft::query()
            ->whereKey($draft->id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->update([
                'status' => HealthRecordDraft::STATUS_DISCARDED,
                'encrypted_payload' => null,
                'updated_at' => now(),
            ]);

        if ($updated !== 1) {
            throw (new ModelNotFoundException)->setModel(HealthRecordDraft::class);
        }

        return $draft->fresh();
    }

    public function payload(HealthRecordDraft $draft): array
    {
        try {
            $plaintext = Crypt::decryptString((string) $draft->encrypted_payload);
            $decoded = json_decode($plaintext, true, flags: JSON_THROW_ON_ERROR);

            return $this->payloads->sanitize(is_array($decoded) ? $decoded : []);
        } catch (Throwable $exception) {
            Log::warning('Health-record draft decryption failed.', [
                'draft_public_id' => $draft->public_id,
                'owner_user_id' => $draft->owner_user_id,
                'barangay_health_center_id' => $draft->barangay_health_center_id,
                'exception_type' => $exception::class,
            ]);

            abort(500, 'Unable to open this draft safely. Please contact an administrator.');
        }
    }

    public function medicineSelections(User $user, array $payload): array
    {
        $selections = $payload['dispensedMedicines'] ?? [];
        $ids = collect($selections)
            ->pluck('medicineId')
            ->map(fn (mixed $id): int => (int) $id)
            ->filter()
            ->unique()
            ->values();
        $medicines = Medicine::query()->whereIn('id', $ids)->get()->keyBy('id');

        return collect($selections)->map(function (array $selection) use ($user, $medicines): array {
            $medicineId = (int) $selection['medicineId'];
            $medicine = $medicines->get($medicineId);
            $authorized = $medicine !== null
                && $medicine->rural_health_unit_id === null
                && (int) $medicine->barangay_health_center_id
                    === (int) $user->barangay_health_center_id;
            $warning = $authorized ? $this->medicineWarning($medicine) : 'Medicine is no longer available to this facility.';

            return [
                'medicine_id' => $medicineId,
                'quantity' => (int) $selection['quantity'],
                'medicine' => $authorized ? [
                    'id' => $medicine->id,
                    'name' => $medicine->name,
                    'category' => $medicine->category,
                    'unit' => $medicine->unit,
                    'quantity' => (int) $medicine->quantity,
                    'availability_status' => $medicine->availability_status,
                    'expiration_date' => $medicine->expiration_date?->toDateString(),
                    'is_active' => (bool) $medicine->is_active,
                ] : null,
                'warning' => $warning,
            ];
        })->all();
    }

    public function lockForOfficialSave(
        User $user,
        string $publicId,
        int $patientId,
        ?string $classification
    ): HealthRecordDraft {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException(
                'Draft finalization locking requires the official health-record transaction.'
            );
        }

        $this->ensureBhw($user);
        $draft = HealthRecordDraft::query()
            ->where('public_id', $publicId)
            ->where('owner_user_id', $user->id)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->lockForUpdate()
            ->first();

        if ($draft === null) {
            throw (new ModelNotFoundException)->setModel(HealthRecordDraft::class);
        }

        if ($draft->status === HealthRecordDraft::STATUS_CONSUMED) {
            throw new DraftFinalizationConflictException(
                'DRAFT_ALREADY_CONSUMED',
                'This draft has already been finalized as an official health record.'
            );
        }

        if ($draft->status !== HealthRecordDraft::STATUS_ACTIVE
            || $draft->expires_at === null
            || $draft->expires_at->isPast()) {
            throw new DraftFinalizationConflictException;
        }

        $this->authorizedPatient($user, (int) $draft->patient_id);

        if ((int) $draft->patient_id !== $patientId
            || $draft->classification !== (string) $classification) {
            throw ValidationException::withMessages([
                'draft' => ['The selected draft does not match this official health record.'],
            ]);
        }

        return $draft;
    }

    public function consumeLocked(
        User $user,
        HealthRecordDraft $draft,
        int $healthRecordId
    ): void {
        if (DB::transactionLevel() < 1) {
            throw new \LogicException(
                'Draft consumption requires the official health-record transaction.'
            );
        }

        $this->ensureBhw($user);
        $updated = HealthRecordDraft::query()
            ->whereKey($draft->id)
            ->where('owner_user_id', $user->id)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->whereNull('consumed_health_record_id')
            ->update([
                'status' => HealthRecordDraft::STATUS_CONSUMED,
                'encrypted_payload' => null,
                'consumed_health_record_id' => $healthRecordId,
                'updated_at' => now(),
            ]);

        if ($updated !== 1) {
            throw new DraftFinalizationConflictException;
        }

        $draft->forceFill([
            'status' => HealthRecordDraft::STATUS_CONSUMED,
            'encrypted_payload' => null,
            'consumed_health_record_id' => $healthRecordId,
        ]);
    }

    public function metadata(HealthRecordDraft $draft): array
    {
        return [
            'id' => $draft->public_id,
            'patient' => [
                'id' => $draft->patient?->id,
                'label' => $draft->patient?->full_name ?: 'Patient',
            ],
            'classification' => $draft->classification,
            'version' => (int) $draft->version,
            'last_saved_at' => $draft->last_saved_at?->toISOString(),
            'expires_at' => $draft->expires_at?->toISOString(),
        ];
    }

    private function authorizedPatient(User $user, int $patientId): Patient
    {
        $patient = Patient::query()
            ->whereKey($patientId)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->first();

        if ($patient === null || ! $this->facilityAccess->canAccessPatient($user, $patient)) {
            throw ValidationException::withMessages([
                'patient_id' => ['The selected patient is not available to your facility.'],
            ]);
        }

        return $patient;
    }

    private function authorizeMedicineSelections(User $user, array $payload): void
    {
        $ids = collect($payload['dispensedMedicines'] ?? [])
            ->pluck('medicineId')
            ->map(fn (mixed $id): int => (int) $id)
            ->filter()
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return;
        }

        $authorizedCount = Medicine::query()
            ->whereIn('id', $ids)
            ->whereNull('rural_health_unit_id')
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->count();

        if ($authorizedCount !== $ids->count()) {
            throw ValidationException::withMessages([
                'payload.dispensedMedicines' => ['One or more selected medicines are not available to your facility.'],
            ]);
        }
    }

    private function encrypt(array $payload): string
    {
        try {
            return Crypt::encryptString(json_encode(
                $payload,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            ));
        } catch (Throwable $exception) {
            Log::warning('Health-record draft encryption failed.', [
                'exception_type' => $exception::class,
            ]);

            abort(500, 'Unable to save this draft safely. Please try again.');
        }
    }

    private function ensureBhw(User $user): void
    {
        abort_unless($user->isBhw(), 403, 'This action is not allowed for your role.');
        $this->facilityAccess->ensureValidFacilityAssignment($user);
    }

    private function expireOwnedDrafts(User $user, ?string $publicId = null): void
    {
        HealthRecordDraft::query()
            ->where('owner_user_id', $user->id)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '<=', now())
            ->when($publicId, fn ($query) => $query->where('public_id', $publicId))
            ->select([
                'id',
                'public_id',
                'owner_user_id',
                'barangay_health_center_id',
                'classification',
                'version',
            ])
            ->chunkById(100, function ($drafts): void {
                foreach ($drafts as $draft) {
                    DB::transaction(function () use ($draft): void {
                        $updated = HealthRecordDraft::query()
                            ->whereKey($draft->id)
                            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
                            ->where('expires_at', '<=', now())
                            ->update([
                                'status' => HealthRecordDraft::STATUS_EXPIRED,
                                'encrypted_payload' => null,
                                'updated_at' => now(),
                            ]);
                        if ($updated !== 1) {
                            return;
                        }

                        AuditLog::create([
                            'user_id' => $draft->owner_user_id,
                            'action' => 'draft_expired',
                            'module' => 'health_record_drafts',
                            'description' => implode('; ', [
                                "draft_public_id={$draft->public_id}",
                                "owner_user_id={$draft->owner_user_id}",
                                "bhc_id={$draft->barangay_health_center_id}",
                                "classification={$draft->classification}",
                                "version={$draft->version}",
                            ]).'.',
                        ]);
                    });
                }
            });
    }

    private function medicineWarning(Medicine $medicine): ?string
    {
        if (! $medicine->is_active) {
            return 'This medicine has been archived. Remove or replace it before official submission.';
        }
        if ($medicine->expiration_date?->isPast()) {
            return 'This medicine is expired. Remove or replace it before official submission.';
        }
        if ((int) $medicine->quantity <= 0
            || str_contains(strtolower((string) $medicine->availability_status), 'unavailable')) {
            return 'This medicine is currently unavailable. Review it before official submission.';
        }

        return null;
    }
}
