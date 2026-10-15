<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-visit history details of the ITR patient history, per
 * docs/superpowers/specs/2026-10-16-itr-patient-history-design.md.
 *
 * - informant:        { relation, name, patientId } - who gave the history this visit.
 * - similar_illness:  { answer, who, note } - whether anyone close has a similar illness.
 *
 * Both belong to the visit, not the patient, so they live on the record (records
 * are immutable once saved) rather than in patients.medical_background.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            if (! Schema::hasColumn('health_records', 'informant')) {
                $table->json('informant')->nullable()->after('background_changes');
            }
            if (! Schema::hasColumn('health_records', 'similar_illness')) {
                $table->json('similar_illness')->nullable()->after('informant');
            }
        });
    }

    public function down(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            foreach (['informant', 'similar_illness'] as $column) {
                if (Schema::hasColumn('health_records', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
