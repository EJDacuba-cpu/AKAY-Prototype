<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\DraftVersionConflictException;
use App\Http\Controllers\Controller;
use App\Http\Requests\HealthRecordDraftRequest;
use App\Models\HealthRecordDraft;
use App\Services\AuditLogger;
use App\Services\HealthRecordDraftService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class HealthRecordDraftController extends Controller
{
    public function __construct(private readonly HealthRecordDraftService $drafts) {}

    public function index(Request $request)
    {
        $maximumPerPage = config('health_record_drafts.list_per_page');
        $perPage = min(
            max($request->integer('per_page', $maximumPerPage), 1),
            $maximumPerPage
        );
        $drafts = $this->safely(
            $request,
            'list',
            'Unable to load drafts safely. Please try again.',
            fn () => $this->drafts->listFor($request->user(), $perPage)
        );
        $drafts->through(fn (HealthRecordDraft $draft): array => $this->drafts->metadata($draft));

        return response()->json(['data' => $drafts]);
    }

    public function store(HealthRecordDraftRequest $request, AuditLogger $auditLogger)
    {
        $draft = $this->safely(
            $request,
            'create',
            'Unable to save this draft safely. Please try again.',
            fn () => $this->drafts->create($request->user(), $request->validated())
        );
        $draft->load('patient');
        $this->audit($auditLogger, $request, 'draft_created', $draft);

        return response()->json(['data' => $this->drafts->metadata($draft)], 201);
    }

    public function show(Request $request, string $draft, AuditLogger $auditLogger)
    {
        [$record, $payload, $medicineSelections] = $this->safely(
            $request,
            'resume',
            'Unable to open this draft safely. Please try again.',
            function () use ($request, $draft): array {
                $record = $this->drafts->loadOwnedActive($request->user(), $draft);
                $payload = $this->drafts->payload($record);

                return [
                    $record,
                    $payload,
                    $this->drafts->medicineSelections($request->user(), $payload),
                ];
            }
        );
        $this->audit($auditLogger, $request, 'draft_resumed', $record);

        return response()->json(['data' => [
            ...$this->drafts->metadata($record),
            'payload' => $payload,
            'medicine_selections' => $medicineSelections,
        ]]);
    }

    public function update(
        HealthRecordDraftRequest $request,
        string $draft,
        AuditLogger $auditLogger
    ) {
        $record = $this->safely(
            $request,
            'update',
            'Unable to update this draft safely. Please try again.',
            fn () => $this->drafts->update($request->user(), $draft, $request->validated())
        );
        $this->audit($auditLogger, $request, 'draft_updated', $record);

        return response()->json(['data' => $this->drafts->metadata($record)]);
    }

    public function destroy(Request $request, string $draft, AuditLogger $auditLogger)
    {
        $record = $this->safely(
            $request,
            'discard',
            'Unable to discard this draft safely. Please try again.',
            fn () => $this->drafts->discard($request->user(), $draft)
        );
        $this->audit($auditLogger, $request, 'draft_discarded', $record);

        return response()->json(status: 204);
    }

    private function audit(
        AuditLogger $auditLogger,
        Request $request,
        string $action,
        HealthRecordDraft $draft
    ): void {
        $auditLogger->log(
            $request,
            $action,
            'health_record_drafts',
            implode('; ', [
                "draft_public_id={$draft->public_id}",
                "owner_user_id={$draft->owner_user_id}",
                "bhc_id={$draft->barangay_health_center_id}",
                "classification={$draft->classification}",
                "version={$draft->version}",
            ]).'.'
        );
    }

    private function safely(
        Request $request,
        string $operation,
        string $message,
        callable $callback
    ): mixed {
        try {
            return $callback();
        } catch (
            ValidationException|
            ModelNotFoundException|
            DraftVersionConflictException|
            HttpExceptionInterface $exception
        ) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::warning('Health-record draft operation failed.', [
                'operation' => $operation,
                'user_id' => $request->user()?->id,
                'barangay_health_center_id' => $request->user()?->barangay_health_center_id,
                'exception_type' => $exception::class,
            ]);

            abort(500, $message);
        }
    }
}
