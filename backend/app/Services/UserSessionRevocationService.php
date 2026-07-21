<?php

namespace App\Services;

use App\Exceptions\PersistentSessionException;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;

class UserSessionRevocationService
{
    public function expirationMinutes(): int
    {
        return max(1, (int) config('sanctum.expiration', 480));
    }

    public function expiresAt(): CarbonImmutable
    {
        return CarbonImmutable::now()->addMinutes($this->expirationMinutes());
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

        return $this->newSessionPair($user);
    }

    public function rotatePersistentSession(
        ?string $plainTextRefreshToken,
        FacilityAccessService $facilityAccess
    ): array {
        if (! is_string($plainTextRefreshToken) || $plainTextRefreshToken === '') {
            throw new PersistentSessionException;
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

            $absoluteStartedAt = CarbonImmutable::createFromTimestamp(
                (int) explode(':', (string) $token->name, 3)[1]
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
                || ! in_array($user->role, [
                    User::ROLE_ADMIN,
                    User::ROLE_BHW,
                    User::ROLE_RHU_STAFF,
                ], true)
                || ! $facilityAccess->hasValidFacilityAssignment($user)) {
                if ($user instanceof User) {
                    $this->revokeAllTokens($user, 'persistent-session-context-invalid');
                }

                return new PersistentSessionException;
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

    private function newSessionPair(
        User $user,
        ?CarbonImmutable $absoluteStartedAt = null
    ): array {
        $absoluteStartedAt ??= CarbonImmutable::now();
        $access = $this->issueToken($user);
        $refresh = $user->createToken(
            implode(':', [
                'akay-refresh',
                $absoluteStartedAt->getTimestamp(),
                $this->securityContextHash($user),
            ]),
            ['akay:refresh'],
            $absoluteStartedAt->addMinutes(config('auth_persistence.refresh_token_minutes'))
        );

        return [
            'access' => $access,
            'refresh' => $refresh,
        ];
    }

    private function matchesSecurityContext(PersonalAccessToken $token, User $user): bool
    {
        $parts = explode(':', (string) $token->name, 3);

        return count($parts) === 3
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
