<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UserRequest;
use App\Models\AccountInvite;
use App\Models\PasswordResetRequest;
use App\Models\User;
use App\Services\AccessRequestStatus;
use App\Services\AccountInviteService;
use App\Services\AuditLogger;
use App\Services\StaffRoles;
use App\Services\UserNotificationService;
use App\Services\UserSessionRevocationService;
use App\Support\AccessRows;
use App\Support\MaskedEmail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query()->with(['barangayHealthCenter', 'ruralHealthUnit', 'creator', 'facilityAssignments.barangayHealthCenter']);

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

    /**
     * Admin: one account's latest invite and its open (not completed, not declined) reset request, in the same row
     * shape the Password & Invites lists use. Account details reads this to show and run the access actions.
     */
    public function access(User $user)
    {
        AccessRequestStatus::expireStaleInvites();
        AccessRequestStatus::expireStaleResetRequests();

        $invite = $user->accountInvite()->with(AccessRows::INVITE_WITH)->first();
        $resetRequest = $user->passwordResetRequests()
            ->whereNotIn('status', [PasswordResetRequest::STATUS_COMPLETED, PasswordResetRequest::STATUS_REJECTED])
            ->with(AccessRows::RESET_WITH)
            ->latest('requested_at')
            ->latest('id')
            ->first();

        return response()->json(['data' => [
            'invite' => $invite ? AccessRows::invite($invite) : null,
            'reset_request' => $resetRequest ? AccessRows::resetRequest($resetRequest) : null,
        ]]);
    }

    /** Lets the account form say "already taken" before saving. Emails are compared without case, as login does. */
    public function emailAvailable(Request $request)
    {
        $validated = $request->validate([
            'email' => ['required', 'string', 'max:255'],
            'ignore' => ['nullable', 'integer'],
        ]);

        $taken = User::query()
            ->whereRaw('lower(email) = ?', [strtolower(trim($validated['email']))])
            ->when(isset($validated['ignore']), fn ($query) => $query->where('id', '!=', $validated['ignore']))
            ->exists();

        return response()->json(['available' => ! $taken]);
    }

    public function store(UserRequest $request, AuditLogger $auditLogger, UserNotificationService $notifications, AccountInviteService $invites)
    {
        $data = $request->validated();
        $data['created_by'] = $request->user()->id;
        $data['status'] ??= User::STATUS_ACTIVE;

        unset($data['facility_assignments'], $data['permissions_confirmed'], $data['password_confirmation']);
        // Nobody knows this password; the person sets their own through the invite link.
        $data['password'] = Str::random(64);
        $user = User::create($data);

        $notifications->notifyUser($user, 'Account created', 'Your AKAY account has been created.', 'account_created');
        $auditLogger->log($request, 'created', 'users', "Created user {$user->email}.".$this->accessAudit($user, []));

        $invite = $invites->issue($user, $request->user());
        $auditLogger->log($request, 'account invite sent', 'users', 'Account invite for '.MaskedEmail::mask($invite->email)." (delivery: {$invite->delivery}).");

        return response()->json([
            'data' => $user->load(['barangayHealthCenter', 'ruralHealthUnit']),
            'invite' => ['delivery' => $invite->delivery],
        ], 201);
    }

    public function show(User $user)
    {
        return response()->json(['data' => $user->load(['barangayHealthCenter', 'ruralHealthUnit', 'creator', 'facilityAssignments.barangayHealthCenter'])]);
    }

    public function update(
        UserRequest $request,
        User $user,
        AuditLogger $auditLogger,
        UserNotificationService $notifications,
        UserSessionRevocationService $sessions,
        AccountInviteService $invites
    ) {
        $data = $request->validated();

        $previousPermissions = $user->permissions ?? [];
        unset($data['permissions_confirmed'], $data['facility_assignments'], $data['password'], $data['password_confirmation']);
        $securityContextChanged = array_key_exists('permissions', $data) || array_key_exists('staff_role', $data);
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
            $sessions,
            $previousPermissions
        ): void {
            $previousStatus = $user->status;
            $user->update($data);

            if ($securityContextChanged) {
                $sessions->revokeAllTokens($user, 'account-security-context-changed');
            }

            if ($previousStatus !== $user->status && $user->status === User::STATUS_INACTIVE) {
                $notifications->notifyUser($user, 'Account deactivated', 'Your AKAY account has been deactivated.', 'account_deactivated');
            }

            $auditLogger->log($request, 'updated', 'users', "Updated user {$user->email}.".$this->accessAudit($user, $previousPermissions));
        });

        $this->followEmailChange($user, $invites);

        return response()->json(['data' => $user->fresh()->load(['barangayHealthCenter', 'ruralHealthUnit', 'facilityAssignments.barangayHealthCenter'])]);
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

    /**
     * A new email on an account whose invite is still open: the old link stops working and a fresh one goes to the
     * new address (the same as Edit email on Password & Invites). An inactive account gets no email; its old link is
     * only retired, and the MHO can resend after reactivating.
     */
    private function followEmailChange(User $user, AccountInviteService $invites): void
    {
        if (! $user->wasChanged('email')) {
            return;
        }

        $invite = $user->accountInvite()->first();
        if (! $invite || $invite->status === AccountInvite::STATUS_COMPLETED) {
            return;
        }

        if ($user->isActive()) {
            $invites->resend($invite);

            return;
        }

        $invite->forceFill([
            'email' => $user->email,
            'token_hash' => null,
            'status' => $invite->status === AccountInvite::STATUS_TEMPORARY ? $invite->status : AccountInvite::STATUS_EXPIRED,
        ])->save();
    }

    /** Audit wording for duties added or removed, and for licensed duties held by a non-licensed role. */
    private function accessAudit(User $user, array $previous): string
    {
        $current = $user->permissions ?? [];
        $parts = [];
        if ($added = array_values(array_diff($current, $previous))) {
            $parts[] = 'Permissions added: '.implode(', ', $added).'.';
        }
        if ($removed = array_values(array_diff($previous, $current))) {
            $parts[] = 'Permissions removed: '.implode(', ', $removed).'.';
        }
        if ($user->staff_role && $licensed = StaffRoles::licensedGrants($user->staff_role, $current)) {
            $parts[] = 'Licensed duties granted to a non-licensed role ('.StaffRoles::label($user->staff_role).'): '.implode(', ', $licensed).'.';
        }

        return $parts ? ' '.implode(' ', $parts) : '';
    }
}
