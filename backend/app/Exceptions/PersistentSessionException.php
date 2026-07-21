<?php

namespace App\Exceptions;

use RuntimeException;

class PersistentSessionException extends RuntimeException
{
    public function __construct(
        private readonly bool $expired = false
    ) {
        parent::__construct($expired
            ? 'Your session has expired. Please sign in again.'
            : 'Your session is no longer valid. Please sign in again.');
    }

    public function codeName(): string
    {
        return $this->expired ? 'SESSION_EXPIRED' : 'SESSION_INVALID';
    }
}
