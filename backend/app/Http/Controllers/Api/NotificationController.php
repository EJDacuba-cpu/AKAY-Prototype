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
            'data' => $request->user()->notifications()->latest()->paginate($request->integer('per_page', 25)),
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
        $request->user()->notifications()->update(['is_read' => true]);

        return response()->json(['message' => 'Notifications marked as read.']);
    }

    public function destroy(Request $request, UserNotification $notification)
    {
        abort_unless($notification->user_id === $request->user()->id, 403);
        $notification->delete();

        return response()->json(status: 204);
    }
}
