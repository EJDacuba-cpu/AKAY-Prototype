<?php

namespace App\Services;

use App\Models\FormDraft;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class FormDraftService
{
    public function __construct(public readonly FormDraftRegistry $registry) {}

    public function status(User $user, array $input): ?array
    {
        $identity = $this->registry->identity($user, $input, allowLegacy: true);
        $data = Validator::make($input, ['transaction_uuid' => 'required|uuid'])->validate();
        $draft = FormDraft::where('user_id', $user->id)->where('scope', $identity['scope'])->where('form_type', $identity['form_type'])->where('mode', $identity['mode'])->where('context_key', $identity['context_key'])->where('transaction_uuid', $data['transaction_uuid'])->first();
        if ($draft) {
            $this->expire($draft);

            return $this->metadata($draft);
        }
        $key = DB::table('form_draft_recovery_keys')->where('user_id', $user->id)->where('slot_hash', $identity['slot_hash'])->where('transaction_uuid', $data['transaction_uuid'])->first();
        if (! $key) {
            return null;
        }

        return [...collect($identity)->except('slot_hash')->all(), 'id' => null, 'transaction_uuid' => $data['transaction_uuid'], 'status' => $key->status === 'active' && now()->gte($key->expires_at) ? 'expired' : $key->status, 'version' => null, 'schema_version' => 1, 'expires_at' => Carbon::parse($key->expires_at)->toISOString()];
    }

    public function lookup(User $user, array $input): ?array
    {
        $identity = $this->registry->identity($user, $input, allowLegacy: true);
        $draft = FormDraft::where('user_id', $user->id)->where('active_slot', $identity['slot_hash'])->first();
        if (! $draft || $this->expire($draft)) {
            return null;
        }

        return $this->metadata($draft);
    }

    public function find(User $user, string $id, bool $lock = false): FormDraft
    {
        $query = FormDraft::where('user_id', $user->id)->where('public_id', $id);
        $draft = ($lock ? $query->lockForUpdate() : $query)->firstOrFail();
        $identity = $this->registry->identity($user, $draft->only(['form_type', 'mode', 'context_key']), allowLegacy: true);
        abort_unless($draft->scope === $identity['scope'], 404);

        return $draft;
    }

    public function detail(User $user, string $id): array
    {
        $draft = $this->find($user, $id);
        abort_if($this->expire($draft) || $draft->status !== 'active', 404);

        return [...$this->metadata($draft), 'payload' => json_decode(Crypt::decryptString($draft->encrypted_payload), true)];
    }

    public function save(User $user, array $input, ?string $id = null): array
    {
        $identity = $this->registry->identity($user, $input);
        $data = Validator::make($input, ['transaction_uuid' => 'required|uuid', 'schema_version' => 'required|integer|in:1', 'payload' => 'present|array', 'base_revision' => 'nullable', 'version' => $id ? 'required|integer|min:1' : 'nullable'])->validate();
        $payload = $this->registry->payload($identity['form_type'], $data['payload']);
        $base = $data['base_revision'] ?? null;
        // Revision metadata is scalar (or a bounded section->integer map), never arbitrary fetched state.
        abort_unless($base === null || is_int($base) || (is_string($base) && strlen($base) <= 100) || (is_array($base) && count($base) <= 20 && collect($base)->every(fn ($value, $key) => is_int($value) && preg_match('/^[a-z_]{1,30}$/D', $key))), 422);
        $hash = $this->hash([$payload, $base]);

        return DB::transaction(function () use ($user, $identity, $data, $payload, $base, $hash, $id) {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if ($id) {
                $draft = $this->find($user, $id, true);
                $this->expire($draft);
                if ($draft->status !== 'active' || $draft->active_slot !== $identity['slot_hash'] || $draft->transaction_uuid !== $data['transaction_uuid'] || $draft->version !== (int) $data['version']) {
                    $this->conflict($draft);
                }
                if (hash_equals($draft->payload_hash, $hash)) {
                    return $this->metadata($draft);
                }
                $draft->version++;
            } else {
                $retiredKey = DB::table('form_draft_recovery_keys')->where('user_id', $user->id)->where('slot_hash', $identity['slot_hash'])->where('transaction_uuid', $data['transaction_uuid'])
                    ->where(fn ($query) => $query->where('status', '!=', 'active')->orWhere('expires_at', '<=', now()))->exists();
                if ($retiredKey) {
                    $this->conflict();
                }
                $prior = FormDraft::where('user_id', $user->id)->where('transaction_uuid', $data['transaction_uuid'])->first();
                if ($prior) {
                    $this->conflict($prior->scope === $identity['scope'] && $prior->context_key === $identity['context_key'] && $prior->form_type === $identity['form_type'] ? $prior : null);
                }
                $active = FormDraft::where('active_slot', $identity['slot_hash'])->first();
                if ($active && ! $this->expire($active)) {
                    $this->conflict($active);
                }
                $draft = new FormDraft([...collect($identity)->except('slot_hash')->all(), 'active_slot' => $identity['slot_hash'], 'user_id' => $user->id, 'public_id' => (string) Str::uuid(), 'transaction_uuid' => $data['transaction_uuid'], 'schema_version' => 1, 'version' => 1, 'status' => 'active']);
            }
            $draft->fill(['encrypted_payload' => Crypt::encryptString(json_encode($payload, JSON_THROW_ON_ERROR)), 'encrypted_base_revision' => Crypt::encryptString(json_encode($base, JSON_THROW_ON_ERROR)), 'payload_hash' => $hash, 'last_saved_at' => now(), 'expires_at' => now()->addDays(config('form_drafts.retention_days'))])->save();

            return $this->metadata($draft);
        });
    }

    public function discard(User $user, string $id, int $version): void
    {
        DB::transaction(function () use ($user, $id, $version) {
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $draft = $this->find($user, $id, true);
            if ($draft->status !== 'active' || $draft->version !== $version) {
                $this->conflict($draft);
            }
            $this->terminate($draft, 'discarded');
        });
    }

    public function terminate(FormDraft $draft, string $status): void
    {
        $draft->fill(['status' => $status, 'active_slot' => null, 'encrypted_payload' => null, 'encrypted_base_revision' => null])->save();
        DB::table('form_draft_recovery_keys')->where('user_id', $draft->user_id)->where('transaction_uuid', $draft->transaction_uuid)->update(['encrypted_key' => null, 'status' => $status]);
    }

    public function expire(FormDraft $draft): bool
    {
        if ($draft->expires_at->lte(now())) {
            // Conditional update cannot discard a newer revision written by another request.
            $expired = FormDraft::whereKey($draft->id)->where('version', $draft->version)->where('expires_at', '<=', now())->where('status', 'active')->update(['status' => 'expired', 'active_slot' => null, 'encrypted_payload' => null, 'encrypted_base_revision' => null]);
            if ($expired) {
                $status = 'expired';
                DB::table('form_draft_recovery_keys')->where('user_id', $draft->user_id)->where('transaction_uuid', $draft->transaction_uuid)->update(['encrypted_key' => null, 'status' => $status]);
            }
            $draft->refresh();

            return $draft->expires_at->lte(now());
        }

        return false;
    }

    public function metadata(FormDraft $draft): array
    {
        return ['id' => $draft->public_id, ...$draft->only(['form_type', 'mode', 'context_key', 'scope', 'transaction_uuid', 'schema_version', 'version', 'status']), 'base_revision' => $draft->encrypted_base_revision ? json_decode(Crypt::decryptString($draft->encrypted_base_revision), true) : null, 'last_saved_at' => $draft->last_saved_at->toISOString(), 'expires_at' => $draft->expires_at->toISOString()];
    }

    public function conflict(?FormDraft $draft = null): never
    {
        throw new HttpResponseException(response()->json(['message' => 'The unfinished form changed or is no longer active. Reload before continuing.', 'code' => 'FORM_DRAFT_CONFLICT', 'data' => $draft ? $this->metadata($draft) : null], 409));
    }

    public function hash(mixed $data): string
    {
        $normalize = function (mixed $value) use (&$normalize): mixed {
            if (! is_array($value)) {
                return $value;
            }
            if (! array_is_list($value)) {
                ksort($value);
            }

            return array_map($normalize, $value);
        };

        return hash_hmac('sha256', json_encode($normalize($data), JSON_THROW_ON_ERROR), config('app.key'));
    }

    public function prune(): void
    {
        FormDraft::where('status', 'active')->where('expires_at', '<=', now())->each(fn ($draft) => $this->expire($draft));
        FormDraft::where('expires_at', '<=', now())->update(['encrypted_result' => null]);
        $status = 'expired';
        DB::table('form_draft_recovery_keys')->where('status', 'active')->where('expires_at', '<=', now())->update(['encrypted_key' => null, 'status' => $status]);
    }
}
