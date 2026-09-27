<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Removes the Hypertension / Diabetes program from stored data.
 *
 * The program never had its own column: its form lived in
 * health_records.monitoring_data and in the encrypted draft payload, so this
 * rewrites JSON instead of dropping schema. It is the one deliberate exception
 * to "health records are immutable after save" - every row at the time of the
 * removal was sample data. The draft cleanup is required, not cosmetic: the
 * draft sanitizer rejects unknown keys, so a draft still holding
 * hypertensionDiabeticData would no longer open.
 */
return new class extends Migration
{
    private const REMOVED_PROGRAMS = ['Hypertension', 'Diabetes'];

    private const REMOVED_CATEGORY = 'Hypertension / Diabetic Monitoring';

    private const REMOVED_KEYS = ['hypertensionDiabeticData', 'hypertension_diabetic_data'];

    // ConsultationPrograms::CLASSIFICATIONS after the removal, copied so this
    // migration keeps its meaning if that constant changes later.
    private const CLASSIFICATIONS = [
        'Maternal' => 'Maternal',
        'TB' => 'TB DOTS / TB Monitoring',
        'Family Planning' => 'Family Planning',
        'EPI' => 'Immunization',
    ];

    public function up(): void
    {
        $records = 0;
        DB::table('health_records')
            ->select(['id', 'category', 'monitoring_data', 'vital_signs'])
            ->chunkById(200, function ($rows) use (&$records): void {
                foreach ($rows as $row) {
                    $monitoring = $this->decode($row->monitoring_data);
                    $vitals = $this->decode($row->vital_signs);
                    $backfilled = $this->backfillBloodPressure($vitals ?? [], $monitoring ?? []);
                    [$cleaned, $category, $changed] = $this->clean($monitoring ?? [], $row->category);
                    $vitalsChanged = $backfilled !== ($vitals ?? []);

                    if (! $changed && ! $vitalsChanged) {
                        continue;
                    }

                    DB::table('health_records')->where('id', $row->id)->update([
                        'category' => $category,
                        'monitoring_data' => $monitoring === null ? null : $this->encode($cleaned),
                        ...($vitalsChanged ? ['vital_signs' => $this->encode($backfilled)] : []),
                    ]);
                    $records++;
                }
            });

        $drafts = 0;
        $undecryptable = 0;
        DB::table('health_record_drafts')
            ->select(['id', 'classification', 'encrypted_payload'])
            ->chunkById(200, function ($rows) use (&$drafts, &$undecryptable): void {
                foreach ($rows as $row) {
                    $payload = [];
                    if ($row->encrypted_payload !== null) {
                        try {
                            $payload = json_decode(Crypt::decryptString($row->encrypted_payload), true, flags: JSON_THROW_ON_ERROR);
                        } catch (Throwable) {
                            $undecryptable++;

                            continue;
                        }
                    }

                    [$cleaned, $classification, $changed] = $this->clean(is_array($payload) ? $payload : [], $row->classification);
                    if (! $changed) {
                        continue;
                    }

                    DB::table('health_record_drafts')->where('id', $row->id)->update([
                        'classification' => $classification,
                        'encrypted_payload' => $row->encrypted_payload === null
                            ? null
                            : Crypt::encryptString(json_encode($cleaned, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
                    ]);
                    $drafts++;
                }
            });

        Log::info('Removed the Hypertension / Diabetes program from stored data.', [
            'health_records_changed' => $records,
            'drafts_changed' => $drafts,
            'drafts_undecryptable' => $undecryptable,
        ]);
    }

    /** The removed values cannot be restored. */
    public function down(): void {}

    /**
     * @return array{0: array, 1: ?string, 2: bool} the cleaned data, the
     *                                             category to store, and whether anything changed
     */
    private function clean(array $data, ?string $category): array
    {
        $changed = false;

        foreach (self::REMOVED_KEYS as $key) {
            if (array_key_exists($key, $data)) {
                unset($data[$key]);
                $changed = true;
            }
        }

        if (is_array($data['selectedPrograms'] ?? null)) {
            $kept = array_values(array_diff($data['selectedPrograms'], self::REMOVED_PROGRAMS));
            if ($kept !== $data['selectedPrograms']) {
                $data['selectedPrograms'] = $kept;
                $changed = true;
            }
        }

        $primaryRemoved = in_array($data['primaryProgram'] ?? null, self::REMOVED_PROGRAMS, true);
        if ($primaryRemoved) {
            $data['primaryProgram'] = $data['selectedPrograms'][0] ?? null;
            $changed = true;
        }

        if (($data['selectedPrograms'] ?? null) === [] && ($data['consultationMode'] ?? null) === 'program') {
            $data['consultationMode'] = 'general';
            $changed = true;
        }

        $services = $data['visitPurpose']['services'] ?? null;
        if (is_array($services)) {
            $kept = array_values(array_diff($services, self::REMOVED_PROGRAMS));
            if ($kept !== $services) {
                $data['visitPurpose']['services'] = $kept === [] ? ['General'] : $kept;
                $changed = true;
            }
        }

        if ($category === self::REMOVED_CATEGORY || $primaryRemoved) {
            $next = self::CLASSIFICATIONS[$data['primaryProgram'] ?? ''] ?? 'General Consultation';
            if ($next !== $category) {
                $category = $next;
                $changed = true;
            }
        }

        return [$data, $category, $changed];
    }

    /** Copies a blob-only "120/80" reading into vital_signs; never overwrites. */
    private function backfillBloodPressure(array $vitals, array $monitoring): array
    {
        $bp = $monitoring['hypertensionDiabeticData']['bp']
            ?? $monitoring['hypertension_diabetic_data']['bp']
            ?? null;

        if (! is_string($bp) || filled($vitals['systolicBp'] ?? null) || filled($vitals['diastolicBp'] ?? null)) {
            return $vitals;
        }
        if (preg_match('/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/', $bp, $match) !== 1) {
            return $vitals;
        }

        return [...$vitals, 'systolicBp' => $match[1], 'diastolicBp' => $match[2]];
    }

    private function decode(mixed $json): ?array
    {
        if ($json === null) {
            return null;
        }
        $decoded = json_decode((string) $json, true);

        return is_array($decoded) ? $decoded : null;
    }

    /** An emptied object stays an object ({}), not a list ([]). */
    private function encode(array $data): string
    {
        return json_encode($data === [] ? new stdClass : $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
};
