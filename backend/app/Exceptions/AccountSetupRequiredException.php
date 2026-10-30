<?php

namespace App\Exceptions;

use RuntimeException;

class AccountSetupRequiredException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Finish account setup from the invitation sent to your email, or ask the Municipal Health Officer to resend it.');
    }

    public function codeName(): string
    {
        return 'ACCOUNT_SETUP_REQUIRED';
    }

    public function status(): int
    {
        return 403;
    }
}
