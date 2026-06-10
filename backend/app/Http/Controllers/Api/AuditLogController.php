<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $query = AuditLog::query()
            ->select(['id', 'user_id', 'action', 'module', 'description', 'created_at'])
            ->with('user:id,name,role');

        foreach (['module', 'action', 'user_id'] as $filter) {
            if ($request->query($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }

        if ($request->query('search')) {
            $search = trim($request->query('search'));
            $role = $this->mapRoleFilter($search);

            $query->where(function ($query) use ($search, $role) {
                if (ctype_digit($search)) {
                    $query->where('id', $search);
                }

                $query
                    ->orWhere('action', 'like', "%{$search}%")
                    ->orWhere('module', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($query) use ($search, $role) {
                        $query
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('role', 'like', "%{$search}%");

                        if ($role) {
                            $query->orWhere('role', $role);
                        }
                    });
            });
        }

        if ($request->query('role')) {
            $role = $this->mapRoleFilter($request->query('role'));

            if ($role) {
                $query->whereHas('user', function ($query) use ($role) {
                    $query->where('role', $role);
                });
            }
        }

        if ($request->query('type')) {
            $this->applyTypeFilter($query, $request->query('type'));
        }

        $perPage = min(max($request->integer('per_page', 10), 1), 50);
        $logs = $query
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return response()->json([
            'data' => $logs->items(),
            'current_page' => $logs->currentPage(),
            'per_page' => $logs->perPage(),
            'total' => $logs->total(),
            'last_page' => $logs->lastPage(),
        ]);
    }

    private function mapRoleFilter(string $role): ?string
    {
        return match (strtolower($role)) {
            'admin' => 'admin',
            'bhc' => 'bhw',
            'rhu' => 'rhu_staff',
            default => null,
        };
    }

    private function applyTypeFilter($query, string $type): void
    {
        $terms = match (strtolower($type)) {
            'auth' => ['auth', 'login', 'logout'],
            'account' => ['account', 'user'],
            'referral' => ['referral'],
            'status update' => ['status'],
            'feedback' => ['feedback', 'return'],
            'inventory' => ['medicine', 'inventory'],
            'security' => ['security'],
            'system' => ['system'],
            default => [],
        };

        if (empty($terms)) {
            return;
        }

        $query->where(function ($query) use ($terms) {
            foreach ($terms as $term) {
                $query
                    ->orWhere('action', 'like', "%{$term}%")
                    ->orWhere('module', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%");
            }
        });
    }
}
