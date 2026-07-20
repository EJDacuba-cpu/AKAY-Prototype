<?php

namespace App\Services;

use App\Models\User;
use Carbon\CarbonImmutable;
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

        return $user->createToken($name, ['*'], $this->expiresAt());
    }

    public function revokeCurrentToken(User $user): bool
    {
        $token = $user->currentAccessToken();

        return $token instanceof PersonalAccessToken
            ? (bool) $token->delete()
            : false;
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
}
