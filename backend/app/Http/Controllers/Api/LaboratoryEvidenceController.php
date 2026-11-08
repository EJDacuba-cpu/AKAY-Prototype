<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthRecord;
use App\Models\LaboratoryAddendum;
use App\Models\LaboratoryTest;
use App\Models\MonitoringHandoffRequest;
use App\Models\Patient;
use App\Services\ActionPermissions;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\HandoffLaboratoryEvidence;
use App\Services\LaboratoryAttachmentStorage;
use App\Services\LaboratoryEvidenceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LaboratoryEvidenceController extends Controller
{
    public function __construct(private readonly LaboratoryEvidenceService $evidence) {}

    public function index(Request $request, HealthRecord $healthRecord)
    {
        $this->evidence->authorizeRead($request->user(), $healthRecord);

        return response()->json(['data' => $this->evidence->present($healthRecord),
            'uploads_available' => app(LaboratoryAttachmentStorage::class)->ready(),
            'can_addendum' => $request->user()->isRhu()
                && (int) $healthRecord->rural_health_unit_id === (int) $request->user()->rural_health_unit_id
                && ActionPermissions::allows($request->user(), 'records.correct')]);
    }

    public function patient(Request $request, Patient $patient)
    {
        abort_unless($request->user()->isRhu(), 403);
        ActionPermissions::ensure($request->user(), 'clinical.history');
        $access = app(FacilityAccessService::class);
        // Includes a catchment patient already authorized for a started visit.
        if (! $access->isCatchmentBhcPatient($request->user(), $patient)) {
            $access->authorizePatient($request->user(), $patient);
        }
        $records = $access->scopePatientHealthRecords(HealthRecord::query(), $request->user())
            ->where('patient_id', $patient->id)->where('rural_health_unit_id', $request->user()->rural_health_unit_id)
            ->whereHas('laboratoryTests')->orderByDesc('date_recorded')->get();

        return response()->json(['data' => $records->flatMap(fn ($record) => $this->evidence->present($record))->all()]);
    }

    public function handoffs(Request $request, HealthRecord $healthRecord)
    {
        $this->evidence->authorizeRead($request->user(), $healthRecord);
        abort_unless($request->user()->isRhu(), 403);
        $rows = MonitoringHandoffRequest::query()->where('health_record_id', $healthRecord->id)
            ->where('sending_rural_health_unit_id', $request->user()->rural_health_unit_id)->with('receivingBarangayHealthCenter')->get();

        return response()->json(['data' => $rows->map(fn ($handoff) => [
            'id' => $handoff->id, 'status' => $handoff->status,
            'receivingBhc' => $handoff->receivingBarangayHealthCenter?->name,
            'condition' => $handoff->patientCondition?->condition_name,
            'sharingRevision' => (int) $handoff->laboratory_evidence_revision,
            'evidence' => app(HandoffLaboratoryEvidence::class)->present($handoff),
        ])->all()]);
    }

    public function share(Request $request, MonitoringHandoffRequest $handoff)
    {
        $sharing = app(HandoffLaboratoryEvidence::class);
        $sharing->authorizeSender($request->user(), $handoff);
        $data = $request->validate([
            'selected' => ['present', 'array', 'max:50'],
            'selected.*' => ['array:reference,version,attachmentIds'],
            'selected.*.reference' => ['required', 'string', 'max:80'],
            'selected.*.version' => ['required', 'integer', 'min:0'],
            'selected.*.attachmentIds' => ['nullable', 'array', 'max:10'],
            'selected.*.attachmentIds.*' => ['uuid'],
            'confirmed' => ['required', 'accepted'], 'reason' => ['required', 'string', 'max:2000'],
            'sharingRevision' => ['required', 'integer', 'min:0'],
        ]);
        DB::transaction(function () use ($request, $handoff, $data, $sharing) {
            $locked = MonitoringHandoffRequest::query()->lockForUpdate()->findOrFail($handoff->id);
            $sharing->authorizeSender($request->user(), $locked);
            abort_unless((int) $locked->laboratory_evidence_revision === (int) $data['sharingRevision'], 409, 'Evidence sharing changed. Refresh and review the latest selection.');
            $sharing->share($request, $locked, $data['selected'], true, $data['reason']);
        });

        return response()->json(['data' => $sharing->present($handoff)]);
    }

    public function monitoring(Request $request, Patient $patient)
    {
        ActionPermissions::ensure($request->user(), 'clinical.history');
        app(FacilityAccessService::class)->authorizePatient($request->user(), $patient);
        abort_unless($request->user()->isBhc(), 403);
        $sharing = app(HandoffLaboratoryEvidence::class);
        $rows = MonitoringHandoffRequest::query()
            ->where('linked_patient_id', $patient->id)
            ->where('receiving_barangay_health_center_id', $request->user()->barangay_health_center_id)
            ->whereIn('status', ['accepted_awaiting_first_visit', 'monitoring_active'])->get();

        return response()->json(['data' => $rows->flatMap(function ($handoff) use ($sharing, $request) {
            $sharing->authorizeReceiver($request->user(), $handoff);

            return $sharing->present($handoff);
        })->all()]);
    }

    public function addendum(Request $request, HealthRecord $healthRecord, LaboratoryTest $laboratoryTest)
    {
        $this->evidence->authorizeAddendum($request->user(), $healthRecord);
        abort_unless((int) $laboratoryTest->health_record_id === (int) $healthRecord->id, 404);
        $data = $request->validate([
            ...LaboratoryEvidenceService::rules('tests'),
            'tests' => ['required', 'array', 'size:1'],
            'reason' => ['required', 'string', 'max:2000'],
            'version' => ['required', 'integer', 'min:0'],
        ]);
        abort_unless(strtolower($data['tests'][0]['id']) === $laboratoryTest->client_id, 422, 'The laboratory identity cannot be changed.');
        DB::transaction(function () use ($request, $laboratoryTest, $data) {
            $test = LaboratoryTest::query()->lockForUpdate()->findOrFail($laboratoryTest->id);
            $version = $test->addenda()->max('id') ?? 0;
            abort_unless((int) $version === (int) $data['version'], 409, 'A newer laboratory addendum exists. Refresh before saving.');
            LaboratoryAddendum::create([
                'laboratory_test_id' => $test->id, 'data' => $data['tests'][0],
                'reason' => $data['reason'], 'created_by' => $request->user()->id,
            ]);
            app(AuditLogger::class)->log($request, 'created', 'laboratory_addenda', "Added laboratory addendum to test {$test->id}. Original assessment preserved.");
        });

        return response()->json(['data' => $this->evidence->present($healthRecord)], 201);
    }
}
