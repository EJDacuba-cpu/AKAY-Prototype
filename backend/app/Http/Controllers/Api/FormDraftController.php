<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\FormDraftRecoveryKeyService;
use App\Services\FormDraftService;
use App\Services\HealthRecordDraftPayloadService;
use App\Services\HealthRecordDraftService;
use Illuminate\Http\Request;

class FormDraftController extends Controller
{
    public function __construct(private readonly FormDraftService $drafts) {}

    public function status(Request $request)
    {
        return response()->json(['data' => $this->drafts->status($request->user(), $request->all())]);
    }

    public function retireKey(Request $request, FormDraftRecoveryKeyService $keys)
    {
        $keys->retire($request->user(), $request->all());

        return response()->noContent();
    }

    public function lookup(Request $request)
    {
        return response()->json(['data' => $this->drafts->lookup($request->user(), $request->all())]);
    }

    public function show(Request $request, string $draft)
    {
        return response()->json(['data' => $this->drafts->detail($request->user(), $draft)]);
    }

    public function store(Request $request)
    {
        return response()->json(['data' => $this->drafts->save($request->user(), $request->all())], 201);
    }

    public function update(Request $request, string $draft)
    {
        return response()->json(['data' => $this->drafts->save($request->user(), $request->all(), $draft)]);
    }

    public function destroy(Request $request, string $draft)
    {
        $data = $request->validate(['version' => 'required|integer|min:1']);
        $this->drafts->discard($request->user(), $draft, $data['version']);

        return response()->noContent();
    }

    public function deviceKey(Request $request, FormDraftRecoveryKeyService $keys)
    {
        return response()->json(['data' => $keys->issue($request->user(), $request->all())]);
    }

    public function clinicalKey(Request $request, string $key, FormDraftRecoveryKeyService $keys)
    {
        return response()->json(['data' => $keys->openClinical($request->user(), $key)]);
    }

    public function discardClinical(Request $request, FormDraftRecoveryKeyService $keys)
    {
        $keys->discardClinicalDevice($request->user(), $request->all());

        return response()->noContent();
    }

    public function migrateClinical(Request $request, FormDraftRecoveryKeyService $keys, HealthRecordDraftPayloadService $payloads, HealthRecordDraftService $clinical)
    {
        $request->validate(['form_type' => 'required|in:consultation', 'payload' => 'required|array']);
        $key = $keys->issue($request->user(), $request->all());
        $payload = $payloads->sanitizeStored($clinical->withoutRestrictedFields($request->user(), $request->input('payload')));

        // Re-sealing a checkpoint does not create a server consultation or change review state.
        return response()->json(['data' => ['key' => $key, 'payload' => $payload]]);
    }
}
