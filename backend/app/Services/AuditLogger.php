<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class AuditLogger
{
    public function log(Request $request, string $action, string $module, ?string $description = null, ?User $actor = null): void
    {
        $actor ??= $request->user();
        try {
            AuditLog::create([
                'user_id' => $actor?->id,
                'action' => $action,
                'module' => $module,
                'description' => $description,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        } catch (Throwable $exception) {
            // Do not include SQL bindings, descriptions, credentials or request payloads.
            Log::error('Audit record could not be persisted.', [
                'action' => $action, 'module' => $module,
                'actor_id' => $actor?->id, 'exception_type' => $exception::class,
            ]);
            throw $exception;
        }
    }
}
