<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Database\Eloquent\Collection;

class UserNotificationService
{
    public function notifyUser(
        ?User $user,
        string $title,
        string $message,
        string $type,
        ?int $referralId = null,
        ?string $linkUrl = null,
        ?string $entityType = null,
        ?int $entityId = null
    ): void
    {
        if (! $user) {
            return;
        }

        UserNotification::create([
            'user_id' => $user->id,
            'title' => $title,
            'message' => $message,
            'link_url' => $linkUrl,
            'type' => $type,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'related_referral_id' => $referralId,
        ]);
    }

    public function notifyUserOnce(
        ?User $user,
        string $title,
        string $message,
        string $type,
        ?int $referralId = null,
        ?string $linkUrl = null,
        ?string $entityType = null,
        ?int $entityId = null
    ): void {
        if (! $user) {
            return;
        }

        $query = UserNotification::where('user_id', $user->id)->where('type', $type);

        if ($entityType && $entityId) {
            $query->where('entity_type', $entityType)->where('entity_id', $entityId);
        } elseif ($referralId) {
            $query->where('related_referral_id', $referralId);
        } else {
            $query->where('title', $title)->where('message', $message);
        }

        if ($query->exists()) {
            return;
        }

        $this->notifyUser($user, $title, $message, $type, $referralId, $linkUrl, $entityType, $entityId);
    }

    public function notifyUsers(Collection $users, string $title, string $message, string $type, ?int $referralId = null, ?string $linkUrl = null, ?string $entityType = null, ?int $entityId = null): void
    {
        $users->each(fn (User $user) => $this->notifyUser($user, $title, $message, $type, $referralId, $linkUrl, $entityType, $entityId));
    }

    public function notifyUsersOnce(Collection $users, string $title, string $message, string $type, ?int $referralId = null, ?string $linkUrl = null, ?string $entityType = null, ?int $entityId = null): void
    {
        $users->each(fn (User $user) => $this->notifyUserOnce($user, $title, $message, $type, $referralId, $linkUrl, $entityType, $entityId));
    }
}
