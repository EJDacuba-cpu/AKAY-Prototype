<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FacilityAssignment;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\NurseAssignmentPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StaffAssignmentController extends Controller
{
    public function index()
    {
        return response()->json(['data' => FacilityAssignment::with(['user:id,name,email,professional_designation,rural_health_unit_id', 'barangayHealthCenter:id,name'])->latest()->get()]);
    }

    public function eligible()
    {
        return response()->json(['data' => User::where('role', 'rhu_staff')->where('status', 'active')->whereRaw('LOWER(TRIM(professional_designation)) = ?', ['nurse'])->whereNotNull('rural_health_unit_id')->whereNull('barangay_health_center_id')->whereHas('ruralHealthUnit', fn ($q) => $q->where('status', 'active'))->with('ruralHealthUnit:id,name')->get(['id', 'name', 'email', 'professional_designation', 'rural_health_unit_id'])]);
    }

    public function store(Request $request, AuditLogger $audit)
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'barangay_health_center_id' => ['required', Rule::exists('barangay_health_centers', 'id')->where('status', 'active')],
            'permissions' => ['required', 'array', 'min:1'],
            'permissions.*' => ['required', 'distinct', Rule::in(NurseAssignmentPolicy::DUTIES)],
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'assignment_type' => ['required', 'in:temporary,ongoing'],
            'ends_on' => ['exclude_unless:assignment_type,temporary', 'required_if:assignment_type,temporary', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
        ]);
        $assignment = DB::transaction(function () use ($request, $data, $audit) {
            $user = User::whereKey($data['user_id'])->lockForUpdate()->firstOrFail();
            abort_unless(NurseAssignmentPolicy::eligible($user), 422, 'Additional BHC assignments are available only for active RHU-based nurses.');
            abort_unless($user->ruralHealthUnit()->where('status', 'active')->exists(), 422, 'The home RHU must be active.');
            $overlap = $user->facilityAssignments()->where('barangay_health_center_id', $data['barangay_health_center_id'])->whereNull('revoked_at')
                ->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $data['starts_on']))
                ->when($data['ends_on'] ?? null, fn ($q, $end) => $q->whereDate('starts_on', '<=', $end))->exists();
            abort_if($overlap, 422, 'This nurse already has an overlapping assignment at this BHC.');
            $assignment = FacilityAssignment::create([...$data, 'rural_health_unit_id' => null, 'created_by' => $request->user()->id]);
            $audit->log($request, 'assignment_created', 'facility_assignments', "Assignment {$assignment->id} created for account {$user->id}.");
            return $assignment;
        });
        return response()->json(['data' => $assignment->load(['user:id,name,email', 'barangayHealthCenter:id,name'])], 201);
    }

    public function revoke(Request $request, FacilityAssignment $staffAssignment, AuditLogger $audit)
    {
        $staffAssignment->update(['revoked_at' => $staffAssignment->revoked_at ?? now(), 'revoked_by' => $request->user()->id]);
        $audit->log($request, 'assignment_revoked', 'facility_assignments', "Assignment {$staffAssignment->id} revoked.");
        return response()->json(['data' => $staffAssignment]);
    }
}
