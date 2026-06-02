<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Database\Eloquent\Collection;

class UserNotificationService
{
    public function notifyUser(?User $user, string $title, string $message, string $type, ?int $referralId = null): void
    {
        if (! $user) {
            return;
        }

        UserNotification::create([
            'user_id' => $user->id,
            'title' => $title,
            'message' => $message,
            'type' => $type,
            'related_referral_id' => $referralId,
        ]);
    }

    public function notifyUsers(Collection $users, string $title, string $message, string $type, ?int $referralId = null): void
    {
        $users->each(fn (User $user) => $this->notifyUser($user, $title, $message, $type, $referralId));
    }
}
