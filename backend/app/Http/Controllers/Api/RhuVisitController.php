<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RhuVisitQueueEntry;
use App\Services\PatientIdentity;
use App\Services\RhuVisitQueueService;
use Illuminate\Http\Request;

/**
 * Read-only RHU visit queue. Referral tracking and QR values never leave the
 * server here (D7); the sending BHC name is enough for the queue.
 */
class RhuVisitController extends Controller
{
    public function __construct(private readonly RhuVisitQueueService $visits)
    {
    }

    public function index(Request $request)
    {
        $entries = $this->visits->list($request->user(), ! $request->boolean('include_closed'));
        $entries->load('referral.barangayHealthCenter');

        return response()->json(['data' => $entries->map(fn (RhuVisitQueueEntry $entry): array => $this->present($entry))->values()]);
    }

    /** Walk-in check-in of an existing patient; a referral is never accepted here. */
    public function store(Request $request)
    {
        $data = $request->validate([
            'patient_id' => ['required', 'integer'],
            'check_in_key' => ['required', 'string', 'max:100'],
        ]);

        $result = $this->visits->checkIn($request->user(), $data['patient_id'], null, $data['check_in_key']);
        $entry = $result['entry']->load(['patient', 'referral.barangayHealthCenter']);

        return response()->json(['data' => $this->present($entry)], $result['created'] ? 201 : 200);
    }

    public function show(Request $request, int $visit)
    {
        $entry = $this->visits->find($request->user(), $visit)->load(['patient', 'referral.barangayHealthCenter']);

        return response()->json(['data' => $this->present($entry)]);
    }

    private function present(RhuVisitQueueEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'source' => $entry->source,
            'status' => $entry->status,
            'checked_in_at' => $entry->checked_in_at?->toISOString(),
            'closed_at' => $entry->closed_at?->toISOString(),
            'waiting_minutes' => (int) $entry->checked_in_at->diffInMinutes($entry->closed_at ?? now()),
            'referral' => $entry->referral === null ? null : [
                'id' => $entry->referral->id,
                'sending_bhc' => $entry->referral->barangayHealthCenter?->name,
            ],
            'patient' => PatientIdentity::response($entry->patient, false),
        ];
    }
}
