<?php

namespace App\Http\Middleware;

use App\Services\AccountActivationService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountIsActivated
{
    private const ALLOWED_PATHS = [
        'api/auth/logout',
    ];

    public function __construct(
        private readonly AccountActivationService $activation,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $this->activation->isActivated($user) && ! $request->is(self::ALLOWED_PATHS)) {
            return response()->json([
                'message' => 'Finish account setup from the invitation sent to your email, or ask the Municipal Health Officer to resend it.',
                'code' => 'ACCOUNT_SETUP_REQUIRED',
            ], 403);
        }

        return $next($request);
    }
}
