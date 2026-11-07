<?php

namespace App\Services;

use App\Exceptions\ClinicalRecoveryEndedException;
use App\Models\FormDraft;
use App\Models\HealthRecord;
use App\Models\HealthRecordDraft;
use App\Models\RhuVisitQueueEntry;
use App\Models\User;
use Closure;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class FormDraftRecoveryKeyService
{
    private ?string $heldClinicalIdentity = null;

    public function __construct(private readonly FormDraftRegistry $registry) {}

    /**
     * Enter BEFORE any clinical, visit, patient, user, or generic-commit locks.
     * The entire clinical terminal mutation and retirement hook belong in $action.
     * Acquiring this after existing domain locks would invert issuance's lock order.
     */
    public function withClinicalIdentity(string $uuid, Closure $action): mixed
    {
        Validator::make(['uuid' => $uuid], ['uuid' => 'required|uuid'])->validate();
        $uuid = strtolower($uuid);
        if ($this->heldClinicalIdentity !== null) {
            if ($this->heldClinicalIdentity !== $uuid) {
                throw new \LogicException('Do not nest different clinical recovery identities.');
            }

            return $action();
        }

        return DB::transaction(function () use ($uuid, $action) {
            DB::table('clinical_recovery_identities')->insertOrIgnore(['consultation_uuid' => $uuid, 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->lockForUpdate()->first();
            $this->heldClinicalIdentity = $uuid;
            try {
                $this->adoptExistingClinicalIdentity($uuid);
                return $action();
            } finally {
                $this->heldClinicalIdentity = null;
            }
        });
    }

    /** Legacy domain metadata is authoritative before any caller binds a UUID. */
    private function adoptExistingClinicalIdentity(string $uuid): void
    {
        $drafts = HealthRecordDraft::where('consultation_uuid', $uuid)
            ->get(['patient_id', 'barangay_health_center_id', 'rural_health_unit_id', 'rhu_visit_id', 'status', 'expires_at']);
        $targets = $drafts->map(fn ($draft) => [
            $draft->rural_health_unit_id ? 'rhu:'.$draft->rural_health_unit_id : 'bhc:'.$draft->barangay_health_center_id,
            $draft->rhu_visit_id ? 'visit:'.$draft->rhu_visit_id : 'patient:'.$draft->patient_id,
        ])->unique(fn ($target) => implode('|', $target));
        abort_if($targets->count() > 1, 409, 'Legacy consultation identities need review. Run the draft slot preflight.');
        if ($targets->isNotEmpty()) {
            [$scope, $context] = $targets->first();
            $this->bindClinicalIdentity($uuid, $scope, $context);
        }
        $terminal = HealthRecord::where('consultation_uuid', $uuid)->exists() ? 'consumed'
            : $drafts->first(fn ($draft) => $draft->status !== 'active')?->status;
        if (! $terminal && $drafts->isNotEmpty() && $drafts->every(fn ($draft) => $draft->expires_at?->lte(now()))) $terminal = 'expired';
        if ($terminal && DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->value('status') === 'active') {
            // Metadata only: domain expiry/discard and visit rotation remain on
            // their existing guarded workflow, never on a recovery-key read.
            DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->update(['status' => $terminal, 'updated_at' => now()]);
            DB::table('form_draft_recovery_keys')->where('form_type', 'consultation')->where('transaction_uuid', $uuid)->update(['status' => $terminal, 'encrypted_key' => null]);
        }
    }

    /** Call after setting terminal status, inside the outer withClinicalIdentity boundary. */
    public function retireClinical(HealthRecordDraft $draft): void
    {
        if ($draft->consultation_uuid !== null) {
            $this->bindClinicalIdentity(
                $draft->consultation_uuid,
                $draft->rural_health_unit_id ? 'rhu:'.$draft->rural_health_unit_id : 'bhc:'.$draft->barangay_health_center_id,
                $draft->rhu_visit_id ? 'visit:'.$draft->rhu_visit_id : 'patient:'.$draft->patient_id,
            );
            $this->retireClinicalIdentity($draft->consultation_uuid, $draft->status);
        }
    }

    /** UUIDs are identifiers, not authority to select another patient or facility. */
    public function bindClinicalIdentity(string $uuid, string $scope, string $context): void
    {
        $uuid = strtolower($uuid);
        if ($this->heldClinicalIdentity !== $uuid || DB::transactionLevel() < 1) {
            throw new \LogicException('Clinical target binding requires the outer identity boundary.');
        }
        $row = DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->first();
        abort_if($row->facility_scope !== null && ($row->facility_scope !== $scope || $row->context_key !== $context), 409);
        DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->update(['facility_scope' => $scope, 'context_key' => $context]);
    }

    public function assertClinicalActive(string $uuid): void
    {
        $uuid = strtolower($uuid);
        if ($this->heldClinicalIdentity !== $uuid) {
            throw new \LogicException('Clinical state checks require the outer identity boundary.');
        }
        if (DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->value('status') !== 'active') {
            throw new ClinicalRecoveryEndedException;
        }
    }

    /** Also supports an authorized terminal action before a server draft exists. */
    public function retireClinicalIdentity(string $uuid, string $status): void
    {
        $uuid = strtolower($uuid);
        if ($this->heldClinicalIdentity !== $uuid || DB::transactionLevel() < 1) {
            throw new \LogicException('Clinical retirement requires the outer withClinicalIdentity boundary.');
        }
        if (! in_array($status, ['consumed', 'discarded', 'expired'], true)) {
            throw new \LogicException('Clinical retirement requires a terminal status.');
        }
        $identity = DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->first();
        abort_unless($identity->status === 'active' || $identity->status === $status, 409);
        DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->update(['status' => $status, 'updated_at' => now()]);
        DB::table('form_draft_recovery_keys')->where('form_type', 'consultation')->where('transaction_uuid', $uuid)->update(['encrypted_key' => null, 'status' => $status]);
        if (in_array($status, ['discarded', 'expired'], true) && str_starts_with($identity->facility_scope ?? '', 'rhu:') && str_starts_with($identity->context_key ?? '', 'visit:')) {
            // The queue visit is still in progress. Fresh work must get a fresh
            // identity without creating another visit or completing this one.
            $visit = RhuVisitQueueEntry::query()->whereKey((int) substr($identity->context_key, 6))
                ->where('rural_health_unit_id', (int) substr($identity->facility_scope, 4))
                ->where('consultation_uuid', $uuid)->where('status', 'in_consultation')
                ->whereNull('closed_at')->lockForUpdate()->first();
            $visit?->update(['consultation_uuid' => (string) Str::uuid()]);
        }
    }

    private function authorizeClinical(User $user, array $identity, string $transaction): void
    {
        $id = (int) explode(':', $identity['context_key'])[1];
        if ($user->isRhu()) {
            $visit = RhuVisitQueueEntry::findOrFail($id);
            abort_unless($visit->status === 'in_consultation' && $visit->closed_at === null && $visit->consultation_uuid === $transaction, 409);
        }
        $clinical = HealthRecordDraft::where('consultation_uuid', $transaction)->first();
        if ($clinical) {
            $column = $user->isRhu() ? 'rural_health_unit_id' : 'barangay_health_center_id';
            $target = $user->isRhu() ? $clinical->rhu_visit_id : $clinical->patient_id;
            abort_unless((int) $clinical->$column === (int) $user->$column && (int) $target === $id, 403);
            abort_unless($clinical->status === 'active' && $clinical->expires_at->gt(now()), 409);
        }
    }

    /** Device metadata carries only an opaque key id; every reopen reauthorizes its target. */
    public function openClinical(User $user, string $publicId): array
    {
        $key = DB::table('form_draft_recovery_keys')->where('public_id', $publicId)
            ->where('user_id', $user->id)->where('form_type', 'consultation')->first();
        abort_unless($key, 404);

        return $this->issue($user, [
            'form_type' => 'consultation', 'mode' => 'edit', 'context_key' => $key->context_key,
            'transaction_uuid' => $key->transaction_uuid, 'key_id' => $key->public_id, 'key_version' => $key->key_version,
        ]);
    }

    public function discardClinicalDevice(User $user, array $input): void
    {
        $data = Validator::make($input, ['form_type' => 'required|in:consultation', 'transaction_uuid' => 'required|uuid', 'key_id' => 'required|uuid'])->validate();
        $this->withClinicalIdentity($data['transaction_uuid'], function () use ($user, $input, $data) {
            $current = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            app(WorkingFacilityService::class)->select($current, $user->workingFacility['key'] ?? null);
            $identity = $this->registry->identity($current, $input, true);
            $key = DB::table('form_draft_recovery_keys')->where('public_id', $data['key_id'])
                ->where('user_id', $current->id)->where('slot_hash', $identity['slot_hash'])
                ->where('transaction_uuid', $data['transaction_uuid'])->first();
            abort_unless($key, 404);
            abort_if(HealthRecordDraft::where('consultation_uuid', $data['transaction_uuid'])->where('status', 'active')->exists(), 409, 'Discard the current shared server draft through its consultation workflow.');
            $this->bindClinicalIdentity($data['transaction_uuid'], $current->isRhu() ? 'rhu:'.$current->rural_health_unit_id : 'bhc:'.$current->barangay_health_center_id, $identity['context_key']);
            if ($key->status === 'discarded') {
                return;
            }
            $this->assertClinicalActive($data['transaction_uuid']);
            $this->authorizeClinical($current, $identity, $data['transaction_uuid']);
            $this->retireClinicalIdentity($data['transaction_uuid'], 'discarded');
        });
    }

    /** Personal device-only discard; clinical discard stays on its workflow endpoint. */
    public function retire(User $user, array $input): void
    {
        $identity = $this->registry->identity($user, $input, allowLegacy: true);
        $data = Validator::make($input, ['transaction_uuid' => 'required|uuid', 'key_id' => 'required|uuid'])->validate();
        DB::transaction(function () use ($user, $identity, $data) {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            // An existing server revision must be explicitly version-discarded first.
            abort_if(FormDraft::where('user_id', $user->id)->where('transaction_uuid', $data['transaction_uuid'])->where('status', 'active')->exists(), 409);
            $key = DB::table('form_draft_recovery_keys')->where('user_id', $user->id)->where('slot_hash', $identity['slot_hash'])->where('transaction_uuid', $data['transaction_uuid'])->where('public_id', $data['key_id'])->first();
            abort_unless($key, 404);
            DB::table('form_draft_recovery_keys')->where('id', $key->id)->update(['encrypted_key' => null, 'status' => 'discarded']);
        });
    }

    public function issue(User $user, array $input): array
    {
        $identity = $this->registry->identity($user, $input, true, allowLegacy: filled($input['key_id'] ?? null));
        $data = Validator::make($input, ['transaction_uuid' => 'required|uuid', 'key_id' => 'nullable|uuid', 'key_version' => 'nullable|integer|in:1'])->validate();

        $issue = function () use ($user, $identity, $data, $input) {
            $currentUser = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if ($identity['form_type'] === 'consultation') {
                // Both target authorization and terminal state are rechecked after the guard.
                app(WorkingFacilityService::class)->select($currentUser, $user->workingFacility['key'] ?? null);
                $user = $currentUser;
                $identity = $this->registry->identity($user, $input, true);
                $this->bindClinicalIdentity($data['transaction_uuid'], $user->isRhu() ? 'rhu:'.$user->rural_health_unit_id : 'bhc:'.$user->barangay_health_center_id, $identity['context_key']);
                $this->assertClinicalActive($data['transaction_uuid']);
                $this->authorizeClinical($user, $identity, $data['transaction_uuid']);
            }
            $draft = FormDraft::where('user_id', $user->id)->where('transaction_uuid', $data['transaction_uuid'])->first();
            abort_if($draft && $draft->expires_at->lte(now()), 404);
            abort_if($draft && ($draft->status !== 'active' || $draft->expires_at->lte(now()) || $draft->active_slot !== $identity['slot_hash']), 409);
            $query = DB::table('form_draft_recovery_keys')->where('user_id', $user->id)->where('slot_hash', $identity['slot_hash'])->where('transaction_uuid', $data['transaction_uuid']);
            $key = (clone $query)->first();
            if (isset($data['key_id'])) {
                abort_unless($key && $key->public_id === $data['key_id'], 404);
            }
            if ($key) {
                abort_unless($key->encrypted_key && now()->lt($key->expires_at), 404);
            } else {
                $id = DB::table('form_draft_recovery_keys')->insertGetId(['public_id' => (string) Str::uuid(), 'user_id' => $user->id, 'form_type' => $identity['form_type'], 'scope' => $identity['scope'], 'context_key' => $identity['context_key'], 'slot_hash' => $identity['slot_hash'], 'transaction_uuid' => $data['transaction_uuid'], 'key_version' => 1, 'encrypted_key' => Crypt::encryptString(base64_encode(random_bytes(32))), 'expires_at' => now()->addDays(config('form_drafts.retention_days')), 'created_at' => now(), 'updated_at' => now()]);
                $key = DB::table('form_draft_recovery_keys')->find($id);
            }

            return ['key_id' => $key->public_id, 'key_version' => 1, 'key_material' => Crypt::decryptString($key->encrypted_key), 'expires_at' => Carbon::parse($key->expires_at)->toISOString(), ...$identity, 'transaction_uuid' => $data['transaction_uuid']];
        };

        return $identity['form_type'] === 'consultation'
            ? $this->withClinicalIdentity($data['transaction_uuid'], $issue)
            : DB::transaction($issue);
    }
}
