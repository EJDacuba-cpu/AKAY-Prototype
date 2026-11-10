<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\TbDrReferralRequest;
use App\Models\HealthRecord;
use App\Services\TbDrReferralService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;

class TbDrReferralController extends Controller
{
    public function __construct(private readonly TbDrReferralService $referrals) {}

    public function preview(Request $request, HealthRecord $healthRecord)
    {
        return response()->json(['data' => $this->referrals->preview($request->user(), $healthRecord)]);
    }

    public function store(TbDrReferralRequest $request, HealthRecord $healthRecord)
    {
        $result = $this->referrals->issue($request, $healthRecord, $request->validated());

        return response()->json(['data' => $this->referrals->present($request->user(), $result['referral'])], $result['created'] ? 201 : 200);
    }

    public function show(Request $request, int $referral)
    {
        return response()->json(['data' => $this->referrals->present($request->user(), $this->referrals->scope($request->user())->findOrFail($referral))]);
    }

    public function updateStatus(TbDrReferralRequest $request, int $referral)
    {
        return response()->json(['data' => $this->referrals->present($request->user(), $this->referrals->changeStatus($request, $referral, $request->validated()))]);
    }

    public function pdf(Request $request, int $referral)
    {
        $row = $this->referrals->scope($request->user())->with(['events' => fn ($query) => $query->orderBy('version')])->findOrFail($referral);

        return Pdf::loadView('pdf.tb-dr-referral', ['referral' => $row])->setPaper('a4')->stream("DR-TB-Referral-$referral.pdf");
    }
}
