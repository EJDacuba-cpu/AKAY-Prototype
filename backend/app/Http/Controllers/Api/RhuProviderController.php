<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RhuProviderRequest;
use App\Models\RhuProvider;
use App\Services\AuditLogger;
use App\Services\FacilityAccessService;
use App\Services\ProviderAvailabilityService;
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
            ->active()
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $providers]);
    }

    /**
     * DOC-01 / DOC-19 - the aggregate a BHW needs before submitting. Readable
     * by BHW, RHU staff and admin; each sees only the RHU they are entitled to.
     */
    public function availability(Request $request)
    {
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
            ->active()
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $this->availability->summarize($providers, $ruralHealthUnitId),
        ]);
    }

    public function store(RhuProviderRequest $request, AuditLogger $auditLogger)
    {
        $user = $request->user();
        $this->facilityAccess->authorizeProviderManagement($user);
        $data = $request->validated();

        $provider = DB::transaction(function () use ($data, $user, $request, $auditLogger): RhuProvider {
            $provider = RhuProvider::create([
                ...$data,
                'rural_health_unit_id' => $user->rural_health_unit_id,
                'availability_status' => $data['availability_status']
                    ?? RhuProvider::STATUS_AVAILABLE,
                'is_active' => true,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            $auditLogger->log(
                $request,
                'provider_created',
                'providers',
                "Added provider {$provider->name} to the RHU roster."
            );

            return $provider;
        });

        return response()->json(['data' => $provider], 201);
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
            abort_unless($provider->is_active, 422, 'This provider record is no longer active.');

            $previousStatus = $provider->availability_status;
            $provider->update([...$data, 'updated_by' => $user->id]);

            // SCR-06 - an availability flip is its own audited event, because it
            // is the change that can block referral submission under DOC-14.
            $statusChanged = array_key_exists('availability_status', $data)
                && $data['availability_status'] !== $previousStatus;

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

        return response()->json(['data' => $provider]);
    }

    /**
     * Soft delete (DOC-20). The row is retained because referrals may carry a
     * submission-time snapshot referencing this provider (REL-01).
     */
    public function destroy(
        Request $request,
        RhuProvider $rhuProvider,
        AuditLogger $auditLogger
    ) {
        $user = $request->user();

        DB::transaction(function () use ($rhuProvider, $user, $request, $auditLogger): void {
            $provider = RhuProvider::query()
                ->whereKey($rhuProvider->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->facilityAccess->authorizeProviderManagement($user, $provider);
            $provider->update(['is_active' => false, 'updated_by' => $user->id]);

            $auditLogger->log(
                $request,
                'provider_deactivated',
                'providers',
                "Deactivated provider {$provider->name}."
            );
        });

        return response()->json(['data' => ['deactivated' => true]]);
    }
}
