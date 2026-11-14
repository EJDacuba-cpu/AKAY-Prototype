<?php

namespace App\Services;

use App\Models\HealthRecord;
use App\Models\RhuServiceUsageReconciliation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Creates pending RHU service-usage reconciliation rows from a finalized
 * consultation and confirms stock deduction later. Never deducts stock here.
 */
class RhuServiceUsageService
{
    private const ESSENTIAL_NON_VACCINE = ['newborn screening'];

    public function __construct(
        private readonly MedicineStockService $medicineStock,
        private readonly FacilityAccessService $facilityAccess,
        private readonly AuditLogger $auditLogger,
    ) {}

    /**
     * Idempotently create pending reconciliation rows for a finalized RHU ITR.
     * Safe to call on finalize retries — unique on (health_record_id, clinical_source_key).
     */
    public function syncPendingFromRecord(HealthRecord $record): void
    {
        if (! $record->isRhuItrV1() || ! $record->finalized_at) {
            return;
        }

        $rhuId = (int) $record->rural_health_unit_id;
        if ($rhuId <= 0) {
            return;
        }

        $selected = $record->monitoring_data['selectedPrograms']
            ?? $record->monitoring_data['selected_programs']
            ?? [];
        if (! is_array($selected)) {
            $selected = [];
        }
        $selectedSet = array_fill_keys(array_map('strval', $selected), true);

        $rows = [];
        if (isset($selectedSet['EPI'])) {
            foreach ($this->epiRowsFromRecord($record) as $row) {
                $rows[$row['clinical_source_key']] = $row;
            }
        }

        $manual = $record->monitoring_data['serviceUsages'] ?? [];
        if (is_array($manual)) {
            foreach ($manual as $entry) {
                if (! is_array($entry)) {
                    continue;
                }
                $normalized = $this->normalizeManualEntry($entry, $selectedSet);
                if ($normalized === null) {
                    continue;
                }
                $rows[$normalized['clinical_source_key']] = $normalized;
            }
        }

        foreach ($rows as $row) {
            RhuServiceUsageReconciliation::query()->firstOrCreate(
                [
                    'health_record_id' => $record->id,
                    'clinical_source_key' => $row['clinical_source_key'],
                ],
                [
                    'patient_id' => $record->patient_id,
                    'rural_health_unit_id' => $rhuId,
                    'service_program' => $row['service_program'],
                    'item_description' => $row['item_description'],
                    'quantity' => $row['quantity'],
                    'unit' => $row['unit'],
                    'administered_at' => $row['administered_at'],
                    'note' => $row['note'],
                    'reconciliation_status' => RhuServiceUsageReconciliation::STATUS_PENDING,
                ]
            );
        }
    }

    /**
     * Authorize and deduct RHU stock for one pending service-usage row.
     * Idempotent via operation key service-usage:{id}:reconcile.
     *
     * @param  array{medicine_id:int,quantity:int,unit?:?string,allocations?:array,override_reason?:?string}  $item
     */
    public function confirmStockUsage(Request $request, RhuServiceUsageReconciliation $usage, array $item): RhuServiceUsageReconciliation
    {
        $user = $request->user();
        abort_unless($user?->isRhu(), 403, 'Your current facility assignment does not permit this action.');
        ActionPermissions::ensure($user, 'items.dispense');

        return DB::transaction(function () use ($request, $usage, $item, $user) {
            /** @var RhuServiceUsageReconciliation $locked */
            $locked = RhuServiceUsageReconciliation::query()
                ->whereKey($usage->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->assertOwnedByUser($user, $locked);

            if ($locked->reconciliation_status === RhuServiceUsageReconciliation::STATUS_RECONCILED
                && $locked->inventory_transaction_id) {
                return $locked->fresh(['patient', 'healthRecord']);
            }

            abort_unless(
                $locked->isPending(),
                422,
                'This service usage is no longer pending reconciliation.'
            );

            $record = HealthRecord::query()
                ->whereKey($locked->health_record_id)
                ->lockForUpdate()
                ->firstOrFail();
            abort_unless($record->isRhuItrV1() && $record->finalized_at, 422, 'Service usage requires a finalized RHU consultation.');
            $this->facilityAccess->authorizeHealthRecord($user, $record);

            $result = $this->medicineStock->reconcileServiceUsage(
                $request,
                $record,
                $locked->id,
                $item
            );

            $locked->update([
                'reconciliation_status' => RhuServiceUsageReconciliation::STATUS_RECONCILED,
                'inventory_medicine_id' => (int) ($item['medicine_id'] ?? 0) ?: null,
                'inventory_transaction_id' => $result['transaction_id'] ?? null,
                'expiry_group_id' => $this->primaryExpiryGroupId($item),
                'reconciled_quantity' => (int) ($item['quantity'] ?? 0) ?: null,
                'confirmed_by' => $user->id,
                'confirmed_at' => now(),
            ]);

            $this->auditLogger->log(
                $request,
                'service_usage_reconciled',
                'medicines',
                implode('; ', [
                    "usage_id={$locked->id}",
                    "health_record_id={$locked->health_record_id}",
                    'inventory_transaction_id='.($result['transaction_id'] ?? ''),
                ]).'.'
            );

            return $locked->fresh(['patient', 'healthRecord']);
        });
    }

    /**
     * Mark a pending usage as needing catalog review (no stock deduction).
     */
    public function markNeedsReview(Request $request, RhuServiceUsageReconciliation $usage, ?string $note = null): RhuServiceUsageReconciliation
    {
        $user = $request->user();
        abort_unless($user?->isRhu(), 403, 'Your current facility assignment does not permit this action.');
        ActionPermissions::ensure($user, 'items.dispense');

        return DB::transaction(function () use ($usage, $user, $note) {
            $locked = RhuServiceUsageReconciliation::query()
                ->whereKey($usage->id)
                ->lockForUpdate()
                ->firstOrFail();
            $this->assertOwnedByUser($user, $locked);
            abort_unless($locked->isPending(), 422, 'This service usage is no longer pending reconciliation.');

            $locked->update([
                'reconciliation_status' => RhuServiceUsageReconciliation::STATUS_NEEDS_REVIEW,
                'note' => $note !== null && $note !== ''
                    ? mb_substr(trim($note), 0, 2000)
                    : $locked->note,
            ]);

            return $locked->fresh(['patient', 'healthRecord']);
        });
    }

    private function assertOwnedByUser(User $user, RhuServiceUsageReconciliation $usage): void
    {
        $rhuId = (int) $user->rural_health_unit_id;
        abort_unless(
            $rhuId > 0 && (int) $usage->rural_health_unit_id === $rhuId,
            403,
            'This resource is outside your assigned facility.'
        );
    }

    /**
     * @return list<array{clinical_source_key:string,service_program:string,item_description:string,quantity:int,unit:string,administered_at:?string,note:?string}>
     */
    private function epiRowsFromRecord(HealthRecord $record): array
    {
        $entries = $record->immunization_data['vaccineEntries']
            ?? $record->immunization_data['vaccine_entries']
            ?? [];
        if (! is_array($entries)) {
            return [];
        }

        $rows = [];
        foreach ($entries as $index => $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $name = trim((string) ($entry['vaccineName'] ?? $entry['vaccine_name'] ?? ''));
            if ($name === '' || $this->isEssentialNonVaccine($name)) {
                continue;
            }
            $dose = trim((string) ($entry['dose'] ?? ''));
            $dateGiven = $this->dateOnly($entry['dateGiven'] ?? $entry['date_given'] ?? null);
            if ($dateGiven === null) {
                continue;
            }
            $timeGiven = trim((string) ($entry['timeGiven'] ?? $entry['time_given'] ?? ''));
            $key = $this->epiSourceKey($name, $dose, $dateGiven, $timeGiven, (int) $index);
            $label = trim($name.($dose !== '' ? ' '.$dose : ''));
            $rows[] = [
                'clinical_source_key' => $key,
                'service_program' => 'EPI',
                'item_description' => mb_substr($label, 0, 255),
                'quantity' => 1,
                'unit' => 'dose',
                'administered_at' => $dateGiven,
                'note' => null,
            ];
        }

        return $rows;
    }

    /**
     * @param  array<string, bool>  $selectedSet
     * @return array{clinical_source_key:string,service_program:string,item_description:string,quantity:int,unit:string,administered_at:?string,note:?string}|null
     */
    private function normalizeManualEntry(array $entry, array $selectedSet): ?array
    {
        $program = trim((string) ($entry['serviceProgram'] ?? $entry['service_program'] ?? ''));
        if (! in_array($program, RhuServiceUsageReconciliation::PROGRAMS, true)) {
            return null;
        }
        if ($program === 'EPI') {
            // EPI rows come from immunization_data only — reject client-fabricated EPI keys.
            return null;
        }
        if (! isset($selectedSet[$program])) {
            return null;
        }

        $id = trim((string) ($entry['id'] ?? ''));
        $description = trim((string) ($entry['itemDescription'] ?? $entry['item_description'] ?? ''));
        $quantity = filter_var($entry['quantity'] ?? null, FILTER_VALIDATE_INT);
        $unit = trim((string) ($entry['unit'] ?? ''));
        if ($id === '' || $description === '' || ! $quantity || $quantity < 1 || $unit === '') {
            return null;
        }

        $administered = $this->dateOnly($entry['usedAt'] ?? $entry['used_at'] ?? $entry['administeredAt'] ?? null);
        $note = trim((string) ($entry['note'] ?? ''));

        return [
            'clinical_source_key' => 'manual:'.mb_substr($id, 0, 160),
            'service_program' => $program,
            'item_description' => mb_substr($description, 0, 255),
            'quantity' => min($quantity, 2147483647),
            'unit' => mb_substr($unit, 0, 50),
            'administered_at' => $administered,
            'note' => $note !== '' ? mb_substr($note, 0, 2000) : null,
        ];
    }

    private function epiSourceKey(string $name, string $dose, string $dateGiven, string $timeGiven, int $index): string
    {
        $fingerprint = strtolower($name).'|'.strtolower($dose).'|'.$dateGiven.'|'.$timeGiven.'|'.$index;

        return 'epi:'.substr(hash('sha256', $fingerprint), 0, 40);
    }

    private function isEssentialNonVaccine(string $name): bool
    {
        return in_array(strtolower(trim($name)), self::ESSENTIAL_NON_VACCINE, true);
    }

    private function dateOnly(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $text = trim((string) $value);
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $text, $match)) {
            return $match[1];
        }

        return null;
    }

    private function primaryExpiryGroupId(array $item): ?int
    {
        $allocations = $item['allocations'] ?? null;
        if (! is_array($allocations) || $allocations === []) {
            return null;
        }
        $first = $allocations[0]['expiry_group_id'] ?? null;
        $id = filter_var($first, FILTER_VALIDATE_INT);

        return $id && $id > 0 ? $id : null;
    }

    /**
     * Validate client-provided serviceUsages on finalize (manual programs only).
     *
     * @param  mixed  $entries
     * @param  list<string>  $selectedPrograms
     */
    public function assertValidFinalizePayload(mixed $entries, array $selectedPrograms): void
    {
        if ($entries === null) {
            return;
        }
        if (! is_array($entries)) {
            throw ValidationException::withMessages([
                'monitoring_data.serviceUsages' => ['Service usages must be a list.'],
            ]);
        }
        if (count($entries) > 50) {
            throw ValidationException::withMessages([
                'monitoring_data.serviceUsages' => ['Too many service usage entries.'],
            ]);
        }

        $selectedSet = array_fill_keys(array_map('strval', $selectedPrograms), true);
        $seen = [];
        foreach ($entries as $index => $entry) {
            if (! is_array($entry)) {
                throw ValidationException::withMessages([
                    "monitoring_data.serviceUsages.$index" => ['Invalid service usage entry.'],
                ]);
            }
            // Reject stock-tampering fields from clients.
            foreach (['inventoryMedicineId', 'inventory_medicine_id', 'inventoryTransactionId', 'reconciliationStatus', 'confirmedBy'] as $forbidden) {
                if (array_key_exists($forbidden, $entry)) {
                    throw ValidationException::withMessages([
                        "monitoring_data.serviceUsages.$index.$forbidden" => ['This field is not accepted from the client.'],
                    ]);
                }
            }
            $program = trim((string) ($entry['serviceProgram'] ?? $entry['service_program'] ?? ''));
            if ($program === 'EPI') {
                throw ValidationException::withMessages([
                    "monitoring_data.serviceUsages.$index.serviceProgram" => ['EPI usage is derived from vaccine tracking, not entered here.'],
                ]);
            }
            if (! in_array($program, RhuServiceUsageReconciliation::PROGRAMS, true)) {
                throw ValidationException::withMessages([
                    "monitoring_data.serviceUsages.$index.serviceProgram" => ['Select Maternal, Family Planning, or Nutrition.'],
                ]);
            }
            if (! isset($selectedSet[$program])) {
                throw ValidationException::withMessages([
                    "monitoring_data.serviceUsages.$index.serviceProgram" => ['That health service was not selected for this consultation.'],
                ]);
            }
            $id = trim((string) ($entry['id'] ?? ''));
            if ($id === '' || isset($seen[$id])) {
                throw ValidationException::withMessages([
                    "monitoring_data.serviceUsages.$index.id" => ['Each service usage needs a distinct id.'],
                ]);
            }
            $seen[$id] = true;
            $description = trim((string) ($entry['itemDescription'] ?? $entry['item_description'] ?? ''));
            if ($description === '') {
                throw ValidationException::withMessages([
                    "monitoring_data.serviceUsages.$index.itemDescription" => ['Enter the item that was used.'],
                ]);
            }
            $quantity = filter_var($entry['quantity'] ?? null, FILTER_VALIDATE_INT);
            if (! $quantity || $quantity < 1) {
                throw ValidationException::withMessages([
                    "monitoring_data.serviceUsages.$index.quantity" => ['Quantity must be a whole number of at least 1.'],
                ]);
            }
            $unit = trim((string) ($entry['unit'] ?? ''));
            if ($unit === '') {
                throw ValidationException::withMessages([
                    "monitoring_data.serviceUsages.$index.unit" => ['Enter the unit.'],
                ]);
            }
        }
    }
}
