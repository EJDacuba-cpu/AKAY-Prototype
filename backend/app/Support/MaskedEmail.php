<?php

namespace App\Support;

use Illuminate\Support\Str;

/** Hides most of an email address so logs can name a recipient without exposing it. */
class MaskedEmail
{
    public static function mask(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
        $maskedLocal = $local === ''
            ? '***'
            : Str::substr($local, 0, 1).str_repeat('*', max(2, Str::length($local) - 1));

        return $domain ? "{$maskedLocal}@{$domain}" : $maskedLocal;
    }
}
