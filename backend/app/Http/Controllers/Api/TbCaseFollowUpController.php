<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\TbCaseFollowUpRequest;
use App\Services\TbCaseFollowUpService;
use Illuminate\Http\Request;

class TbCaseFollowUpController extends Controller
{
    public function __construct(private readonly TbCaseFollowUpService $followUp) {}

    public function index(Request $request, int $tbCase)
    {
        return response()->json(['data' => $this->followUp->overview($request->user(), $tbCase)]);
    }

    public function storeLab(TbCaseFollowUpRequest $request, int $tbCase)
    {
        return $this->save($request, $tbCase, 'lab');
    }

    public function updateLab(TbCaseFollowUpRequest $request, int $tbCase, int $lab)
    {
        return $this->save($request, $tbCase, 'lab', $lab);
    }

    public function lifecycle(TbCaseFollowUpRequest $request, int $tbCase, string $action)
    {
        return $this->save($request, $tbCase, $action);
    }

    private function save(TbCaseFollowUpRequest $request, int $id, string $action, ?int $lab = null)
    {
        $result = $this->followUp->write($request, $id, $action, $request->validated(), $lab);

        return response()->json(['data' => $result], $result['created'] ? 201 : 200);
    }
}
