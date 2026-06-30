<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UserNotification;
use App\Services\FollowUpNotificationService;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request, FollowUpNotificationService $followUpNotifications)
    {
        $followUpNotifications->notifyDueForUser($request->user());

        return response()->json([
            'data' => $request->user()
                ->notifications()
                ->whereNull('cleared_at')
                ->latest()
                ->paginate($request->integer('per_page', 25)),
        ]);
    }

    public function markRead(Request $request, UserNotification $notification)
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update(['is_read' => true]);

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

    public function destroy(Request $request, UserNotification $notification)
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->update([
            'is_read' => true,
            'cleared_at' => now(),
        ]);

        return response()->json(['message' => 'Notification cleared.']);
    }
}
