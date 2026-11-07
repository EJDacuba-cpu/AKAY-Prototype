<?php

namespace App\Services;

use App\Exceptions\DraftConsultationExistsException;
use App\Exceptions\DraftFinalizationConflictException;
use App\Exceptions\DraftVersionConflictException;
use App\Models\AuditLog;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\User;
use Closure;
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
        private readonly HealthRecordDraftPayloadService $payloads,
        private readonly FormDraftRecoveryKeyService $recoveryKeys,
    ) {}

    public function listFor(User $user, int $perPage): LengthAwarePaginator
    {
        $this->ensureEncoder($user);
        $this->expireOwnedDrafts($user);

        return HealthRecordDraft::query()
            ->tap(fn ($query) => $this->applyFacilityScope($query, $user))
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '>', now())
            ->with('patient:id,first_name,middle_name,last_name')
            ->latest('last_saved_at')
            ->paginate($perPage);
    }

    public function lookupFor(User $user, int $patientId, mixed $visitId = null): ?HealthRecordDraft
    {
        $this->ensureEncoder($user);
        $this->authorizedPatient($user, $patientId);
        if ($user->isRhu()) {
            // Queue entry checks before Start. Only this read may inspect a
            // waiting visit; writes still require authorizedRhuVisit().
            $visit = RhuVisitQueueEntry::query()
                ->whereKey((int) $visitId)
                ->where('rural_health_unit_id', $user->rural_health_unit_id)
                ->where('patient_id', $patientId)
                ->whereIn('status', [RhuVisitQueueEntry::STATUS_WAITING, RhuVisitQueueEntry::STATUS_IN_CONSULTATION])
                ->whereNull('closed_at')->first();
            if ($visit === null) {
                throw ValidationException::withMessages([
                    'rhu_visit_id' => ['This visit is not open for this patient at your RHU.'],
                ]);
            }
        }
        $this->expireOwnedDrafts($user, patientId: $patientId, visitId: $visitId);

        return $this->findActiveSlot($user, $patientId, $visitId)?->load('patient:id,first_name,middle_name,last_name');
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
            ->tap(fn ($query) => $this->applyFacilityScope($query, $user))
            ->where('consultation_uuid', $consultationUuid)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '>', now())
            ->first();
    }

    public function create(User $user, array $data): HealthRecordDraft
    {
        $this->ensureEncoder($user);
        $patient = $this->authorizedPatient($user, (int) $data['patient_id'], $data['rhu_visit_id'] ?? null);
        // Expire the old target before entering a different UUID boundary.
        $this->expireOwnedDrafts($user, patientId: (int) $patient->id, visitId: $data['rhu_visit_id'] ?? null);
        $uuid = $this->normalizeConsultationUuid($data['consultation_uuid'] ?? null);
        if ($user->isRhu()) {
            $uuid = $this->authorizedRhuVisit($user, $patient, $data['rhu_visit_id'] ?? null, $uuid)->consultation_uuid;
            $data['consultation_uuid'] = $uuid;
        }
        $create = function () use ($user, $data, $uuid) {
            if ($uuid !== null) {
                $this->recoveryKeys->assertClinicalActive($uuid);
                $this->recoveryKeys->bindClinicalIdentity($uuid, $user->isRhu() ? 'rhu:'.$user->rural_health_unit_id : 'bhc:'.$user->barangay_health_center_id, $user->isRhu() ? 'visit:'.$data['rhu_visit_id'] : 'patient:'.$data['patient_id']);
            }

            return $this->createWithinIdentity($user, $data);
        };

        return $uuid ? $this->recoveryKeys->withClinicalIdentity($uuid, $create) : $create();
    }

    private function createWithinIdentity(User $user, array $data): HealthRecordDraft
    {
        $this->ensureEncoder($user);
        $patient = $this->authorizedPatient($user, (int) $data['patient_id'], $data['rhu_visit_id'] ?? null);
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
        $this->authorizeBackgroundUpdate($user, $payload);
        $this->authorizeMedicineSelections($user, $payload);
        $ciphertext = $this->encrypt($payload);
        if ($existing = $this->findActiveSlot($user, (int) $patient->id, $data['rhu_visit_id'] ?? null)) {
            throw new DraftConsultationExistsException($existing);
        }

        try {
            return $this->insertDraft($user, $patient, $data, $ciphertext, $consultationUuid, $payload);
        } catch (QueryException $exception) {
            // Two creates for one consultation raced past the check above; the
            // partial unique index let exactly one through. Answer the loser the
            // same way as if it had arrived second.
            $existing = $this->findActiveByConsultationUuid($user, $consultationUuid)
                ?? $this->findActiveSlot($user, (int) $patient->id, $data['rhu_visit_id'] ?? null);
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
        ?string $consultationUuid,
        array $payload,
    ): HealthRecordDraft {
        return DB::transaction(function () use (
            $user,
            $patient,
            $data,
            $ciphertext,
            $consultationUuid,
            $payload,
        ): HealthRecordDraft {
            $current = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            app(WorkingFacilityService::class)->select($current, $user->workingFacility['key'] ?? null);
            $user = $current;
            $this->ensureEncoder($user);
            $this->authorizeBackgroundUpdate($user, $payload);
            $this->authorizeMedicineSelections($user, $payload);
            $patient = Patient::query()->whereKey($patient->id)->lockForUpdate()->firstOrFail();
            abort_unless($this->facilityAccess->canAccessPatient($user, $patient), 403);
            if ($existing = $this->findActiveSlot($user, (int) $patient->id, $data['rhu_visit_id'] ?? null)) {
                throw new DraftConsultationExistsException($existing);
            }
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

            $visit = $user->isRhu()
                ? $this->authorizedRhuVisit($user, $patient, $data['rhu_visit_id'] ?? null, $consultationUuid)
                : null;

            return HealthRecordDraft::create([
                'public_id' => (string) Str::uuid(),
                'consultation_uuid' => $consultationUuid ?? $visit?->consultation_uuid,
                'owner_user_id' => $user->id,
                'editor_user_id' => $user->id,
                'last_editor_user_id' => $user->id,
                'editor_expires_at' => now()->addMinutes(15),
                'review_state' => 'encoding',
                'barangay_health_center_id' => $user->isRhu() ? null : $user->barangay_health_center_id,
                'rural_health_unit_id' => $user->isRhu() ? $user->rural_health_unit_id : null,
                'rhu_visit_id' => $visit?->id,
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
        $this->ensureEncoder($user);
        $this->expireOwnedDrafts($user, $publicId);

        $draft = HealthRecordDraft::query()
            ->where('public_id', $publicId)
            ->tap(fn ($query) => $this->applyFacilityScope($query, $user))
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

    private function findActiveSlot(User $user, int $patientId, mixed $visitId): ?HealthRecordDraft
    {
        return HealthRecordDraft::query()->tap(fn ($query) => $this->applyFacilityScope($query, $user))
            ->where('patient_id', $patientId)->where('status', 'active')->where('expires_at', '>', now())
            ->when($user->isRhu(), fn ($query) => $query->where('rhu_visit_id', $visitId), fn ($query) => $query->whereNull('rural_health_unit_id'))
            ->first();
    }

    public function update(User $user, string $publicId, array $data): HealthRecordDraft
    {
        return $this->withDraftIdentity($user, $publicId, function () use ($user, $publicId, $data) {
            return $this->updateWithinIdentity($user, $publicId, $data);
        }, $data['consultation_uuid'] ?? null);
    }

    /** Read only the authorized identity before acquiring any domain lock. */
    public function withDraftIdentity(User $user, string $publicId, Closure $action, ?string $adoptedUuid = null, bool $requireMatching = false): mixed
    {
        $this->ensureDraftAccess($user);
        $draft = HealthRecordDraft::query()->where('public_id', $publicId)
            ->tap(fn ($query) => $this->applyFacilityScope($query, $user))->firstOrFail();
        abort_if($requireMatching && $draft->consultation_uuid && $adoptedUuid && strcasecmp($draft->consultation_uuid, $adoptedUuid) !== 0, 409, 'The draft belongs to another consultation.');
        $uuid = $draft->consultation_uuid ?? $this->normalizeConsultationUuid($adoptedUuid);

        return $uuid ? $this->recoveryKeys->withClinicalIdentity($uuid, $action) : $action();
    }

    private function updateWithinIdentity(User $user, string $publicId, array $data): HealthRecordDraft
    {
        return DB::transaction(function () use ($user, $publicId, $data) {
            $draft = $this->loadOwnedActive($user, $publicId);
            $before = $this->payload($draft);
            abort_unless((int) $draft->patient_id === (int) $data['patient_id'], 422, 'A consultation cannot be reassigned to another patient.');
            $this->assertEditor($user, $draft);
            $patient = $this->authorizedPatient($user, (int) $data['patient_id'], $draft->rhu_visit_id);
            $payload = $this->payloads->sanitize($data['payload']);
            $this->authorizeBackgroundUpdate($user, $payload);
            if (! PatientBackground::canAccess($user) && isset($before['backgroundUpdate'])) {
                // This user was never sent the staged background edits (see
                // withoutRestrictedFields), so their save must not erase them.
                $payload['backgroundUpdate'] = $before['backgroundUpdate'];
            }
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

            if ($uuid = $draft->consultation_uuid ?? $adoptedUuid) {
                $this->recoveryKeys->assertClinicalActive($uuid);
                $this->recoveryKeys->bindClinicalIdentity($uuid, $draft->rural_health_unit_id ? 'rhu:'.$draft->rural_health_unit_id : 'bhc:'.$draft->barangay_health_center_id, $draft->rhu_visit_id ? 'visit:'.$draft->rhu_visit_id : 'patient:'.$draft->patient_id);
            }

            $updated = HealthRecordDraft::query()
                ->whereKey($draft->id)
                ->tap(fn ($query) => $this->applyFacilityScope($query, $user))
                ->where('status', HealthRecordDraft::STATUS_ACTIVE)
                ->where('expires_at', '>', now())
                ->where('version', $expectedVersion)
                ->where('editor_user_id', $user->id)
                ->where('editor_expires_at', '>', now())
                ->where('review_state', $draft->review_state)
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

            $changes = [];
            foreach (array_unique([...array_keys($before), ...array_keys($payload)]) as $key) {
                if (($before[$key] ?? null) !== ($payload[$key] ?? null)) {
                    $changes[$key] = ['before' => $before[$key] ?? null, 'after' => $payload[$key] ?? null];
                }
            }
            DB::table('consultation_events')->insert(['health_record_draft_id' => $draft->id, 'actor_id' => $user->id, 'action' => 'edited', 'version' => $expectedVersion + 1, 'encrypted_changes' => Crypt::encryptString(json_encode($changes, JSON_THROW_ON_ERROR)), 'created_at' => now()]);

            return $draft->fresh(['patient']);
        });
    }

    public function discard(User $user, string $publicId, ?int $version = null): HealthRecordDraft
    {
        return $this->withDraftIdentity($user, $publicId, fn () => DB::transaction(fn () => $this->discardWithinIdentity($user, $publicId, $version)));
    }

    private function discardWithinIdentity(User $user, string $publicId, ?int $version): HealthRecordDraft
    {
        $draft = $this->loadOwnedActive($user, $publicId);
        $this->assertEditor($user, $draft);
        if ($version !== null && (int) $draft->version !== $version) {
            throw new DraftVersionConflictException;
        }
        $updated = HealthRecordDraft::query()
            ->whereKey($draft->id)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('version', $draft->version)
            ->update([
                'status' => HealthRecordDraft::STATUS_DISCARDED,
                'encrypted_payload' => null,
                'updated_at' => now(),
            ]);

        if ($updated !== 1) {
            throw new DraftVersionConflictException;
        }

        $draft = $draft->fresh();
        $this->recoveryKeys->retireClinical($draft);

        return $draft;
    }

    public function payload(HealthRecordDraft $draft): array
    {
        try {
            $plaintext = Crypt::decryptString((string) $draft->encrypted_payload);
            $decoded = json_decode($plaintext, true, flags: JSON_THROW_ON_ERROR);

            return $this->payloads->sanitizeStored(is_array($decoded) ? $decoded : []);
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
        $selections = collect($payload['dispensedMedicines'] ?? [])
            ->merge($payload['prescribedMedicines'] ?? [])
            ->filter(fn (mixed $row): bool => is_array($row))
            ->values();
        $ids = $selections
            ->pluck('medicineId')
            ->map(fn (mixed $id): int => (int) $id)
            ->filter()
            ->unique()
            ->values();
        $medicines = Medicine::query()->whereIn('id', $ids)->get()->keyBy('id');

        return $selections->map(function (array $selection) use ($user, $medicines): array {
            $medicineId = (int) $selection['medicineId'];
            $medicine = $medicines->get($medicineId);
            $authorized = $medicine !== null && (
                $user->isRhu()
                    ? (int) $medicine->rural_health_unit_id === (int) $user->rural_health_unit_id
                    : $medicine->rural_health_unit_id === null
                        && (int) $medicine->barangay_health_center_id === (int) $user->barangay_health_center_id
            );
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

        $this->ensureDraftAccess($user);
        $draft = HealthRecordDraft::query()
            ->where('public_id', $publicId)
            ->tap(fn ($query) => $this->applyFacilityScope($query, $user))
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
        // Explicit finalization permission permits finalizing one's own draft.
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

        $this->ensureDraftAccess($user);
        $updated = HealthRecordDraft::query()
            ->whereKey($draft->id)
            ->tap(fn ($query) => $this->applyFacilityScope($query, $user))
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
        $this->recoveryKeys->retireClinical($draft);
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
                abort_if(blank($this->payload($draft)['chiefComplaint'] ?? null), 422, 'Chief complaint is required.');
                $draft->review_state = 'review';
                $reviewers = ActionPermissions::bhcRecipients((int) $draft->barangay_health_center_id, 'consultations.finalize');
                app(UserNotificationService::class)->notifyUsers($reviewers, 'Consultation For Review', 'A consultation is ready for review.', 'consultation_review', null, '/bhc/health-records/add?draftId='.$draft->public_id, 'health_record_draft', $draft->id);
                $draft->editor_user_id = null;
                $draft->editor_expires_at = null;
            } elseif ($action === 'return') {
                ActionPermissions::ensure($user, 'consultations.finalize');
                $this->assertEditor($user, $draft, false);
                abort_unless($draft->review_state === 'review' && filled($note), 422, 'A correction note is required for a consultation under review.');
                $draft->review_state = 'encoding';
                $draft->return_note = $note;
                app(UserNotificationService::class)->notifyUser(User::find($draft->owner_user_id), 'Consultation Returned for Correction', $note, 'consultation_correction', null, '/bhc/health-records/add?draftId='.$draft->public_id, 'health_record_draft', $draft->id);
                $draft->editor_user_id = null;
                $draft->editor_expires_at = null;
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
        if ($encoding && $draft->review_state === 'review') {
            ActionPermissions::ensure($user, 'consultations.finalize');
            ActionPermissions::ensure($user, 'records.correct');
        }
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
            'can_edit' => $draft->review_state !== 'review' || ActionPermissions::allows(request()->user(), 'consultations.finalize'),
            'created_by' => $draft->owner_user_id,
            'editor' => $draft->editor ? ['id' => $draft->editor->id, 'name' => $draft->editor->name] : null,
            'editor_expires_at' => $draft->editor_expires_at?->toISOString(),
            'return_note' => $draft->return_note,
            'version' => (int) $draft->version,
            'last_saved_at' => $draft->last_saved_at?->toISOString(),
            'expires_at' => $draft->expires_at?->toISOString(),
        ];
    }

    private function authorizedPatient(User $user, int $patientId, mixed $rhuVisitId = null): Patient
    {
        $patient = Patient::query()->whereKey($patientId)->first();
        if ($patient === null || ! $this->facilityAccess->canAccessPatient($user, $patient)) {
            throw ValidationException::withMessages([
                'patient_id' => ['The selected patient is not available to your facility.'],
            ]);
        }
        if ($user->isRhu() && $rhuVisitId) {
            $this->authorizedRhuVisit($user, $patient, $rhuVisitId, null);
        }

        return $patient;
    }

    private function authorizedRhuVisit(User $user, Patient $patient, mixed $visitId, ?string $consultationUuid): RhuVisitQueueEntry
    {
        if (! filter_var($visitId, FILTER_VALIDATE_INT) || (int) $visitId <= 0) {
            throw ValidationException::withMessages([
                'rhu_visit_id' => ['An in-consultation visit is required to save this RHU consultation.'],
            ]);
        }

        $visit = RhuVisitQueueEntry::query()
            ->whereKey((int) $visitId)
            ->where('rural_health_unit_id', $user->rural_health_unit_id)
            ->where('patient_id', $patient->id)
            ->where('status', RhuVisitQueueEntry::STATUS_IN_CONSULTATION)
            ->whereNull('closed_at')
            ->first();

        if ($visit === null) {
            throw ValidationException::withMessages([
                'rhu_visit_id' => ['This visit is not in consultation at your RHU.'],
            ]);
        }
        if ($consultationUuid && strcasecmp((string) $visit->consultation_uuid, $consultationUuid) !== 0) {
            throw ValidationException::withMessages([
                'consultation_uuid' => ['This consultation does not match the started visit.'],
            ]);
        }

        return $visit;
    }

    private function applyFacilityScope($query, User $user)
    {
        if ($user->isRhu()) {
            return $query->where('rural_health_unit_id', $user->rural_health_unit_id);
        }

        return $query->where('barangay_health_center_id', $user->barangay_health_center_id);
    }

    /** The draft payload as this user may see it: staged background edits are clinical history. */
    public function withoutRestrictedFields(User $user, array $payload): array
    {
        if (! PatientBackground::canAccess($user)) {
            unset($payload['backgroundUpdate']);
        }

        return $payload;
    }

    private function authorizeBackgroundUpdate(User $user, array $payload): void
    {
        abort_if(
            isset($payload['backgroundUpdate']) && ! PatientBackground::canAccess($user),
            403,
            'You do not have permission to update the patient background.'
        );
    }

    private function authorizeMedicineSelections(User $user, array $payload): void
    {
        $ids = collect($payload['dispensedMedicines'] ?? [])
            ->merge($payload['prescribedMedicines'] ?? [])
            ->pluck('medicineId')
            ->map(fn (mixed $id): int => (int) $id)
            ->filter()
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return;
        }

        $medicines = Medicine::query()->whereIn('id', $ids);
        if ($user->isRhu()) {
            $medicines->where('rural_health_unit_id', $user->rural_health_unit_id);
        } else {
            $medicines->whereNull('rural_health_unit_id')
                ->where('barangay_health_center_id', $user->barangay_health_center_id);
        }
        $authorizedCount = $medicines->count();

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

    private function ensureEncoder(User $user): void
    {
        $this->ensureDraftAccess($user, true);
    }

    private function ensureDraftAccess(User $user, bool $mustEncode = false): void
    {
        abort_unless($user->isBhc() || $user->isRhu(), 403, 'This action is not allowed for your role.');
        $this->facilityAccess->ensureValidFacilityAssignment($user);
        if ($mustEncode && ! ($user->isRhu() && ActionPermissions::allows($user, 'consultations.finalize'))) {
            ActionPermissions::ensure($user, 'consultations.encode');

            return;
        }
        abort_unless(
            ActionPermissions::allows($user, 'consultations.encode')
            || ActionPermissions::allows($user, 'consultations.finalize'),
            403,
            'This action is not allowed for your role.'
        );
    }

    private function expireOwnedDrafts(User $user, ?string $publicId = null, ?int $patientId = null, mixed $visitId = null): void
    {
        HealthRecordDraft::query()
            ->tap(fn ($query) => $this->applyFacilityScope($query, $user))
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->where('expires_at', '<=', now())
            ->when($publicId, fn ($query) => $query->where('public_id', $publicId))
            ->when($patientId, fn ($query) => $query->where('patient_id', $patientId))
            ->when($visitId, fn ($query) => $query->where('rhu_visit_id', $visitId))
            ->select([
                'id',
                'public_id',
                'owner_user_id',
                'barangay_health_center_id',
                'rural_health_unit_id',
                'rhu_visit_id',
                'patient_id',
                'consultation_uuid',
                'classification',
                'version',
            ])
            ->chunkById(100, function ($drafts): void {
                foreach ($drafts as $draft) {
                    $expire = function () use ($draft): void {
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

                        $draft->status = HealthRecordDraft::STATUS_EXPIRED;
                        $this->recoveryKeys->retireClinical($draft);

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
                    };
                    if ($draft->consultation_uuid) {
                        $this->recoveryKeys->withClinicalIdentity($draft->consultation_uuid, $expire);
                    } else {
                        DB::transaction($expire);
                    }
                }
            });
    }

    private function medicineWarning(Medicine $medicine): ?string
    {
        if (! $medicine->is_active) {
            return 'This medicine has been archived. Remove or replace it before official submission.';
        }
        if ($medicine->isExpiredOnFacilityCalendar()) {
            return 'This medicine is expired. Remove or replace it before official submission.';
        }
        if ($medicine->expiresTodayOnFacilityCalendar()) {
            return 'This medicine expires today. Confirm it is still appropriate before official submission.';
        }
        if ($medicine->expirationCalendarDate() === null) {
            return 'Expiry is not recorded for this medicine. Confirm it is still appropriate before official submission.';
        }
        if ((int) $medicine->quantity <= 0
            || str_contains(strtolower((string) $medicine->availability_status), 'unavailable')) {
            return 'This medicine is currently unavailable. Review it before official submission.';
        }

        return null;
    }
}
