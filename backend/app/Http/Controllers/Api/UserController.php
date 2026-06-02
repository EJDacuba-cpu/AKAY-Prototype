<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UserRequest;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\UserNotificationService;
use Illuminate\Http\Request;

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

    public function update(UserRequest $request, User $user, AuditLogger $auditLogger, UserNotificationService $notifications)
    {
        $data = $request->validated();
        if (($data['password'] ?? null) === null) {
            unset($data['password']);
        }

        $previousStatus = $user->status;
        $user->update($data);

        if ($previousStatus !== $user->status && $user->status === User::STATUS_INACTIVE) {
            $user->tokens()->delete();
            $notifications->notifyUser($user, 'Account deactivated', 'Your AKAY account has been deactivated.', 'account_deactivated');
        }

        $auditLogger->log($request, 'updated', 'users', "Updated user {$user->email}.");

        return response()->json(['data' => $user->fresh()->load(['barangayHealthCenter', 'ruralHealthUnit'])]);
    }

    public function destroy(Request $request, User $user, AuditLogger $auditLogger)
    {
        $user->update(['status' => User::STATUS_INACTIVE]);
        $user->tokens()->delete();
        $auditLogger->log($request, 'deactivated', 'users', "Deactivated user {$user->email}.");

        return response()->json(['data' => $user->fresh()]);
    }
}
