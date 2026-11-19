<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\DraftConsultationExistsException;
use App\Exceptions\DraftDatabaseConnectionFailure;
use App\Exceptions\DraftVersionConflictException;
use App\Http\Controllers\Controller;
use App\Http\Requests\HealthRecordDraftRequest;
use App\Models\HealthRecordDraft;
use App\Services\AuditLogger;
use App\Services\HealthRecordDraftService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            fn () => DB::transaction(function () use ($request, $auditLogger) {
                $record = $this->drafts->create($request->user(), $request->validated());
                $this->audit($auditLogger, $request, 'draft_created', $record);

                return $record;
            })
        );
        $draft->load('patient');

        return response()->json(['data' => $this->drafts->metadata($draft)], 201);
    }

    public function lookup(Request $request)
    {
        $data = $request->validate(['patient_id' => 'required|integer|min:1', 'rhu_visit_id' => 'nullable|integer|min:1']);
        $draft = $this->drafts->lookupFor($request->user(), (int) $data['patient_id'], $data['rhu_visit_id'] ?? null);

        return response()->json(['data' => $draft ? $this->drafts->metadata($draft) : null]);
    }

    public function show(Request $request, string $draft, AuditLogger $auditLogger)
    {
        [$record, $payload, $medicineSelections] = $this->safely(
            $request,
            'resume',
            'Unable to open this draft safely. Please try again.',
            function () use ($request, $draft): array {
                $record = $this->drafts->loadOwnedActive($request->user(), $draft);
                $payload = $this->drafts->withoutRestrictedFields(
                    $request->user(),
                    $this->drafts->payload($record)
                );

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
            fn () => DB::transaction(function () use ($request, $auditLogger, $draft) {
                $record = $this->drafts->update($request->user(), $draft, $request->validated());
                $this->audit($auditLogger, $request, 'draft_updated', $record);

                return $record;
            })
        );

        return response()->json(['data' => $this->drafts->metadata($record)]);
    }

    public function destroy(Request $request, string $draft, AuditLogger $auditLogger)
    {
        $data = $request->validate(['version' => 'sometimes|required|integer|min:1']);
        $record = $this->safely(
            $request,
            'discard',
            'Unable to discard this draft safely. Please try again.',
            fn () => DB::transaction(function () use ($request, $auditLogger, $draft, $data) {
                $record = $this->drafts->discard($request->user(), $draft, isset($data['version']) ? (int) $data['version'] : null);
                $this->audit($auditLogger, $request, 'draft_discarded', $record);

                return $record;
            })
        );

        return response()->json(status: 204);
    }

    public function transition(Request $request, string $draft, AuditLogger $auditLogger)
    {
        $data = $request->validate(['action' => ['required', 'in:claim,takeover,submit,return'], 'version' => ['required', 'integer', 'min:1'], 'note' => ['nullable', 'string', 'max:2000']]);
        $record = DB::transaction(function () use ($request, $draft, $data, $auditLogger) {
            $record = $this->drafts->transition($request->user(), $draft, $data['action'], $data['version'], $data['note'] ?? null);
            $action = match ($data['action']) {
                'claim' => 'draft_claimed', 'takeover' => 'draft_taken_over',
                'submit' => 'draft_submitted', 'return' => 'draft_returned',
            };
            $this->audit($auditLogger, $request, $action, $record);

            return $record;
        });

        return response()->json(['data' => $this->drafts->metadata($record)]);
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
        } catch (ValidationException $exception) {
            Log::notice('Health-record draft request rejected.', [
                'operation' => $operation,
                'fields' => array_keys($exception->errors()),
            ]);
            throw $exception;
        } catch (
            ModelNotFoundException|
            DraftVersionConflictException|
            DraftConsultationExistsException|
            HttpResponseException|
            HttpExceptionInterface $exception
        ) {
            throw $exception;
        } catch (Throwable $exception) {
            if (DraftDatabaseConnectionFailure::matches($exception)) {
                throw $exception;
            }
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
