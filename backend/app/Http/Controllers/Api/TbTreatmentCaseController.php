<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\TbCaseEndorsement;
use App\Models\TbTreatmentCase;
use App\Services\TbCaseAccessService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;

class TbTreatmentCaseController extends Controller
{
    public function __construct(private readonly TbCaseAccessService $access) {}

    /** Read-only linked case for a finalized RHU consultation (no Form 4B registration). */
    public function linkedToSource(Request $request, HealthRecord $healthRecord)
    {
        $this->access->authorizeRhuSourceRead($request->user(), $healthRecord);
        $case = TbTreatmentCase::where('source_health_record_id', $healthRecord->id)->first();

        return response()->json(['data' => ['case' => $case]]);
    }

    public function index(Request $request, Patient $patient)
    {
        $this->access->authorizePatientList($request->user(), $patient);
        $validated = $request->validate(['per_page' => ['sometimes', 'integer', 'min:1', 'max:100']]);
        $cases = $this->access->forPatient(TbTreatmentCase::query(), $request->user(), $patient->id)
            ->select([
                'id', 'patient_id', 'rural_health_unit_id', 'source_health_record_id',
                'reporting_year', 'case_number', 'status', 'registered_by', 'registered_at', 'version',
            ])
            ->orderByDesc('registered_at')->orderByDesc('id')
            ->paginate($validated['per_page'] ?? 25);

        return response()->json(['data' => $cases]);
    }

    public function show(Request $request, int $tbCase)
    {
        $case = $this->access->scope(TbTreatmentCase::query(), $request->user())->findOrFail($tbCase);

        return response()->json(['data' => $case]);
    }

    public function pdf(Request $request, int $tbCase)
    {
        $case = $this->access->scope(TbTreatmentCase::query(), $request->user())->findOrFail($tbCase);
        $endorsement = $case->endorsements()->whereIn('status', TbCaseEndorsement::ACTIVE_STATUSES)->with('receivingBhc')->first();
        $facility = $case->ruralHealthUnit?->name ?? '';
        if ($endorsement) {
            $facility = $endorsement->status === 'accepted'
                ? ($endorsement->receivingBhc?->name ?? '').($endorsement->receivingBhc?->status !== 'active' ? ' (inactive)' : '')
                : $facility.' — pending BHC acceptance: '.($endorsement->receivingBhc?->name ?? '');
        }
        $pdf = Pdf::loadView('pdf.tb-treatment-card', [
            'record' => $case->sourceHealthRecord, 'patient' => $case->patient, 'tb' => $case->projectedCard(),
            'caseLifecycle' => $case,
            'followUpLabs' => $case->followUpLabs()->where('status', '!=', 'cancelled')->orderBy('id')->get(),
            'universalLaboratoryTests' => $case->diagnosis_snapshot['laboratory_tests'] ?? [],
            'treatmentFacility' => $facility,
            'monitoringEntries' => $case->monitoringEntries()->where('voided', false)
                ->with('barangayHealthCenter')->orderBy('observed_on')->get(),
        ])->setPaper('legal', 'landscape');
        $number = preg_replace('/[^A-Za-z0-9_-]/', '', $case->case_number);

        return $pdf->stream('DS-TB-Treatment-Card-'.$number.'.pdf');
    }
}
