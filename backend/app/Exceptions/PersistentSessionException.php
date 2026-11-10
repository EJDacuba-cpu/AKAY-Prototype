<?php

namespace App\Exceptions;

use RuntimeException;

class PersistentSessionException extends RuntimeException
{
    public const MESSAGE_REPLACED = 'You have been signed out because your account was logged in on another device.';

    public function __construct(
        private readonly bool $expired = false,
        private readonly bool $replaced = false,
    ) {
        parent::__construct(match (true) {
            $replaced => self::MESSAGE_REPLACED,
            $expired => 'Your session has expired. Please sign in again.',
            default => 'Your session is no longer valid. Please sign in again.',
        });
    }

    public static function replaced(): self
    {
        return new self(replaced: true);
    }

    public function codeName(): string
    {
        return match (true) {
            $this->replaced => 'SESSION_REPLACED',
            $this->expired => 'SESSION_EXPIRED',
            default => 'SESSION_INVALID',
        };
    }

    public function wasReplaced(): bool
    {
        return $this->replaced;
    }
}
