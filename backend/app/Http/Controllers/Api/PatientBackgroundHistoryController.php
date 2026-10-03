<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\User;
use App\Services\FacilityAccessService;
use App\Services\PatientBackground;
use Illuminate\Http\Request;

/**
 * The Patient Background tab's Changes log: every background_changes entry the
 * patient's finalized consultations recorded, newest first.
 */
class PatientBackgroundHistoryController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess) {}

    public function __invoke(Request $request, Patient $patient)
    {
        $this->facilityAccess->authorizePatient($request->user(), $patient);
        abort_unless(PatientBackground::canAccess($request->user()), 403, 'Clinical history is restricted for your role.');

        $records = $this->facilityAccess
            ->scopeHealthRecords(HealthRecord::query(), $request->user())
            ->where('patient_id', $patient->id)
            ->whereNotNull('background_changes')
            ->get(['id', 'date_recorded', 'background_changes']);

        $entries = $records->flatMap(fn (HealthRecord $record) => collect($record->background_changes ?? [])
            ->filter(fn ($entry) => is_array($entry) && isset(PatientBackground::SECTIONS[$entry['section'] ?? '']))
            ->map(fn (array $entry) => [
                ...$entry,
                'healthRecordId' => $record->id,
                'dateRecorded' => $record->date_recorded?->toDateString(),
            ]));

        $names = User::query()
            ->whereIn('id', $entries->pluck('changedBy')->filter()->unique()->values())
            ->pluck('name', 'id');

        return response()->json(['data' => $entries
            ->map(fn (array $entry) => [...$entry, 'changedByName' => $names[$entry['changedBy'] ?? 0] ?? null])
            ->sortByDesc(fn (array $entry) => [$entry['changedAt'] ?? '', $entry['healthRecordId']])
            ->values()]);
    }
}
