<?php

namespace App\Services;

use App\Models\User;
use Closure;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\Response;

/** Explicitly called by a final mutation owner; never infers actions from request bodies. */
class FormDraftCommit
{
    public function __construct(private readonly FormDraftService $drafts) {}

    public function metadata(Request $request): ?array
    {
        $headers = ['id' => $request->header('X-Form-Draft-Id'), 'version' => $request->header('X-Form-Draft-Version'), 'transaction_uuid' => $request->header('X-Form-Draft-Transaction')];
        if (collect($headers)->every(fn ($value) => $value === null)) {
            return null;
        }

        return Validator::make($headers, ['id' => 'required|uuid', 'version' => 'required|integer|min:1', 'transaction_uuid' => 'required|uuid'])->validate();
    }

    /**
     * $authorize rechecks current domain access on both original requests and replays.
     * $mutation retains existing validation, permissions, domain transaction and confirmation.
     * All durable side effects must use the same DB connection or an after-commit outbox.
     */
    public function run(Request $request, string $formType, string $mode, string $contextKey, array $mutationPayload, Closure $mutation, Closure $authorize): Response
    {
        $metadata = $this->metadata($request);
        if ($metadata === null) {
            $authorize();

            return $mutation();
        }

        return DB::transaction(function () use ($request, $formType, $mode, $contextKey, $mutationPayload, $mutation, $authorize, $metadata) {
            $user = $request->user();
            User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $identity = $this->drafts->registry->identity($user, ['form_type' => $formType, 'mode' => $mode, 'context_key' => $contextKey], allowLegacy: true);
            $draft = $this->drafts->find($user, $metadata['id'], true);
            $authorize();
            if ($draft->form_type !== $formType || $draft->mode !== $mode || $draft->context_key !== $contextKey || $draft->scope !== $identity['scope'] || $draft->transaction_uuid !== $metadata['transaction_uuid'] || $draft->version !== (int) $metadata['version']) {
                $this->drafts->conflict();
            }
            $hash = $this->drafts->hash([$formType, $mode, $contextKey, $mutationPayload]);
            if ($draft->status === 'consumed') {
                if (! $draft->commit_hash || ! hash_equals($draft->commit_hash, $hash) || ! $draft->encrypted_result || $draft->expires_at->lte(now())) {
                    $this->drafts->conflict($draft);
                }

                return response(Crypt::decryptString($draft->encrypted_result), $draft->result_status, ['Content-Type' => 'application/json', 'Cache-Control' => 'no-store, private']);
            }
            if ($draft->status !== 'active' || $draft->expires_at->lte(now())) {
                $this->drafts->conflict($draft);
            }
            $response = $mutation();
            if (! $response instanceof Response || $response->getStatusCode() >= 300) {
                throw new HttpResponseException($response);
            }
            $draft->fill(['commit_hash' => $hash, 'encrypted_result' => Crypt::encryptString($response->getContent()), 'result_status' => $response->getStatusCode(), 'expires_at' => now()->addDays(config('form_drafts.retention_days'))]);
            $this->drafts->terminate($draft, 'consumed');

            return $response;
        });
    }
}
