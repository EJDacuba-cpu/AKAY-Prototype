<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\TbMonitoringRequest;
use App\Services\TbMonitoringService;
use Illuminate\Http\Request;

class TbMonitoringController extends Controller
{
    public function __construct(private readonly TbMonitoringService $monitoring) {}

    public function index(Request $request, int $tbCase)
    {
        $case = $this->monitoring->readableCase($request->user(), $tbCase);
        $data = $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $context = $this->monitoring->context($request->user(), $case);
        $entries = $case->monitoringEntries()->with('barangayHealthCenter')->orderByDesc('observed_on')->paginate(25);
        $entries->through(fn ($entry) => $this->monitoring->present($entry, $request->user(), $context['can_write']));

        return response()->json(['data' => [...$context, 'entries' => $entries]]);
    }

    public function show(Request $request, int $tbCase, int $entry)
    {
        $case = $this->monitoring->readableCase($request->user(), $tbCase);
        $row = $case->monitoringEntries()->findOrFail($entry);
        $context = $this->monitoring->context($request->user(), $case);

        return response()->json(['data' => [...$this->monitoring->present($row, $request->user(), $context['can_write']),
            'revisions' => $row->revisions()->orderBy('version')->get()]]);
    }

    public function store(TbMonitoringRequest $request, int $tbCase)
    {
        return $this->save($request, $tbCase);
    }

    public function update(TbMonitoringRequest $request, int $tbCase, int $entry)
    {
        return $this->save($request, $tbCase, $entry);
    }

    private function save(TbMonitoringRequest $request, int $caseId, ?int $entryId = null)
    {
        $result = $this->monitoring->write($request, $caseId, $request->validated(), $entryId);
        $case = $this->monitoring->readableCase($request->user(), $caseId);
        $context = $this->monitoring->context($request->user(), $case);

        return response()->json(['data' => $this->monitoring->present($result['entry'], $request->user(), $context['can_write'])], $result['created'] ? 201 : 200);
    }
}
