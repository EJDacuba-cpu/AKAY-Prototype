<?php

namespace App\Http\Middleware;

use App\Services\FacilityAccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureValidFacilityAssignment
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        abort_unless($user, 401);
        $this->facilityAccess->ensureValidFacilityAssignment($user);

        return $next($request);
    }
}
