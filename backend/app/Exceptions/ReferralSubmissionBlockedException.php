<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * DOC-14 / URG-05 - referral submission is blocked because the receiving RHU
 * has no available provider, or because the chosen preference is not a valid
 * provider of that RHU.
 *
 * This is an unconditional block. No acknowledgment flag can bypass it, and it
 * applies identically to Routine and Priority referrals (URG-05).
 */
class ReferralSubmissionBlockedException extends RuntimeException
{
    public const NO_PROVIDER_AVAILABLE = 'NO_PROVIDER_AVAILABLE';
    public const PREFERRED_PROVIDER_INVALID = 'PREFERRED_PROVIDER_INVALID';

    public function __construct(
        string $message,
        public readonly string $blockCode
    ) {
        parent::__construct($message);
    }

    public static function noProviderAvailable(): self
    {
        return new self(
            'The receiving Rural Health Unit has no available provider, so this referral cannot be submitted right now.',
            self::NO_PROVIDER_AVAILABLE
        );
    }

    public static function preferredProviderInvalid(): self
    {
        return new self(
            'The selected provider is not an active provider of the receiving Rural Health Unit.',
            self::PREFERRED_PROVIDER_INVALID
        );
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => $this->blockCode,
        ], 422);
    }
}
