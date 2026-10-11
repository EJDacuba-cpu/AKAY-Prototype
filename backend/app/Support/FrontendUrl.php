<?php

namespace App\Support;

/** Builds links into the web app, so invites and password resets share one base URL. */
class FrontendUrl
{
    public static function to(string $path): string
    {
        return rtrim((string) env('FRONTEND_URL', env('APP_FRONTEND_URL', 'http://localhost:5173')), '/').$path;
    }
}
