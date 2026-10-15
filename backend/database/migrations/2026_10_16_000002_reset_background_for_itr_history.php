<?php

use App\Models\Patient;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One-time cleanup before the ITR patient history reshapes patients.medical_background
 * (docs/superpowers/specs/2026-10-16-itr-patient-history-design.md).
 *
 * Every row at this point is test data, so the old free-text sections are dropped
 * rather than converted: allergies, hospitalizations, surgeries, familyHistory,
 * personalSocial and every updatedAt date. Only the patient-reported entries of
 * currentDiseases are kept (consultation-derived ones go), and revisions are left
 * alone so the base-revision checks keep working. The now-meaningless
 * health_records.background_changes audit entries are cleared.
 *
 * Portable on purpose (Eloquent + DB facade, no JSON SQL operators) - it runs on
 * both PostgreSQL and the SQLite used by the tests.
 */
return new class extends Migration
{
    private const DROPPED_KEYS = [
        'allergies', 'hospitalizations', 'surgeries', 'familyHistory', 'personalSocial', 'updatedAt',
    ];

    public function up(): void
    {
        Patient::query()->whereNotNull('medical_background')->chunkById(200, function ($patients) {
            foreach ($patients as $patient) {
                $background = $patient->medical_background;
                if (! is_array($background) || $background === []) {
                    continue;
                }

                $diseases = $background['currentDiseases'] ?? null;
                if (is_array($diseases)) {
                    $background['currentDiseases'] = array_values(array_filter(
                        $diseases,
                        fn ($disease) => is_array($disease) && ($disease['source'] ?? null) === 'Patient-reported'
                    ));
                }

                foreach (self::DROPPED_KEYS as $key) {
                    unset($background[$key]);
                }

                // Query builder, not save(): the cleanup must not touch updated_at.
                DB::table('patients')->where('id', $patient->id)->update([
                    'medical_background' => json_encode($background),
                ]);
            }
        });

        DB::table('health_records')->whereNotNull('background_changes')->update(['background_changes' => null]);
    }

    /**
     * No-op: the removed content was test data and is not recoverable.
     */
    public function down(): void
    {
    }
};
