<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserNotification extends Model
{
    public const ADMIN_ACTION_TYPES = ['password_reset_request', 'account_invite_delivery_failed'];

    /** Current role and source state also protect legacy rows without cleanup writes. */
    public function scopeVisibleTo(Builder $query, User $recipient): void
    {
        $query->where(function (Builder $visible) use ($recipient): void {
            $visible->whereNull('type')->orWhereNotIn('type', self::ADMIN_ACTION_TYPES);
            if (! $recipient->isAdmin() || ! $recipient->isActive()) {
                return;
            }
            $visible->orWhere(function (Builder $reset): void {
                $reset->where('type', 'password_reset_request')->where('entity_type', 'password_reset_request')
                    ->whereExists(function ($source): void {
                        $source->selectRaw('1')->from('password_reset_requests as resets')
                            ->join('users as subject', 'subject.id', '=', 'resets.user_id')
                            ->whereColumn('resets.id', 'notifications.entity_id')
                            ->where('subject.status', User::STATUS_ACTIVE)->whereNotNull('subject.email_verified_at')
                            ->where(function ($actionable): void {
                                $actionable->where('resets.status', PasswordResetRequest::STATUS_PENDING)
                                    ->orWhere(fn ($failed) => $failed->whereIn('resets.status', [PasswordResetRequest::STATUS_APPROVED, PasswordResetRequest::STATUS_EXPIRED])
                                        ->where('resets.delivery', PasswordResetRequest::DELIVERY_FAILED));
                            });
                    });
            })->orWhere(function (Builder $invite): void {
                $invite->where('type', 'account_invite_delivery_failed')->where('entity_type', 'account_invite')
                    ->whereExists(function ($source): void {
                        $source->selectRaw('1')->from('account_invites as invites')
                            ->join('users as subject', 'subject.id', '=', 'invites.user_id')
                            ->whereColumn('invites.id', 'notifications.entity_id')->where('subject.status', User::STATUS_ACTIVE)
                            ->whereIn('invites.status', [AccountInvite::STATUS_PENDING, AccountInvite::STATUS_EXPIRED])
                            ->where('invites.delivery', AccountInvite::DELIVERY_FAILED);
                    });
            });
        });
    }

    protected $table = 'notifications';

    protected $fillable = [
        'user_id',
        'title',
        'message',
        'link_url',
        'type',
        'entity_type',
        'entity_id',
        'dedup_key',
        'is_read',
        'cleared_at',
        'trashed_at',
        'related_referral_id',
    ];

    protected $casts = [
        'is_read' => 'boolean',
        'cleared_at' => 'datetime',
        'trashed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
