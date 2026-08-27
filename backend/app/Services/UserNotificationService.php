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

    /**
     * Decision B4 - the previous exists()-then-create() here was a TOCTOU
     * race: two concurrent callers (e.g. two BHWs at the same BHC loading
     * the app at once) could both pass the exists() check and both insert,
     * producing duplicate notifications. insertOrIgnore against a
     * unique-indexed dedup_key makes the database the single point of
     * enforcement instead.
     */
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

        UserNotification::query()->insertOrIgnore([[
            'user_id' => $user->id,
            'title' => $title,
            'message' => $message,
            'link_url' => $linkUrl,
            'type' => $type,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'related_referral_id' => $referralId,
            'dedup_key' => $this->dedupKey($user->id, $type, $entityType, $entityId, $referralId, $title, $message),
            'created_at' => now(),
            'updated_at' => now(),
        ]]);
    }

    /**
     * Mirrors exactly which fields notifyUserOnce()'s old exists() query
     * matched on, so switching to insertOrIgnore changes only how
     * uniqueness is enforced, not what counts as "the same notification."
     */
    private function dedupKey(
        int $userId,
        string $type,
        ?string $entityType,
        ?int $entityId,
        ?int $referralId,
        string $title,
        string $message
    ): string {
        if ($entityType !== null && $entityId !== null) {
            return "{$userId}:{$type}:{$entityType}:{$entityId}";
        }

        if ($referralId !== null) {
            return "{$userId}:{$type}:referral:{$referralId}";
        }

        return "{$userId}:{$type}:".hash('crc32b', $title.'|'.$message);
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
