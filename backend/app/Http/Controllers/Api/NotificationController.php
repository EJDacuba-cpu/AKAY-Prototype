<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserNotification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * Types every follow-up-triggering call site in this codebase emits.
     * Kept as an explicit, finite list rather than a keyword scan (the
     * approach the frontend classifier used) so this endpoint's numbers
     * can never silently drift from what getNotificationCategory() shows.
     */
    private const FOLLOW_UP_TYPES = ['follow_up_no_show', 'follow_up_due_today'];

    private const REFERRAL_TYPES = [
        'incoming_referral',
        'referral_submitted',
        'referral_received',
        'referral_late_arrival',
        'referral_no_show',
        'referral_completed',
        'referral_hold_available',
    ];

    /**
     * Decision A1 - this used to also call
     * FollowUpNotificationService::notifyDueForUser(), which transitioned
     * overdue follow-ups to No-Show as a side effect of this GET request.
     * That transition now runs only from the follow-ups:mark-no-show
     * scheduled command; this method is a pure read.
     */
    public function index(Request $request)
    {
        $query = $request->user()
            ->notifications()
            ->whereNull('cleared_at')
            ->whereNull('trashed_at');

        $this->applySearch($query, $request);

        return response()->json([
            'data' => $query->latest()->paginate($request->integer('per_page', 50)),
        ]);
    }

    /**
     * Decision D-4 - NotificationsPage.jsx's category sidebar used to
     * compute every count client-side over the same capped, page-1-only
     * array the badge undercounted from. This is the true, database-backed
     * figure for each category.
     */
    public function counts(Request $request)
    {
        $inbox = $request->user()->notifications()
            ->whereNull('cleared_at')
            ->whereNull('trashed_at');

        return response()->json(['data' => [
            'inbox' => (clone $inbox)->count(),
            'unread' => (clone $inbox)->where('is_read', false)->count(),
            'followups' => (clone $inbox)->whereIn('type', self::FOLLOW_UP_TYPES)->count(),
            'referrals' => (clone $inbox)->whereIn('type', self::REFERRAL_TYPES)->count(),
            // No backend call site currently emits a medicine-category
            // notification. Fixed at 0 rather than querying a type list
            // that would always be empty - this is a gap in what the app
            // notifies about, not something this endpoint needs to paper
            // over.
            'medicine' => 0,
            'system' => (clone $inbox)
                ->whereNotIn('type', [...self::FOLLOW_UP_TYPES, ...self::REFERRAL_TYPES])
                ->count(),
            'trash' => $request->user()->notifications()->whereNotNull('trashed_at')->count(),
        ]]);
    }

    /**
     * Decision D-5 - the Trash tab used to filter the already-fetched Inbox
     * array by a client-only flag with no backend query behind it at all.
     */
    public function trashed(Request $request)
    {
        $query = $request->user()->notifications()->whereNotNull('trashed_at');
        $this->applySearch($query, $request);

        return response()->json([
            'data' => $query->latest('trashed_at')->paginate($request->integer('per_page', 50)),
        ]);
    }

    public function markRead(Request $request, UserNotification $notification)
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['is_read' => true]);

        return response()->json(['data' => $notification->fresh()]);
    }

    /**
     * Decision D-7 (N11) - markSelectedAsUnread on the frontend used to be
     * client-state-only, with no endpoint to reverse a read. Nothing
     * re-applied that flag after a refetch, so it silently reverted itself
     * on the next navigation.
     */
    public function markUnread(Request $request, UserNotification $notification)
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['is_read' => false]);

        return response()->json(['data' => $notification->fresh()]);
    }

    public function markAllRead(Request $request)
    {
        $request->user()
            ->notifications()
            ->whereNull('cleared_at')
            ->update(['is_read' => true]);

        return response()->json(['message' => 'Notifications marked as read.']);
    }

    public function clearAll(Request $request)
    {
        $request->user()
            ->notifications()
            ->whereNull('cleared_at')
            ->update([
                'is_read' => true,
                'cleared_at' => now(),
            ]);

        return response()->json(['message' => 'Notifications cleared.']);
    }

    /**
     * Decision D-5 - moves a single notification to Trash, distinct from
     * clearAll()/destroy()'s cleared_at: trashed items are individually
     * recoverable via restore(), cleared ones are not surfaced anywhere.
     */
    public function trash(Request $request, UserNotification $notification)
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['trashed_at' => now()]);

        return response()->json(['data' => $notification->fresh()]);
    }

    public function restore(Request $request, UserNotification $notification)
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['trashed_at' => null]);

        return response()->json(['data' => $notification->fresh()]);
    }

    public function destroy(Request $request, UserNotification $notification)
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update([
            'is_read' => true,
            'cleared_at' => now(),
        ]);

        return response()->json(['message' => 'Notification cleared.']);
    }

    /**
     * Decision D-8 - search used to run client-side over the already-capped
     * array only, so it silently missed anything past the first page.
     */
    private function applySearch($query, Request $request): void
    {
        $search = trim((string) $request->string('search'));

        if ($search === '') {
            return;
        }

        $query->where(fn ($inner) => $inner
            ->where('title', 'like', "%{$search}%")
            ->orWhere('message', 'like', "%{$search}%"));
    }
}
