<?php

namespace App\Services;

use App\Models\AccountInvite;
use App\Models\PasswordResetRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * One vocabulary for Password & Invites (spec F1/F2): Pending, In progress, Complete, Cancelled.
 *
 * The status is computed from stored values and never stored itself. "Cancelled" in particular is
 * "the account is inactive and the item was not completed" (or a declined reset request), so every
 * other filter excludes those rows.
 */
class AccessRequestStatus
{
    public const PENDING = 'pending';

    public const IN_PROGRESS = 'in_progress';

    public const COMPLETE = 'complete';

    public const CANCELLED = 'cancelled';

    public const ALL = [self::PENDING, self::IN_PROGRESS, self::COMPLETE, self::CANCELLED];

    /** Marks links that ran out as expired, so filters and counts are right without a scheduler. */
    public static function expireStaleInvites(): void
    {
        AccountInvite::query()
            ->where('status', AccountInvite::STATUS_PENDING)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update([
                'status' => AccountInvite::STATUS_EXPIRED,
                'token_hash' => null,
            ]);
    }

    public static function expireStaleResetRequests(): void
    {
        PasswordResetRequest::query()
            ->where('status', PasswordResetRequest::STATUS_APPROVED)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update([
                'status' => PasswordResetRequest::STATUS_EXPIRED,
                'reset_token_hash' => null,
            ]);
    }

    /** Unknown status values leave the query unfiltered. */
    public static function applyToInvites(Builder $query, string $status): void
    {
        $active = fn (Builder $user) => $user->where('status', User::STATUS_ACTIVE);

        match ($status) {
            self::PENDING => $query->whereHas('user', $active)->where(function (Builder $q): void {
                $q->where('status', AccountInvite::STATUS_EXPIRED)
                    ->orWhere(fn (Builder $q) => $q
                        ->where('status', AccountInvite::STATUS_PENDING)
                        ->where('delivery', AccountInvite::DELIVERY_FAILED))
                    // A temporary password with no expiry cannot sign in (login treats it as expired), so it is too.
                    ->orWhere(fn (Builder $q) => $q
                        ->where('status', AccountInvite::STATUS_TEMPORARY)
                        ->whereHas('user', fn (Builder $user) => $user->where(
                            fn (Builder $w) => $w->whereNull('temp_password_expires_at')->orWhere('temp_password_expires_at', '<=', now())
                        )));
            }),
            self::IN_PROGRESS => $query->whereHas('user', $active)->where(function (Builder $q): void {
                $q->where(fn (Builder $q) => $q
                    ->where('status', AccountInvite::STATUS_PENDING)
                    ->where(fn (Builder $d) => self::deliveryNotFailed($d, AccountInvite::DELIVERY_FAILED)))
                    ->orWhere(fn (Builder $q) => $q
                        ->where('status', AccountInvite::STATUS_TEMPORARY)
                        ->whereHas('user', fn (Builder $user) => $user->where('temp_password_expires_at', '>', now())));
            }),
            self::COMPLETE => $query->where('status', AccountInvite::STATUS_COMPLETED),
            self::CANCELLED => $query
                ->where('status', '!=', AccountInvite::STATUS_COMPLETED)
                ->whereDoesntHave('user', $active),
            default => null,
        };
    }

    /** Unknown status values leave the query unfiltered. */
    public static function applyToResetRequests(Builder $query, string $status): void
    {
        $active = fn (Builder $user) => $user->where('status', User::STATUS_ACTIVE);

        match ($status) {
            self::PENDING => $query->whereHas('user', $active)->where(function (Builder $q): void {
                $q->where('status', PasswordResetRequest::STATUS_PENDING)
                    ->orWhere('status', PasswordResetRequest::STATUS_EXPIRED)
                    ->orWhere(fn (Builder $q) => $q
                        ->where('status', PasswordResetRequest::STATUS_APPROVED)
                        ->where('delivery', PasswordResetRequest::DELIVERY_FAILED));
            }),
            // Approved before delivery was recorded (delivery NULL) counts as sent.
            self::IN_PROGRESS => $query->whereHas('user', $active)
                ->where('status', PasswordResetRequest::STATUS_APPROVED)
                ->where(fn (Builder $d) => self::deliveryNotFailed($d, PasswordResetRequest::DELIVERY_FAILED)),
            self::COMPLETE => $query->where('status', PasswordResetRequest::STATUS_COMPLETED),
            self::CANCELLED => $query
                ->where('status', '!=', PasswordResetRequest::STATUS_COMPLETED)
                ->where(function (Builder $q) use ($active): void {
                    $q->where('status', PasswordResetRequest::STATUS_REJECTED)
                        ->orWhereDoesntHave('user', $active);
                }),
            default => null,
        };
    }

    /** The same rules as `applyToInvites`, for one loaded row. */
    public static function forInvite(AccountInvite $invite): string
    {
        $active = (bool) $invite->user?->isActive();

        if ($invite->status === AccountInvite::STATUS_COMPLETED) {
            return self::COMPLETE;
        }
        if (! $active) {
            return self::CANCELLED;
        }

        return match ($invite->status) {
            AccountInvite::STATUS_EXPIRED => self::PENDING,
            // No expiry counts as expired, as at sign-in.
            AccountInvite::STATUS_TEMPORARY => $invite->user->temp_password_expires_at?->isFuture()
                ? self::IN_PROGRESS
                : self::PENDING,
            default => $invite->delivery === AccountInvite::DELIVERY_FAILED ? self::PENDING : self::IN_PROGRESS,
        };
    }

    /** The same rules as `applyToResetRequests`, for one loaded row. */
    public static function forResetRequest(PasswordResetRequest $request): string
    {
        if ($request->status === PasswordResetRequest::STATUS_COMPLETED) {
            return self::COMPLETE;
        }
        if ($request->status === PasswordResetRequest::STATUS_REJECTED || ! $request->user?->isActive()) {
            return self::CANCELLED;
        }

        return match ($request->status) {
            PasswordResetRequest::STATUS_APPROVED => $request->delivery === PasswordResetRequest::DELIVERY_FAILED
                ? self::PENDING
                : self::IN_PROGRESS,
            default => self::PENDING,
        };
    }

    private static function deliveryNotFailed(Builder $query, string $failed): void
    {
        $query->whereNull('delivery')->orWhere('delivery', '!=', $failed);
    }
}
