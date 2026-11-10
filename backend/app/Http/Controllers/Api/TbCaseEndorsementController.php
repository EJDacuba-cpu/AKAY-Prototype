<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TbCaseEndorsement;
use App\Models\TbTreatmentCase;
use App\Services\ActionPermissions;
use App\Services\TbCaseAccessService;
use App\Services\TbCaseEndorsementService;
use Illuminate\Http\Request;

class TbCaseEndorsementController extends Controller
{
    public function __construct(private readonly TbCaseEndorsementService $endorsements) {}

    public function overview(Request $request, int $tbCase)
    {
        $case = $this->endorsements->ownerCase($request->user(), $tbCase);
        $history = $case->endorsements()->orderByDesc('id')->get();
        $current = $history->first(fn ($row) => in_array($row->status, TbCaseEndorsement::ACTIVE_STATUSES, true));

        return response()->json(['data' => [
            'case_version' => $case->version, 'current' => $current ? $this->present($request, $current) : null,
            'history' => $history->map(fn ($row) => $this->present($request, $row))->values(),
            'candidates' => $this->endorsements->candidates($case)->orderBy('name')->get(['id', 'name']),
            'can_endorse' => $case->status === 'active' && $this->endorsements->canIssue($request->user()),
            'can_revoke' => $current !== null && $this->endorsements->canIssue($request->user()),
        ]]);
    }

    public function store(Request $request, int $tbCase)
    {
        $this->endorsements->ownerCase($request->user(), $tbCase, true);
        $request->merge(['request_key' => strtolower((string) $request->header('Idempotency-Key'))]);
        $data = $request->validate([
            ...$this->prohibited(), 'request_key' => ['required', 'uuid'], 'case_version' => ['required', 'integer', 'min:1'],
            'receiving_bhc_id' => ['required', 'integer'], 'note' => ['required', 'string', 'max:2000'],
        ]);
        $result = $this->endorsements->create($request, $tbCase, $data);

        return response()->json(['data' => $this->present($request, $result['endorsement'])], $result['created'] ? 201 : 200);
    }

    public function index(Request $request)
    {
        $data = $request->validate(['per_page' => ['sometimes', 'integer', 'between:1,100'], 'page' => ['sometimes', 'integer', 'min:1'], 'case_id' => ['sometimes', 'integer', 'min:1']]);
        $rows = $this->endorsements->scope($request->user())->with(['tbCase', 'receivingBhc', 'linkedPatient'])
            ->when($data['case_id'] ?? null, fn ($q, $id) => $q->where('tb_treatment_case_id', $id))
            ->orderByDesc('id')->paginate($data['per_page'] ?? 25);
        $rows->through(fn ($row) => $this->present($request, $row));

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, int $endorsement)
    {
        $row = $this->endorsements->scope($request->user())->findOrFail($endorsement);

        return response()->json(['data' => $this->present($request, $row)]);
    }

    public function transition(Request $request, int $endorsement, string $action)
    {
        $this->endorsements->scope($request->user())->findOrFail($endorsement);
        $rules = [...$this->prohibited(), 'version' => ['required', 'integer', 'min:1']];
        $rules = [...$rules, ...match ($action) {
            'link' => ['linked_patient_id' => ['required', 'integer'], 'identity_confirmed' => ['required', 'accepted']],
            'accept' => ['confirmed' => ['required', 'accepted']],
            'decline' => ['reason' => ['required', 'string', 'max:1000']],
            'revoke' => ['reason' => ['required', 'string', 'max:1000'], 'case_version' => ['required', 'integer', 'min:1']],
        }];
        $row = $this->endorsements->transition($request, $endorsement, $action, $request->validate($rules));

        return response()->json(['data' => $this->present($request, $row)]);
    }

    private function prohibited(): array
    {
        return array_fill_keys(['card_data', 'diagnosis_snapshot', 'status', 'patient_id', 'rural_health_unit_id',
            'source_health_record_id', 'registered_by', 'case_number', 'endorsed_by', 'reviewed_by', 'revoked_by'], ['prohibited']);
    }

    private function present(Request $request, TbCaseEndorsement $row): array
    {
        $row->loadMissing(['tbCase.ruralHealthUnit', 'receivingBhc', 'linkedPatient']);
        $user = $request->user();
        $receiver = $user->isBhc() && (int) $user->barangay_health_center_id === (int) $row->receiving_bhc_id
            && ActionPermissions::allows($user, 'consultations.encode') && ActionPermissions::allows($user, 'clinical.history');
        $validLocal = $row->linkedPatient && $row->linkedPatient->status === 'active'
            && (int) $row->linkedPatient->barangay_health_center_id === (int) $row->receiving_bhc_id;

        return [
            'id' => $row->id, 'case_id' => $row->tb_treatment_case_id, 'case_number' => $row->tbCase->case_number,
            'status' => $row->status, 'version' => $row->version, 'case_version' => $row->tbCase->version,
            'note' => $row->note, 'reason' => $row->reason, 'endorsed_at' => $row->endorsed_at?->toISOString(),
            'reviewed_at' => $row->reviewed_at?->toISOString(), 'revoked_at' => $row->revoked_at?->toISOString(),
            'sending_rhu' => ['id' => $row->tbCase->rural_health_unit_id, 'name' => $row->tbCase->ruralHealthUnit?->name],
            'receiving_bhc' => ['id' => $row->receiving_bhc_id, 'name' => $row->receivingBhc?->name],
            'source_patient' => $row->patient_snapshot,
            'linked_patient' => $validLocal ? TbCaseEndorsementService::identity($row->linkedPatient) : null,
            'can_link' => $receiver && $row->status === 'linkage_needed' && $row->tbCase->status === 'active',
            'can_accept' => $receiver && $row->status === 'pending_review' && $validLocal && $row->tbCase->status === 'active',
            'can_decline' => $receiver && in_array($row->status, ['linkage_needed', 'pending_review'], true),
            'can_read_case' => app(TbCaseAccessService::class)->scope(TbTreatmentCase::query(), $user)->whereKey($row->tb_treatment_case_id)->exists()
                && (! $user->isBhc() || (in_array($row->status, TbCaseEndorsement::READABLE_STATUSES, true) && $validLocal)),
        ];
    }
}
