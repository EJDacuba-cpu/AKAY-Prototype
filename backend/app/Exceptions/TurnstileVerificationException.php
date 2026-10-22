<?php

namespace App\Exceptions;

use RuntimeException;

class TurnstileVerificationException extends RuntimeException
{
    public const CODE_FAILED = 'CAPTCHA_FAILED';

    public const CODE_UNAVAILABLE = 'CAPTCHA_UNAVAILABLE';

    public function __construct(
        string $message,
        private readonly string $codeName,
        private readonly int $status = 422,
    ) {
        parent::__construct($message);
    }

    public static function failed(?string $message = null): self
    {
        return new self(
            $message ?: 'Bot verification failed. Refresh the check and try again.',
            self::CODE_FAILED,
            422,
        );
    }

    public static function unavailable(): self
    {
        return new self(
            'Bot protection is temporarily unavailable. Please try again in a moment.',
            self::CODE_UNAVAILABLE,
            503,
        );
    }

    public function codeName(): string
    {
        return $this->codeName;
    }

    public function status(): int
    {
        return $this->status;
    }
}
