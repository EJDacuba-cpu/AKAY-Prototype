<?php

namespace App\Services;

use App\Exceptions\DraftConsultationExistsException;
use App\Exceptions\DraftFinalizationConflictException;
use App\Exceptions\DraftVersionConflictException;
use App\Models\AuditLog;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
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
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '>', now())
            ->with('patient:id,first_name,middle_name,last_name')
            ->latest('last_saved_at')
            ->paginate($perPage);
    }

    /**
     * The active draft for one consultation identity, or null.
     *
     * Owner and BHC predicates are part of the lookup: consultation_uuid says
     * WHICH consultation, never WHO may open it.
     */
    public function findActiveByConsultationUuid(
        User $user,
        ?string $consultationUuid
    ): ?HealthRecordDraft {
        if ($consultationUuid === null || $consultationUuid === '') {
            return null;
        }

        return HealthRecordDraft::query()
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('consultation_uuid', $consultationUuid)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '>', now())
            ->first();
    }

    public function create(User $user, array $data): HealthRecordDraft
    {
        $this->ensureBhw($user);
        $patient = $this->authorizedPatient($user, (int) $data['patient_id']);
        $consultationUuid = $this->normalizeConsultationUuid(
            $data['consultation_uuid'] ?? null
        );

        // This consultation already has a server draft - the client simply did
        // not know its public id (it went offline before the first autosave, or
        // another tab got there first). Creating a second draft would split one
        // consultation in two, so the caller is told which draft to update
        // instead. Its payload is NOT overwritten here: that would be a silent
        // write over content this request has never seen.
        if ($existing = $this->findActiveByConsultationUuid($user, $consultationUuid)) {
            throw new DraftConsultationExistsException($existing);
        }

        $payload = $this->payloads->sanitize($data['payload']);
        $this->authorizeMedicineSelections($user, $payload);
        $ciphertext = $this->encrypt($payload);

        try {
            return $this->insertDraft($user, $patient, $data, $ciphertext, $consultationUuid);
        } catch (QueryException $exception) {
            // Two creates for one consultation raced past the check above; the
            // partial unique index let exactly one through. Answer the loser the
            // same way as if it had arrived second.
            $existing = $this->findActiveByConsultationUuid($user, $consultationUuid);
            if ($existing !== null) {
                throw new DraftConsultationExistsException($existing);
            }

            throw $exception;
        }
    }

    private function insertDraft(
        User $user,
        Patient $patient,
        array $data,
        string $ciphertext,
        ?string $consultationUuid
    ): HealthRecordDraft {
        return DB::transaction(function () use (
            $user,
            $patient,
            $data,
            $ciphertext,
            $consultationUuid
        ): HealthRecordDraft {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $activeCount = HealthRecordDraft::query()
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
                'consultation_uuid' => $consultationUuid,
                'owner_user_id' => $user->id,
                'editor_user_id' => $user->id,
                'last_editor_user_id' => $user->id,
                'editor_expires_at' => now()->addMinutes(15),
                'review_state' => 'encoding',
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
        abort_unless((int) $draft->patient_id === (int) $data['patient_id'], 422, 'A consultation cannot be reassigned to another patient.');
        $this->assertEditor($user, $draft);
        $patient = $this->authorizedPatient($user, (int) $data['patient_id']);
        $payload = $this->payloads->sanitize($data['payload']);
        $this->authorizeMedicineSelections($user, $payload);
        $ciphertext = $this->encrypt($payload);
        $expectedVersion = (int) $data['version'];

        // Adopt-once: a draft created before consultation identities existed
        // gains one the first time a current client saves it. An identity that
        // is already set is never reassigned - the consultation keeps the uuid
        // it was born with, whatever a later client claims.
        $adoptedUuid = $draft->consultation_uuid === null
            ? $this->normalizeConsultationUuid($data['consultation_uuid'] ?? null)
            : null;

        if ($adoptedUuid !== null
            && $this->findActiveByConsultationUuid($user, $adoptedUuid) !== null) {
            // That identity belongs to a different active draft; saving would
            // merge two consultations into one row.
            throw new DraftConsultationExistsException(
                $this->findActiveByConsultationUuid($user, $adoptedUuid)
            );
        }

        $updated = HealthRecordDraft::query()
            ->whereKey($draft->id)
            ->where('barangay_health_center_id', $user->barangay_health_center_id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '>', now())
            ->where('version', $expectedVersion)
            ->where('editor_user_id', $user->id)
            ->where('editor_expires_at', '>', now())
            ->where('review_state', 'encoding')
            ->update([
                'patient_id' => $patient->id,
                'classification' => $data['classification'],
                ...($adoptedUuid !== null
                    ? ['consultation_uuid' => $adoptedUuid]
                    : []),
                'encrypted_payload' => $ciphertext,
                'version' => DB::raw('version + 1'),
                'last_editor_user_id' => $user->id,
                'editor_expires_at' => now()->addMinutes(15),
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
        $this->assertEditor($user, $draft);
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
                // Resume reads this enriched list rather than the raw payload,
                // so the remarks have to be carried through here too.
                'remarks' => (string) ($selection['remarks'] ?? ''),
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

        ActionPermissions::ensure($user, 'consultations.finalize');
        $this->assertEditor($user, $draft, false);
        abort_unless($draft->review_state === 'review', 409, 'Submit and review this consultation before finalizing.');
        abort_unless((int) request()->header('X-Draft-Version') === (int) $draft->version, 409, 'The consultation changed. Reload the review before finalizing.');
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

    private function normalizeConsultationUuid(mixed $value): ?string
    {
        $uuid = is_string($value) ? trim($value) : '';

        return $uuid === '' ? null : strtolower($uuid);
    }

    public function transition(User $user, string $publicId, string $action, int $version, ?string $note = null): HealthRecordDraft
    {
        $this->loadOwnedActive($user, $publicId);
        return DB::transaction(function () use ($user, $publicId, $action, $version, $note) {
            $draft = HealthRecordDraft::where('public_id', $publicId)->lockForUpdate()->firstOrFail();
            abort_unless($draft->status === HealthRecordDraft::STATUS_ACTIVE && $draft->expires_at?->isFuture(), 409, 'This consultation is no longer editable.');
            if ((int) $draft->version !== $version) {
                throw new DraftVersionConflictException;
            }
            if ($action === 'claim' || $action === 'takeover') {
                if ($draft->review_state === 'review') {
                    ActionPermissions::ensure($user, 'consultations.finalize');
                }
                $occupied = $draft->editor_user_id && (int) $draft->editor_user_id !== (int) $user->id && $draft->editor_expires_at?->isFuture();
                abort_if($occupied && $action !== 'takeover', 409, 'Being edited by '.$draft->editor?->name.'. Confirm takeover to continue.');
                if ($action === 'takeover') {
                    abort_unless(filled($note), 422, 'A takeover reason is required.');
                }
                $draft->editor_user_id = $user->id;
                $draft->editor_expires_at = now()->addMinutes(15);
            } elseif ($action === 'submit') {
                $this->assertEditor($user, $draft);
                $draft->review_state = 'review';
                $draft->editor_user_id = null;
                $draft->editor_expires_at = null;
            } elseif ($action === 'return') {
                ActionPermissions::ensure($user, 'consultations.finalize');
                $this->assertEditor($user, $draft, false);
                abort_unless($draft->review_state === 'review' && filled($note), 422, 'A correction note is required for a consultation under review.');
                $draft->review_state = 'encoding';
                $draft->return_note = $note;
            } else {
                abort(422, 'Unsupported consultation action.');
            }
            $draft->version++;
            $draft->save();
            DB::table('consultation_events')->insert(['health_record_draft_id' => $draft->id, 'actor_id' => $user->id, 'action' => $action, 'version' => $draft->version, 'note' => $note, 'created_at' => now()]);
            return $draft->fresh(['patient', 'editor']);
        });
    }

    private function assertEditor(User $user, HealthRecordDraft $draft, bool $encoding = true): void
    {
        abort_unless((int) $draft->editor_user_id === (int) $user->id && $draft->editor_expires_at?->isFuture(), 409, 'Your editing session ended or was taken over. Reopen the consultation.');
        abort_if($encoding && $draft->review_state !== 'encoding', 409, 'Return this consultation for correction before editing.');
    }

    public function metadata(HealthRecordDraft $draft): array
    {
        return [
            'id' => $draft->public_id,
            'consultation_uuid' => $draft->consultation_uuid,
            'patient' => [
                'id' => $draft->patient?->id,
                'label' => $draft->patient?->full_name ?: 'Patient',
            ],
            'classification' => $draft->classification,
            'review_state' => $draft->review_state,
            'created_by' => $draft->owner_user_id,
            'editor' => $draft->editor ? ['id' => $draft->editor->id, 'name' => $draft->editor->name] : null,
            'editor_expires_at' => $draft->editor_expires_at?->toISOString(),
            'return_note' => $draft->return_note,
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
        ActionPermissions::ensure($user, 'consultations.encode');
    }

    private function expireOwnedDrafts(User $user, ?string $publicId = null): void
    {
        HealthRecordDraft::query()
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
