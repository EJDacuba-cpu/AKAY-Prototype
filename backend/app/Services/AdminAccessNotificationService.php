<?php

namespace App\Services;

use App\Models\AccountInvite;
use App\Models\PasswordResetRequest;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Database\Eloquent\Builder;

/** Event-only producers. Reading a page must never call these methods. */
class AdminAccessNotificationService
{
    public function __construct(private readonly UserNotificationService $notifications) {}

    public function resetRequested(PasswordResetRequest $reset): void
    {
        $this->notify($reset, 'password_reset_request', 'password_reset_request',
            'Password reset requested', "Password reset requested by {$reset->user->name}.",
            '/admin/password-reset-requests');
    }

    public function resetDeliveryChanged(PasswordResetRequest $reset, bool $wasFailed): void
    {
        if ($reset->delivery !== PasswordResetRequest::DELIVERY_FAILED) {
            $this->resolve('password_reset_request', 'password_reset_request', [$reset->id]);

            return;
        }

        $this->notify($reset, 'password_reset_request', 'password_reset_request',
            'Password reset requested', 'Reset approved, but the email was not sent. Resend it or copy the reset link.',
            '/admin/password-reset-requests', ! $wasFailed);
    }

    public function inviteDeliveryChanged(AccountInvite $invite, bool $wasFailed): void
    {
        if ($invite->delivery !== AccountInvite::DELIVERY_FAILED) {
            $this->resolve('account_invite_delivery_failed', 'account_invite', [$invite->id]);

            return;
        }

        if (! $invite->user?->isActive() || $invite->status === AccountInvite::STATUS_COMPLETED) {
            return;
        }

        $this->notify($invite, 'account_invite_delivery_failed', 'account_invite',
            'Invitation email not sent', "The invitation for {$invite->user->name} could not be sent. Resend it, or correct the email in Users.",
            '/admin/account-invites', ! $wasFailed);
    }

    public function resetResolved(PasswordResetRequest $reset): void
    {
        $this->resolve('password_reset_request', 'password_reset_request', [$reset->id]);
    }

    public function accountDeactivated(User $user, User $actor): void
    {
        // Ineligible requests are closed, so reactivation cannot reuse an old
        // approved token or a pending request whose alerts were already resolved.
        foreach ($user->passwordResetRequests()->whereIn('status', [
            PasswordResetRequest::STATUS_PENDING,
            PasswordResetRequest::STATUS_APPROVED,
            PasswordResetRequest::STATUS_EXPIRED,
        ])->get() as $reset) {
            $reset->update([
                'status' => PasswordResetRequest::STATUS_REJECTED,
                'rejected_by' => $actor->id,
                'rejected_at' => now(),
                'reset_token_hash' => null,
                'expires_at' => null,
                'admin_note' => trim(($reset->admin_note ? $reset->admin_note."\n" : '').'Automatically closed when the account was deactivated.'),
            ]);
        }
        $this->resolveForUser($user);
    }

    public function accountReactivated(User $user): void
    {
        $invite = $user->accountInvite()->whereIn('status', [AccountInvite::STATUS_PENDING, AccountInvite::STATUS_EXPIRED])
            ->where('delivery', AccountInvite::DELIVERY_FAILED)->first();
        if ($invite) {
            $invite->setRelation('user', $user);
            $this->inviteDeliveryChanged($invite, false);
        }
    }

    public function resolveForUser(User $user, bool $includeInvite = true): void
    {
        $this->resolve('password_reset_request', 'password_reset_request', $user->passwordResetRequests()->pluck('id')->all());
        if ($includeInvite) {
            $this->resolve('account_invite_delivery_failed', 'account_invite', $user->accountInvite()->pluck('id')->all());
        }
    }

    private function resolve(string $type, string $entityType, array $ids): void
    {
        $this->alerts($type, $entityType, $ids)->whereNull('cleared_at')
            ->update(['is_read' => true, 'cleared_at' => now()]);
    }

    private function alerts(string $type, string $entityType, array $ids): Builder
    {
        return UserNotification::query()->where('type', $type)->where('entity_type', $entityType)->whereIn('entity_id', $ids);
    }

    private function notify(
        AccountInvite|PasswordResetRequest $entity,
        string $type,
        string $entityType,
        string $title,
        string $message,
        string $link,
        bool $reopen = false,
    ): void {
        $admins = User::where('role', User::ROLE_ADMIN)->where('status', User::STATUS_ACTIVE)->get();
        $this->notifications->notifyUsersOnce($admins, $title, $message, $type, null, $link, $entityType, $entity->id);

        $attributes = ['message' => $message];
        if ($reopen) {
            // A new failure after successful delivery is a new actionable episode.
            // Repeated failures leave the user's read/trash/clear choice intact.
            $attributes += ['is_read' => false, 'cleared_at' => null, 'trashed_at' => null, 'created_at' => now()];
        }
        $this->alerts($type, $entityType, [$entity->id])->whereIn('user_id', $admins->modelKeys())->update($attributes);
    }
}
