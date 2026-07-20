<?php

namespace App\Services;

use App\Models\Referral;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;

class ReferralQrService
{
    public const PAYLOAD_PREFIX = 'AKAY-REFERRAL:v1:';
    public const TOKEN_PATTERN = '/^[A-Za-z0-9_-]{43}$/D';

    public function issue(Referral $referral): string
    {
        $token = $this->generateToken();

        $referral->update([
            'qr_token_hash' => $this->hash($token),
            'qr_token_encrypted' => Crypt::encryptString($token),
            'qr_token_issued_at' => now(),
            'qr_token_last_used_at' => null,
        ]);

        return $token;
    }

    public function tokenForDisplay(Referral $referral): array
    {
        $token = $this->decryptStoredToken($referral);
        if ($token !== null) {
            return ['token' => $token, 'created' => false];
        }

        return ['token' => $this->issue($referral), 'created' => true];
    }

    public function payload(string $token): string
    {
        return self::PAYLOAD_PREFIX.$token;
    }

    public function isValidTokenFormat(mixed $token): bool
    {
        return is_string($token) && preg_match(self::TOKEN_PATTERN, $token) === 1;
    }

    public function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    private function generateToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    private function decryptStoredToken(Referral $referral): ?string
    {
        if (! $referral->qr_token_hash || ! $referral->qr_token_encrypted) {
            return null;
        }

        try {
            $token = Crypt::decryptString($referral->qr_token_encrypted);
        } catch (DecryptException) {
            return null;
        }

        if (
            ! $this->isValidTokenFormat($token)
            || ! hash_equals((string) $referral->qr_token_hash, $this->hash($token))
        ) {
            return null;
        }

        return $token;
    }
}
