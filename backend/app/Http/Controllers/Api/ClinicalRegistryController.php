<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ClinicalRegistry;

/**
 * Serves the clinical registry (monitored conditions and surveillance
 * diseases) read-only. Authenticated, no special permission - everyone
 * who can open a consultation needs to see what's available. The frontend
 * keeps zero copy of any of these lists; it always renders from this
 * response. See
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md.
 */
class ClinicalRegistryController extends Controller
{
    public function index(ClinicalRegistry $registry)
    {
        return response()->json(['data' => $registry->all()]);
    }
}
