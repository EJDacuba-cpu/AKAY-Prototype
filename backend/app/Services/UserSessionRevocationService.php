<?php

namespace App\Services;

use App\Exceptions\PersistentSessionException;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;

class UserSessionRevocationService
{
    public const SESSION_REPLACED_MESSAGE = PersistentSessionException::MESSAGE_REPLACED;

    public function expirationMinutes(): int
    {
        return max(1, (int) config('sanctum.expiration', 480));
    }

    public function issueToken(User $user, string $name = 'akay-api'): NewAccessToken
    {
        $this->revokeExpiredTokens($user);

        return $user->createToken(
            $name,
            ['akay:access'],
            now()->addMinutes(config('auth_persistence.access_token_minutes'))
        );
    }

    public function issuePersistentSession(User $user): array
    {
        $this->revokeExpiredTokens($user);

        $sessionId = (string) Str::uuid();

        // Remember prior token hashes so Device A's next request can return SESSION_REPLACED
        // after First-In Kicked Out deletes the rows.
        $this->markExistingTokensReplaced($user);
        $this->revokeAllTokens($user, 'single-session-login');

        $user->forceFill(['active_session_id' => $sessionId])->save();

        return $this->newSessionPair($user);
    }

    public function rotatePersistentSession(
        ?string $plainTextRefreshToken,
        FacilityAccessService $facilityAccess
    ): array {
        if (! is_string($plainTextRefreshToken) || $plainTextRefreshToken === '') {
            throw new PersistentSessionException;
        }

        if ($this->isReplacedSessionToken($plainTextRefreshToken)) {
            throw PersistentSessionException::replaced();
        }

        $result = DB::transaction(function () use ($plainTextRefreshToken, $facilityAccess): array|PersistentSessionException {
            [$tokenId, $tokenSecret] = array_pad(
                explode('|', $plainTextRefreshToken, 2),
                2,
                null
            );
            if (! ctype_digit((string) $tokenId) || ! is_string($tokenSecret)) {
                throw new PersistentSessionException;
            }

            $token = PersonalAccessToken::query()->lockForUpdate()->find((int) $tokenId);
            if (! $token
                || ! hash_equals($token->token, hash('sha256', $tokenSecret))
                || ! $token->can('akay:refresh')
                || ! str_starts_with((string) $token->name, 'akay-refresh:')) {
                throw new PersistentSessionException;
            }

            // The app timezone is not optional here. Carbon 3 returns UTC from a
            // bare createFromTimestamp(), while every stored datetime is written
            // and re-read as a naive string in config('app.timezone'). Under a
            // non-UTC timezone the reconstructed start would land one UTC offset
            // early, so the rotated refresh token inherited a deadline that had
            // already passed - the session died on its first rotation.
            $nameParts = $this->refreshTokenNameParts($token);
            $absoluteStartedAt = CarbonImmutable::createFromTimestamp(
                (int) ($nameParts[1] ?? 0),
                config('app.timezone')
            );

            $expired = $token->expires_at?->isPast() !== false
                || ($token->last_used_at ?? $token->created_at)?->lte(
                    now()->subMinutes(config('auth_persistence.refresh_idle_minutes'))
                );
            if ($expired) {
                $token->delete();

                return new PersistentSessionException(true);
            }

            $user = $token->tokenable;
            if (! $user instanceof User
                || ! $this->matchesSecurityContext($token, $user)
                || ! $user->isActive()
                || ! app(AccountActivationService::class)->isActivated($user)
                || ! in_array($user->role, [
                    User::ROLE_ADMIN,
                    User::ROLE_BHC,
                    User::ROLE_RHU,
                ], true)
                || (! $user->isAdmin() && app(WorkingFacilityService::class)->available($user) === [])) {
                if ($user instanceof User) {
                    $this->revokeAllTokens($user, 'persistent-session-context-invalid');
                }

                return new PersistentSessionException;
            }

            if (! $this->tokenMatchesActiveSession($token, $user)) {
                $token->delete();

                return PersistentSessionException::replaced();
            }

            $token->delete();

            return $this->newSessionPair($user, $absoluteStartedAt);
        });

        if ($result instanceof PersistentSessionException) {
            throw $result;
        }

        return $result;
    }

    public function revokeCurrentToken(User $user): bool
    {
        $token = $user->currentAccessToken();

        return $token instanceof PersonalAccessToken
            ? (bool) $token->delete()
            : false;
    }

    public function revokePresentedRefreshToken(User $user, ?string $plainTextToken): bool
    {
        if (! is_string($plainTextToken) || $plainTextToken === '') {
            return false;
        }

        $token = PersonalAccessToken::findToken($plainTextToken);
        if (! $token
            || ! $token->can('akay:refresh')
            || (int) $token->tokenable_id !== (int) $user->getKey()
            || $token->tokenable_type !== $user->getMorphClass()) {
            return false;
        }

        return (bool) $token->delete();
    }

    public function revokeAllTokens(User $user, string $reason): int
    {
        $revokedCount = $user->tokens()->delete();

        if ($revokedCount > 0) {
            Log::info('Authentication sessions revoked.', [
                'user_id' => $user->getKey(),
                'reason' => $reason,
                'revoked_count' => $revokedCount,
            ]);
        }

        return $revokedCount;
    }

    public function revokeExpiredTokens(User $user): int
    {
        $createdBefore = now()->subMinutes($this->expirationMinutes());

        return $user->tokens()
            ->where(function ($query) use ($createdBefore): void {
                $query->where('expires_at', '<=', now())
                    ->orWhere(function ($legacy) use ($createdBefore): void {
                        $legacy->whereNull('expires_at')
                            ->where('created_at', '<=', $createdBefore);
                    });
            })
            ->delete();
    }

    public function isExpired(PersonalAccessToken $token): bool
    {
        if ($token->expires_at?->isPast()) {
            return true;
        }

        return $token->created_at === null
            || $token->created_at->lte(now()->subMinutes($this->expirationMinutes()));
    }

    public function isReplacedSessionToken(?string $plainTextToken): bool
    {
        if (! is_string($plainTextToken) || $plainTextToken === '') {
            return false;
        }

        return Cache::has($this->replacedSessionTokenCacheKey($this->hashPlainTextToken($plainTextToken)));
    }

    public function tokenMatchesActiveSession(PersonalAccessToken $token, User $user): bool
    {
        $activeSessionId = $user->active_session_id;
        if (! is_string($activeSessionId) || $activeSessionId === '') {
            return true;
        }

        $tokenSessionId = $this->tokenSessionId($token);

        return is_string($tokenSessionId)
            && $tokenSessionId !== ''
            && hash_equals($activeSessionId, $tokenSessionId);
    }

    public function tokenSessionId(PersonalAccessToken $token): ?string
    {
        $name = (string) $token->name;

        if (str_starts_with($name, 'akay-access:')) {
            $sessionId = substr($name, strlen('akay-access:'));

            return $sessionId !== '' ? $sessionId : null;
        }

        if (str_starts_with($name, 'akay-refresh:')) {
            $parts = $this->refreshTokenNameParts($token);

            return isset($parts[3]) && $parts[3] !== '' ? $parts[3] : null;
        }

        return null;
    }

    private function markExistingTokensReplaced(User $user): void
    {
        $ttlMinutes = max(
            (int) config('auth_persistence.refresh_token_minutes', 480),
            (int) config('auth_persistence.access_token_minutes', 15),
            60
        );

        foreach ($user->tokens()->cursor() as $token) {
            Cache::put(
                $this->replacedSessionTokenCacheKey($token->token),
                true,
                now()->addMinutes($ttlMinutes)
            );
        }
    }

    private function replacedSessionTokenCacheKey(string $tokenHash): string
    {
        return 'akay:session-replaced:'.$tokenHash;
    }

    private function hashPlainTextToken(string $plainTextToken): string
    {
        if (! str_contains($plainTextToken, '|')) {
            return hash('sha256', $plainTextToken);
        }

        [, $secret] = array_pad(explode('|', $plainTextToken, 2), 2, '');

        return hash('sha256', (string) $secret);
    }

    private function newSessionPair(
        User $user,
        ?CarbonImmutable $absoluteStartedAt = null
    ): array {
        $absoluteStartedAt ??= CarbonImmutable::now();
        $sessionId = (string) ($user->active_session_id ?? '');
        // Legacy sessions created before single-session enforcement get an id on
        // their next successful refresh without treating that rotation as a kick.
        if ($sessionId === '') {
            $sessionId = (string) Str::uuid();
            $user->forceFill(['active_session_id' => $sessionId])->save();
        }

        $access = $user->createToken(
            'akay-access:'.$sessionId,
            ['akay:access'],
            now()->addMinutes(config('auth_persistence.access_token_minutes'))
        );
        $refresh = $user->createToken(
            implode(':', [
                'akay-refresh',
                $absoluteStartedAt->getTimestamp(),
                $this->securityContextHash($user),
                $sessionId,
            ]),
            ['akay:refresh'],
            $absoluteStartedAt->addMinutes(config('auth_persistence.refresh_token_minutes'))
        );

        return [
            'access' => $access,
            'refresh' => $refresh,
        ];
    }

    private function refreshTokenNameParts(PersonalAccessToken $token): array
    {
        return explode(':', (string) $token->name, 4);
    }

    private function matchesSecurityContext(PersonalAccessToken $token, User $user): bool
    {
        $parts = $this->refreshTokenNameParts($token);

        return count($parts) >= 3
            && ($parts[0] ?? '') === 'akay-refresh'
            && hash_equals($parts[2], $this->securityContextHash($user));
    }

    private function securityContextHash(User $user): string
    {
        return hash('sha256', implode('|', [
            $user->role,
            $user->barangay_health_center_id ?? '',
            $user->rural_health_unit_id ?? '',
            $user->getAuthPassword(),
        ]));
    }
}
