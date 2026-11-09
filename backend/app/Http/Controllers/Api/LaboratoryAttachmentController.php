<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HealthRecord;
use App\Models\LaboratoryAttachment;
use App\Models\MonitoringHandoffRequest;
use App\Models\RhuVisitQueueEntry;
use App\Services\ActionPermissions;
use App\Services\AuditLogger;
use App\Services\FormDraftRecoveryKeyService;
use App\Services\HandoffLaboratoryEvidence;
use App\Services\HealthRecordDraftService;
use App\Services\LaboratoryAttachmentStorage;
use App\Services\LaboratoryEvidenceService;
use App\Services\RhuVisitQueueService;
use Aws\CommandInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LaboratoryAttachmentController extends Controller
{
    public function __construct(private readonly LaboratoryAttachmentStorage $storage) {}

    private function withinContext(?HealthRecord $record, array $data, \Closure $action): mixed
    {
        // Match finalization/discard lock order, but release the transaction
        // before writing the object. The intent must already be committed.
        return $record ? $action() : app(FormDraftRecoveryKeyService::class)
            ->withClinicalIdentity($data['consultation_uuid'], $action);
    }

    private function draftContext(Request $request): array
    {
        $data = $request->validate([
            'patient_id' => ['required', 'integer'], 'rhu_visit_id' => ['required', 'integer'],
            'consultation_uuid' => ['required', 'uuid'], 'test_client_id' => ['required', 'uuid'],
        ]);
        abort_unless(ActionPermissions::allows($request->user(), 'consultations.encode')
            || ActionPermissions::allows($request->user(), 'consultations.finalize'), 403);
        $visit = app(RhuVisitQueueService::class)->find($request->user(), $data['rhu_visit_id']);
        abort_unless((int) $visit->patient_id === (int) $data['patient_id']
            && strcasecmp((string) $visit->consultation_uuid, $data['consultation_uuid']) === 0, 403);
        abort_unless($visit->status === 'in_consultation' && $visit->closed_at === null, 409, 'This consultation no longer accepts laboratory attachments.');
        app(RhuVisitQueueService::class)->authorizeInConsultation($request->user(), $data['rhu_visit_id'], $data['patient_id'], $data['consultation_uuid']);
        app(HealthRecordDraftService::class)->authorizeLaboratoryDraft($request->user(), $data['consultation_uuid'], ! $request->isMethod('get'));

        return $data;
    }

    public function index(Request $request)
    {
        $data = $this->draftContext($request);
        $rows = LaboratoryAttachment::query()->where('patient_id', $data['patient_id'])
            ->where('consultation_uuid', strtolower($data['consultation_uuid']))
            ->where('test_client_id', strtolower($data['test_client_id']))->whereNull('removed_at')->get();

        return response()->json(['data' => $rows, 'uploads_available' => $this->storage->ready()]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'mimetypes:application/pdf,image/jpeg,image/png', 'max:'.config('laboratory.max_file_kb')],
            'replace_attachment_id' => ['nullable', 'uuid'],
        ]);
        $record = null;
        if ($request->filled('health_record_id')) {
            $record = HealthRecord::findOrFail($request->integer('health_record_id'));
            app(LaboratoryEvidenceService::class)->authorizeAddendum($request->user(), $record);
            $request->validate(['test_client_id' => ['required', 'uuid'], 'reason' => ['required', 'string', 'max:2000']]);
            abort_unless($record->laboratoryTests()->where('client_id', strtolower($request->input('test_client_id')))->exists(), 422);
            $data = ['patient_id' => $record->patient_id, 'consultation_uuid' => $record->consultation_uuid,
                'test_client_id' => strtolower($request->input('test_client_id'))];
        } else {
            $data = $this->draftContext($request);
        }
        if (! $this->storage->ready()) {
            return response()->json(['message' => 'Laboratory uploads require configured durable private storage. Contact your administrator.'], 503);
        }
        $disk = $this->storage->ensureReady();
        $replacement = $request->filled('replace_attachment_id') ? LaboratoryAttachment::query()
            ->whereKey($request->input('replace_attachment_id'))->where('patient_id', $data['patient_id'])
            ->where('consultation_uuid', strtolower($data['consultation_uuid']))
            ->where('test_client_id', strtolower($data['test_client_id']))
            ->where('health_record_id', $record?->id)->whereNull('removed_at')->whereNotNull('uploaded_at')->firstOrFail() : null;
        $file = $request->file('file');
        $id = (string) Str::uuid();
        // Track the object BEFORE writing it. A process crash leaves an intent
        // row the cleanup command can retry, never an untracked clinical file.
        $attachment = $this->withinContext($record, $data, fn () => DB::transaction(function () use ($request, $record, $data, $disk, $file, $id, $replacement) {
            if ($record) {
                HealthRecord::query()->whereKey($record->id)->lockForUpdate()->firstOrFail();
            } else {
                RhuVisitQueueEntry::query()->whereKey($data['rhu_visit_id'])->lockForUpdate()->firstOrFail();
                $this->draftContext($request);
            }
            $count = LaboratoryAttachment::query()->where('patient_id', $data['patient_id'])
                ->where('consultation_uuid', $data['consultation_uuid'])->where('test_client_id', strtolower($data['test_client_id']))
                ->when($replacement, fn ($query) => $query->where('id', '!=', $replacement->id))
                ->where(fn ($query) => $query->whereNull('removed_at')
                    ->orWhere(fn ($pending) => $pending->whereNull('uploaded_at')->whereNull('purged_at')))->count();
            abort_if($count >= config('laboratory.max_files_per_test'), 422, 'A test may have up to 10 attachments.');

            return LaboratoryAttachment::create([
                'id' => $id, 'patient_id' => $data['patient_id'], 'health_record_id' => null,
                'consultation_uuid' => strtolower($data['consultation_uuid']), 'test_client_id' => strtolower($data['test_client_id']),
                'disk' => $disk, 'path' => 'laboratory/'.$id.'.'.$file->extension(),
                'name' => mb_substr(basename($file->getClientOriginalName()), 0, 255),
                'mime_type' => $file->getMimeType(), 'size' => $file->getSize(), 'created_by' => $request->user()->id,
                // Incomplete upload intents cannot be listed, shared or viewed.
                'removed_at' => now(),
            ]);
        }));
        $storageWriteComplete = false;
        try {
            $written = Storage::disk($disk)->putFileAs(dirname($attachment->path), $file, basename($attachment->path), [
                'visibility' => 'private',
                // Files are bounded by validation. A single PUT lets ACL-free
                // buckets/providers enforce privacy through their bucket policy.
                'mup_threshold' => config('laboratory.max_file_kb') * 1024 + 1,
                'before_upload' => static function (CommandInterface $command): void {
                    unset($command['ACL']);
                },
            ]);
            $storageWriteComplete = (bool) $written;
            abort_unless($written, 503, 'Unable to store the laboratory attachment. Please try again.');
            $this->withinContext($record, $data, fn () => DB::transaction(function () use ($attachment, $request, $record, $replacement) {
                // Finalization and upload completion share the identity lock.
                if (! $record) {
                    RhuVisitQueueEntry::query()->whereKey($request->integer('rhu_visit_id'))->lockForUpdate()->firstOrFail();
                    $this->draftContext($request);
                }
                $attachment->update(['removed_at' => null, 'uploaded_at' => now(), 'health_record_id' => $record?->id]);
                if ($replacement) {
                    $original = LaboratoryAttachment::query()->lockForUpdate()->findOrFail($replacement->id);
                    abort_if($original->removed_at, 409, 'This attachment was already removed or replaced. Refresh the evidence.');
                    $original->update(['removed_at' => now()]);
                    app(AuditLogger::class)->log($request, 'replaced', 'laboratory_attachments', 'Replaced attachment '.$original->id.' with '.$attachment->id.'. '.$request->input('reason', ''));
                }
                app(AuditLogger::class)->log($request, 'created', 'laboratory_attachments', 'Uploaded attachment '.$attachment->id.($record ? '. Addendum reason: '.$request->input('reason') : ''));
            }));
        } catch (\Throwable $error) {
            try {
                $this->storage->purge($attachment->fresh());
            } catch (\Throwable $cleanupError) {
                report($cleanupError); // Retain tombstone for a durable retry.
            }
            if (! $storageWriteComplete) {
                Log::warning('Laboratory storage write failed.', ['attachment_id' => $attachment->id, 'exception_type' => $error::class]);

                return response()->json(['message' => 'Unable to upload the laboratory report to private storage. Your laboratory text and draft have not been changed. Please try again or contact your administrator.'], 503);
            }
            throw $error;
        }
        if ($replacement) {
            try {
                $this->storage->purge($replacement->fresh());
            } catch (\Throwable $error) {
                report($error);
            }
        }

        return response()->json(['data' => $attachment->fresh()], 201);
    }

    private function authorizeDraftAttachment(Request $request, LaboratoryAttachment $attachment): void
    {
        $data = $this->draftContext($request);
        abort_unless((int) $attachment->patient_id === (int) $data['patient_id']
            && strcasecmp($attachment->consultation_uuid, $data['consultation_uuid']) === 0
            && strcasecmp($attachment->test_client_id, $data['test_client_id']) === 0, 403);
    }

    public function show(Request $request, LaboratoryAttachment $laboratoryAttachment)
    {
        $attachment = $laboratoryAttachment;
        if ($request->filled('handoff_id')) {
            $handoff = MonitoringHandoffRequest::findOrFail($request->integer('handoff_id'));
            $sharing = app(HandoffLaboratoryEvidence::class);
            $sharing->authorizeReceiver($request->user(), $handoff);
            abort_unless($sharing->allowsAttachment($handoff, $attachment), 403);
        } elseif ($attachment->health_record_id) {
            app(LaboratoryEvidenceService::class)->authorizeRead($request->user(), HealthRecord::findOrFail($attachment->health_record_id));
            abort_if($attachment->removed_at, 404);
        } else {
            $this->authorizeDraftAttachment($request, $attachment);
            abort_if($attachment->removed_at, 404);
        }
        abort_if($attachment->purged_at || ! $attachment->uploaded_at, 404);
        app(AuditLogger::class)->log($request, 'viewed', 'laboratory_attachments', 'Viewed laboratory attachment '.$attachment->id.'.');
        try {
            $stream = Storage::disk($attachment->disk)->readStream($attachment->path);
        } catch (\Throwable $error) {
            Log::warning('Laboratory storage retrieval failed.', ['attachment_id' => $attachment->id, 'exception_type' => $error::class]);

            return response()->json(['message' => 'Unable to retrieve this laboratory report from private storage. Please try again or contact your administrator.'], 503);
        }
        abort_unless(is_resource($stream), 404, 'Attachment unavailable.');

        return response()->stream(function () use ($stream) {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, 200, [
            'Content-Type' => $attachment->mime_type, 'Content-Disposition' => 'inline; filename="laboratory-report.'.pathinfo($attachment->path, PATHINFO_EXTENSION).'"',
            'Cache-Control' => 'private, no-store, max-age=0', 'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; sandbox", 'Referrer-Policy' => 'no-referrer',
        ]);
    }

    public function destroy(Request $request, LaboratoryAttachment $laboratoryAttachment)
    {
        $attachment = $laboratoryAttachment;
        $record = null;
        if ($attachment->health_record_id) {
            $record = HealthRecord::findOrFail($attachment->health_record_id);
            app(LaboratoryEvidenceService::class)->authorizeAddendum($request->user(), $record);
            $request->validate(['reason' => ['required', 'string', 'max:2000']]);
        } else {
            $this->authorizeDraftAttachment($request, $attachment);
        }
        $this->withinContext($record, ['consultation_uuid' => $attachment->consultation_uuid], fn () => DB::transaction(function () use ($attachment, $request, $record) {
            if (! $record) {
                $this->authorizeDraftAttachment($request, $attachment);
            }
            $locked = LaboratoryAttachment::query()->lockForUpdate()->findOrFail($attachment->id);
            $locked->update(['removed_at' => now()]);
            app(AuditLogger::class)->log($request, 'removed', 'laboratory_attachments', 'Removed attachment '.$attachment->id.'. '.$request->input('reason', ''));
        }));
        try {
            $this->storage->purge($attachment->fresh());
        } catch (\Throwable $error) {
            report($error);
        }

        return response()->noContent();
    }
}
