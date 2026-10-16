<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\PatientBackgroundChange;
use App\Services\ActionPermissions;
use App\Services\FacilityAccessService;
use App\Services\PatientBackground;
use App\Services\PatientDetail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PatientBackgroundController extends Controller
{
    public function __invoke(Request $request, Patient $patient, FacilityAccessService $facilityAccess, PatientBackground $background)
    {
        $user = $request->user();
        abort_unless($user->isBhc(), 403, 'Independent background updates are available at the BHC only.');
        $facilityAccess->authorizePatientModification($user, $patient);
        ActionPermissions::ensure($user, 'clinical.history');
        ActionPermissions::ensure($user, 'clinical.background.update');

        $rules = PatientBackground::rules('background_update', 'base_revisions');
        $rules['background_update'] = ['required', 'array:sections,base_revisions'];
        $rules['background_update.sections'] = ['required', 'array:'.implode(',', array_keys(PatientBackground::SECTIONS)), 'min:1'];
        foreach (array_keys(PatientBackground::SECTIONS) as $section) {
            $rules["background_update.sections.{$section}"] = ['sometimes', 'required', 'array'];
        }
        $data = $request->validate($rules);

        DB::transaction(function () use ($background, $patient, $data, $user) {
            // Reauthorize after acquiring the row lock: a concurrent ownership
            // edit must not let a stale route-bound patient cross facilities.
            $locked = Patient::whereKey($patient->id)->lockForUpdate()->firstOrFail();
            app(FacilityAccessService::class)->authorizePatientModification($user, $locked);
            $entries = $background->apply($locked, $data['background_update'], $user, today()->toDateString(), 'patient_background');
            foreach ($entries as $entry) {
                PatientBackgroundChange::create([
                    'patient_id' => $locked->id,
                    'barangay_health_center_id' => $user->barangay_health_center_id,
                    'section' => $entry['section'], 'source' => $entry['source'],
                    'before' => $entry['before'], 'after' => $entry['after'],
                    'revision' => $entry['revision'], 'changed_by' => $user->id,
                    'changed_at' => $entry['changedAt'],
                ]);
            }
        });

        return response()->json(['data' => app(PatientDetail::class)->for($patient->fresh(), $user)]);
    }
}
