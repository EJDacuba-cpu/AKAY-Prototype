<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UserRequest;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\UserNotificationService;
use App\Services\UserSessionRevocationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query()->with(['barangayHealthCenter', 'ruralHealthUnit', 'creator']);

        if ($search = $request->query('search')) {
            $query->where(fn ($q) => $q
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%"));
        }

        if ($role = $request->query('role')) {
            $query->where('role', $role);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        return response()->json(['data' => $query->latest()->paginate($request->integer('per_page', 25))]);
    }

    public function store(UserRequest $request, AuditLogger $auditLogger, UserNotificationService $notifications)
    {
        $data = $request->validated();
        $data['created_by'] = $request->user()->id;
        $data['status'] ??= User::STATUS_ACTIVE;

        $user = User::create($data);

        $notifications->notifyUser($user, 'Account created', 'Your AKAY account has been created.', 'account_created');
        $auditLogger->log($request, 'created', 'users', "Created user {$user->email}.");

        return response()->json(['data' => $user->load(['barangayHealthCenter', 'ruralHealthUnit'])], 201);
    }

    public function show(User $user)
    {
        return response()->json(['data' => $user->load(['barangayHealthCenter', 'ruralHealthUnit', 'creator'])]);
    }

    public function update(
        UserRequest $request,
        User $user,
        AuditLogger $auditLogger,
        UserNotificationService $notifications,
        UserSessionRevocationService $sessions
    ) {
        $data = $request->validated();
        if (($data['password'] ?? null) === null) {
            unset($data['password']);
        }

        $securityContextChanged = array_key_exists('password', $data);
        foreach (['role', 'status', 'barangay_health_center_id', 'rural_health_unit_id'] as $field) {
            if (array_key_exists($field, $data)
                && (string) $user->{$field} !== (string) $data[$field]) {
                $securityContextChanged = true;
            }
        }

        DB::transaction(function () use (
            $request,
            $user,
            $data,
            $securityContextChanged,
            $auditLogger,
            $notifications,
            $sessions
        ): void {
            $previousStatus = $user->status;
            $user->update($data);

            if ($securityContextChanged) {
                $sessions->revokeAllTokens($user, 'account-security-context-changed');
            }

            if ($previousStatus !== $user->status && $user->status === User::STATUS_INACTIVE) {
                $notifications->notifyUser($user, 'Account deactivated', 'Your AKAY account has been deactivated.', 'account_deactivated');
            }

            $auditLogger->log($request, 'updated', 'users', "Updated user {$user->email}.");
        });

        return response()->json(['data' => $user->fresh()->load(['barangayHealthCenter', 'ruralHealthUnit'])]);
    }

    public function destroy(
        Request $request,
        User $user,
        AuditLogger $auditLogger,
        UserSessionRevocationService $sessions
    ) {
        DB::transaction(function () use ($request, $user, $auditLogger, $sessions): void {
            $user->update(['status' => User::STATUS_INACTIVE]);
            $sessions->revokeAllTokens($user, 'account-deactivated');
            $auditLogger->log($request, 'deactivated', 'users', "Deactivated user {$user->email}.");
        });

        return response()->json(['data' => $user->fresh()]);
    }
}
