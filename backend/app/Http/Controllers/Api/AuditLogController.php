<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\AuditPresentation;
use App\Services\StaffRoles;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $filters = $request->validate([
            'search' => 'nullable|string|max:250', 'module' => 'nullable|string|max:100',
            'action' => 'nullable|string|max:100', 'role' => 'nullable|string|max:100',
            'type' => 'nullable|string|max:100', 'user_id' => 'nullable|integer|min:1',
            'page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|min:1',
        ]);
        // Only the small event vocabulary is loaded, never the entire audit history.
        // Include historical/unknown codes so their readable fallbacks are searchable too.
        $events = AuditLog::query()->select('action', 'module')->distinct()->get()
            ->map(fn ($event) => [...$event->getAttributes(), ...AuditPresentation::event($event->action, $event->module)]);
        $query = AuditLog::query()
            ->select(['id', 'user_id', 'action', 'module', 'description', 'created_at'])
            ->with('user:id,name,role,staff_role');

        foreach (['action', 'user_id'] as $filter) {
            if (isset($filters[$filter])) {
                $query->where($filter, $filters[$filter]);
            }
        }
        if ($module = $filters['module'] ?? null) {
            $modules = $events->filter(fn ($event) => strcasecmp($event['module_label'], $module) === 0)->pluck('module')->all();
            $query->whereIn('module', array_unique([$module, ...$modules]));
        }
        if ($role = $filters['role'] ?? null) {
            $keys = $this->staffKeys($role, false);
            $query->whereHas('user', fn ($user) => $user->where('role', strtolower($role))->orWhereIn('staff_role', $keys));
        }
        if ($type = $filters['type'] ?? null) {
            $category = match (strtolower($type)) {
                'auth' => 'Authentication', 'account' => 'Account Management',
                'referral' => 'Referrals', 'inventory' => 'Medicine and Supply',
                default => $type,
            };
            if (strtolower($type) === 'status update') {
                $query->whereIn('action', ['status_updated', 'provider_availability_changed']);
            } elseif (strtolower($type) === 'feedback') {
                $query->whereIn('action', ['feedback_completed', 'draft_returned']);
            } else {
                $this->matchEvents($query, $events->filter(fn ($event) => strcasecmp($event['category'], $category) === 0));
            }
        }
        $search = trim($filters['search'] ?? '');
        if ($search !== '') {
            $matches = $events->filter(fn ($event) => collect(['action', 'module', 'action_label', 'module_label', 'summary', 'category'])
                ->contains(fn ($field) => mb_stripos($event[$field], $search) !== false));
            $query->where(function ($query) use ($search, $matches) {
                $pattern = '%'.$search.'%';
                $query->whereLike('action', $pattern)->orWhereLike('module', $pattern)->orWhereLike('description', $pattern)
                    ->orWhereHas('user', function ($user) use ($search, $pattern) {
                        $user->whereLike('name', $pattern)->orWhereLike('role', $pattern)
                            ->orWhereLike('staff_role', $pattern)->orWhereIn('staff_role', $this->staffKeys($search));
                    });
                if (preg_match('/^(?:LOG-)?0*([0-9]+)$/i', $search, $id)) {
                    $query->orWhere('id', $id[1]);
                }
                $query->orWhere(fn ($friendly) => $this->matchEvents($friendly, $matches));
                foreach (AuditPresentation::DETAIL_VARIANTS as $variant) {
                    if (mb_stripos($variant['action_label'].' '.$variant['summary'], $search) !== false) {
                        $query->orWhere(fn ($detail) => $detail->where('module', $variant['module'])
                            ->where('action', $variant['action'])->whereLike('description', $variant['prefix'].'%'));
                    }
                }
            });
        }
        $logs = $query->orderByDesc('created_at')->orderByDesc('id')
            ->paginate(min(max($request->integer('per_page', 10), 1), 50));

        return response()->json([
            'data' => $logs->getCollection()->map(fn ($log) => AuditPresentation::row($log)),
            'current_page' => $logs->currentPage(), 'per_page' => $logs->perPage(),
            'total' => $logs->total(), 'last_page' => $logs->lastPage(),
            'filter_options' => [
                'modules' => $events->pluck('module_label')->unique()->sort()->values(),
                'types' => $events->pluck('category')->unique()->sort()->values(),
                'roles' => ['Admin', 'BHC', 'RHU', ...array_column(StaffRoles::ROLES, 'label')],
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    private function staffKeys(string $label, bool $partial = true): array
    {
        return array_keys(array_filter(StaffRoles::ROLES, fn ($role, $key) => $partial
            ? mb_stripos($role['label'], $label) !== false || mb_stripos($key, $label) !== false
            : strcasecmp($role['label'], $label) === 0 || strcasecmp($key, $label) === 0, ARRAY_FILTER_USE_BOTH));
    }

    private function matchEvents($query, $events): void
    {
        $query->where(function ($pairs) use ($events) {
            $pairs->whereRaw('1 = 0');
            foreach ($events as $event) {
                $pairs->orWhere(fn ($pair) => $pair->where('module', $event['module'])->where('action', $event['action']));
            }
        });
    }
}
