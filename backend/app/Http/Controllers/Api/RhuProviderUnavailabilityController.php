<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RhuProviderUnavailabilityRequest;
use App\Models\RhuProvider;
use App\Models\RhuProviderUnavailability;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\RhuDoctorRosterService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RhuProviderUnavailabilityController extends Controller
{
    public function __construct(private readonly FacilityAccessService $facilityAccess)
    {
    }

    public function index(Request $request, RhuProvider $rhuProvider)
    {
        $this->authorizeRosterRead($request, $rhuProvider);

        $from = $request->query('from');
        $to = $request->query('to');
        $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $rows = $rhuProvider->unavailability()
            ->when($from, fn ($query) => $query->whereDate('local_date', '>=', $from))
            ->when($to, fn ($query) => $query->whereDate('local_date', '<=', $to))
            ->orderBy('local_date')
            ->orderBy('start_time')
            ->get()
            ->map(fn (RhuProviderUnavailability $row): array => $row->toApiArray())
            ->all();

        return response()->json(['data' => $rows]);
    }

    public function store(
        RhuProviderUnavailabilityRequest $request,
        RhuProvider $rhuProvider,
        AuditLogger $auditLogger
    ) {
        $this->authorizeOfficialWrite($request, $rhuProvider);
        $data = $request->validated();

        $row = DB::transaction(function () use ($rhuProvider, $data, $request): RhuProviderUnavailability {
            return $rhuProvider->unavailability()->create([
                ...$data,
                'all_day' => $request->boolean('all_day', true),
                'start_time' => ($request->boolean('all_day', true) ? null : ($data['start_time'] ?? null)),
                'end_time' => ($request->boolean('all_day', true) ? null : ($data['end_time'] ?? null)),
                'created_by' => $request->user()->id,
                'updated_by' => $request->user()->id,
            ]);
        });

        $auditLogger->log(
            $request,
            'provider_unavailability_created',
            'providers',
            "Scheduled unavailability for {$rhuProvider->name} on {$row->localDateString()}."
        );

        return response()->json(['data' => $row->toApiArray()], 201);
    }

    public function update(
        RhuProviderUnavailabilityRequest $request,
        RhuProvider $rhuProvider,
        RhuProviderUnavailability $unavailability,
        AuditLogger $auditLogger
    ) {
        $this->authorizeOfficialWrite($request, $rhuProvider);
        $this->assertBelongsToProvider($rhuProvider, $unavailability);
        $data = $request->validated();
        $allDay = $request->has('all_day') ? $request->boolean('all_day') : $unavailability->all_day;

        $unavailability->update([
            ...$data,
            'all_day' => $allDay,
            'start_time' => $allDay ? null : ($data['start_time'] ?? $unavailability->start_time),
            'end_time' => $allDay ? null : ($data['end_time'] ?? $unavailability->end_time),
            'updated_by' => $request->user()->id,
        ]);

        $auditLogger->log(
            $request,
            'provider_unavailability_updated',
            'providers',
            "Updated unavailability for {$rhuProvider->name} on {$unavailability->localDateString()}."
        );

        return response()->json(['data' => $unavailability->fresh()->toApiArray()]);
    }

    public function destroy(
        Request $request,
        RhuProvider $rhuProvider,
        RhuProviderUnavailability $unavailability,
        AuditLogger $auditLogger
    ) {
        $this->authorizeOfficialWrite($request, $rhuProvider);
        $this->assertBelongsToProvider($rhuProvider, $unavailability);
        $date = $unavailability->localDateString();
        $unavailability->delete();

        $auditLogger->log(
            $request,
            'provider_unavailability_deleted',
            'providers',
            "Removed unavailability for {$rhuProvider->name} on {$date}."
        );

        return response()->json(['data' => true]);
    }

    private function authorizeRosterRead(Request $request, RhuProvider $rhuProvider): void
    {
        abort_unless(
            $this->facilityAccess->scopeRhuProviders(RhuProvider::query(), $request->user())
                ->whereKey($rhuProvider->id)
                ->exists(),
            403,
            'You are not authorized to access this provider.'
        );
    }

    private function authorizeOfficialWrite(Request $request, RhuProvider $rhuProvider): void
    {
        $this->facilityAccess->authorizeProviderManagement($request->user(), $rhuProvider);
        abort_unless($rhuProvider->isOfficial(), 422, RhuDoctorRosterService::COVERING_LOCKED);
        abort_unless($rhuProvider->is_active, 422, 'This provider record is no longer active.');
    }

    private function assertBelongsToProvider(RhuProvider $rhuProvider, RhuProviderUnavailability $unavailability): void
    {
        abort_unless(
            (int) $unavailability->rhu_provider_id === (int) $rhuProvider->id,
            404
        );
    }
}
