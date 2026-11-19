<?php

namespace App\Exceptions;

use PDOException;

class DraftDatabaseConnectionFailure
{
    public static function matches(\Throwable $exception): bool
    {
        if (! $exception instanceof PDOException) {
            return false;
        }

        $state = (string) ($exception->errorInfo[0] ?? $exception->getCode());

        return preg_match('/^08[A-Z0-9]{3}$/', $state) === 1;
    }
}
