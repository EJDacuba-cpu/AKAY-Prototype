<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a finalized consultation changed in the patient's background
 * (patients.medical_background), per
 * docs/superpowers/specs/2026-10-03-patient-background-tab-design.md.
 *
 * Shape: [{ section, source, before, after, revision, changedBy, changedAt }]
 * - one entry per section the save actually changed. Records are immutable, so
 * this is the background's audit trail; the Patient Background tab reads it
 * through GET /patients/{id}/background-history rather than the record JSON,
 * which is why akay_health_record_json is not re-created here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            if (! Schema::hasColumn('health_records', 'background_changes')) {
                $table->json('background_changes')->nullable()->after('medical_history');
            }
        });
    }

    public function down(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            if (Schema::hasColumn('health_records', 'background_changes')) {
                $table->dropColumn('background_changes');
            }
        });
    }
};
