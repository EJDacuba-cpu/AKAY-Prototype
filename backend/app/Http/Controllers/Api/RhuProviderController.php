<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RhuProviderRequest;
use App\Models\RhuProvider;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\ProviderAvailabilityService;
use App\Services\ReferralHoldService;
use App\Services\RhuDoctorRosterService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * DOC-20/21/22 roster CRUD and the DOC-19 availability aggregate.
 *
 * TECH-01b: this path uses Eloquent rather than the stored-function read path.
 * Provider CRUD is not a high-volume read, and splitting the DOC-14 rule
 * between Laravel and PL/pgSQL would put one business rule in two places.
 */
class RhuProviderController extends Controller
{
    public function __construct(
        private readonly FacilityAccessService $facilityAccess,
        private readonly ProviderAvailabilityService $availability
    ) {
    }

    public function index(Request $request)
    {
        $providers = $this->facilityAccess
            ->scopeRhuProviders(RhuProvider::query(), $request->user())
            ->eligibleRoster()
            ->with('unavailability')
            ->orderBy('name')
            ->get();
        $providers->each(fn (RhuProvider $provider) => $provider->makeVisible(['internal_notes']));

        return response()->json(['data' => $providers]);
    }

    /**
     * DOC-01 / DOC-19 - the aggregate a BHW needs before submitting. Readable
     * by BHW, RHU staff and admin; each sees only the RHU they are entitled to.
     */
    public function availability(Request $request)
    {
        if ($request->user()->isBhc() && $request->filled('rural_health_unit_id')) {
            $validated = $request->validate(['rural_health_unit_id' => ['required', 'integer']]);
            $route = app(\App\Services\ReferralRoutingService::class)->resolveForBhc($request->user(), (int) $validated['rural_health_unit_id']);
            $providers = RhuProvider::where('rural_health_unit_id', $route['rhu']->id)->eligibleRoster()->with('unavailability')->get();
            return response()->json(['data' => $this->availability->summarize($providers, (int) $route['rhu']->id)]);
        }
        $ruralHealthUnitId = $this->facilityAccess
            ->resolveVisibleRuralHealthUnitId($request->user());

        if ($ruralHealthUnitId === null && ! $request->user()->isAdmin()) {
            return response()->json([
                'message' => 'No receiving Rural Health Unit is configured for your facility.',
                'code' => 'NO_MAPPED_RURAL_HEALTH_UNIT',
            ], 422);
        }

        $providers = $this->facilityAccess
            ->scopeRhuProviders(RhuProvider::query(), $request->user())
            ->eligibleRoster()
            ->with('unavailability')
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $this->availability->summarize($providers, $ruralHealthUnitId),
        ]);
    }

    public function store(RhuProviderRequest $request)
    {
        $this->facilityAccess->authorizeProviderManagement($request->user());
        abort(422, RhuDoctorRosterService::COVERING_CREATE_DISABLED);
    }

    public function update(
        RhuProviderRequest $request,
        RhuProvider $rhuProvider,
        AuditLogger $auditLogger
    ) {
        $user = $request->user();
        $data = $request->validated();

        $provider = DB::transaction(function () use (
            $rhuProvider,
            $data,
            $user,
            $request,
            $auditLogger
        ): RhuProvider {
            $provider = RhuProvider::query()
                ->whereKey($rhuProvider->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->facilityAccess->authorizeProviderManagement($user, $provider);
            abort_unless($provider->isOfficial(), 422, RhuDoctorRosterService::COVERING_LOCKED);
            abort_unless($provider->is_active, 422, 'This provider record is no longer active.');

            if (array_key_exists('name', $data) && $data['name'] !== $provider->name) {
                abort(422, RhuDoctorRosterService::NAME_MANAGED);
            }

            $previousStatus = $provider->availability_status;
            $wasEffective = $provider->isEffectivelyAvailable();
            if (array_key_exists('availability_status', $data)) {
                $data['availability_status_set_at'] = now();
            }
            $provider->update([...$data, 'updated_by' => $user->id]);
            $provider->load('unavailability');

            // SCR-06 - an availability flip is its own audited event, because it
            // is the change that can block referral submission under DOC-14.
            $statusChanged = array_key_exists('availability_status', $data)
                && $data['availability_status'] !== $previousStatus;

            if (! $wasEffective && $provider->isEffectivelyAvailable()) {
                app(ReferralHoldService::class)->notifyWaitingHolds($provider->ruralHealthUnit);
            }

            $auditLogger->log(
                $request,
                $statusChanged ? 'provider_availability_changed' : 'provider_updated',
                'providers',
                $statusChanged
                    ? "Provider {$provider->name} changed from {$previousStatus} to {$provider->availability_status}."
                    : "Updated provider {$provider->name}."
            );

            return $provider;
        });

        return response()->json(['data' => $provider->makeVisible(['internal_notes'])]);
    }

    /**
     * Roster rows are retained for REL-01 snapshots. Official identity is
     * Admin-owned; covering/legacy rows are historical and cannot be removed.
     */
    public function destroy(Request $request, RhuProvider $rhuProvider)
    {
        $user = $request->user();

        DB::transaction(function () use ($rhuProvider, $user): void {
            $provider = RhuProvider::query()
                ->whereKey($rhuProvider->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->facilityAccess->authorizeProviderManagement($user, $provider);
            abort_if($provider->isOfficial(), 422, RhuDoctorRosterService::OFFICIAL_LOCKED);
            abort(422, RhuDoctorRosterService::COVERING_LOCKED);
        });
    }
}
