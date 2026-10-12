<?php

namespace App\Support;

use App\Models\AccountInvite;
use App\Models\PasswordResetRequest;
use App\Services\AccessRequestStatus;

/**
 * The row arrays the admin UI reads for invites and password reset requests. The Password & Invites lists and the
 * account access endpoint both build rows here, so the shape cannot drift between them.
 */
class AccessRows
{
    public const INVITE_WITH = ['user.barangayHealthCenter', 'user.ruralHealthUnit'];

    public const RESET_WITH = ['user.barangayHealthCenter', 'user.ruralHealthUnit', 'approver', 'rejecter'];

    public static function invite(AccountInvite $invite): array
    {
        $user = $invite->user;
        $facility = $user?->barangayHealthCenter?->name
            ?: $user?->ruralHealthUnit?->name
            ?: 'No facility assigned';

        return [
            'id' => $invite->id,
            'email' => $user?->email ?? $invite->email,
            'status' => $invite->status,
            'display_status' => AccessRequestStatus::forInvite($invite),
            'delivery' => $invite->delivery,
            'completed_via' => $invite->completed_via,
            'sent_at' => $invite->sent_at,
            'expires_at' => $invite->expires_at,
            'completed_at' => $invite->completed_at,
            'temp_password_expires_at' => $user?->temp_password_expires_at,
            'user' => $user ? [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'staff_role' => $user->staff_role,
                'status' => $user->status,
                'facility' => $facility,
            ] : null,
        ];
    }

    public static function resetRequest(PasswordResetRequest $resetRequest): array
    {
        $user = $resetRequest->user;
        $facility = $user?->barangayHealthCenter?->name
            ?: $user?->ruralHealthUnit?->name
            ?: 'No facility assigned';

        return [
            'id' => $resetRequest->id,
            'email' => $resetRequest->email,
            'status' => $resetRequest->status,
            'display_status' => AccessRequestStatus::forResetRequest($resetRequest),
            'delivery' => $resetRequest->delivery,
            'completed_via' => $resetRequest->completed_via,
            'requested_at' => $resetRequest->requested_at,
            'approved_at' => $resetRequest->approved_at,
            'rejected_at' => $resetRequest->rejected_at,
            'completed_at' => $resetRequest->completed_at,
            'expires_at' => $resetRequest->expires_at,
            'admin_note' => $resetRequest->admin_note,
            'user' => $user ? [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'staff_role' => $user->staff_role,
                'status' => $user->status,
                'facility' => $facility,
            ] : null,
            'approved_by' => $resetRequest->approver?->name,
            'rejected_by' => $resetRequest->rejecter?->name,
        ];
    }
}
