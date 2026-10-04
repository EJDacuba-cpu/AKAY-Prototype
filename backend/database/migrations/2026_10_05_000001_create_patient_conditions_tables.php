<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Conditions the RHU has confirmed for a patient, with an append-only status
 * history. BHC never writes these; BHC monitoring links to one. Existing
 * condition_monitorings rows stay unlinked (Legacy BHC Monitoring). See
 * docs/superpowers/specs/2026-10-05-clinical-boundary-condition-confirmation-design.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_conditions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->string('condition_name', 150);
            // Same normalization as condition_monitorings.condition_identity.
            $table->string('condition_identity', 160);
            // under_evaluation|active|controlled|resolved|ruled_out
            $table->string('status', 20);
            // The RHU user who last set the status, and when.
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at');
            $table->string('source_type', 20); // rhu_feedback|rhu_record
            $table->unsignedBigInteger('source_id');
            $table->timestamp('bhc_monitoring_recommended_at')->nullable();
            $table->foreignId('bhc_monitoring_recommended_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['patient_id', 'status'], 'patient_conditions_patient_status_idx');
        });

        // One open (under_evaluation|active|controlled) row per patient and
        // condition, guaranteed by the database. Partial indexes work on
        // PostgreSQL and SQLite; the schema builder cannot express the WHERE.
        DB::statement(
            'CREATE UNIQUE INDEX patient_conditions_one_open_idx '
            .'ON patient_conditions (patient_id, condition_identity) '
            ."WHERE status IN ('under_evaluation', 'active', 'controlled')"
        );

        Schema::create('patient_condition_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_condition_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->string('note', 500)->nullable();
            $table->string('source_type', 20); // rhu_feedback|rhu_record
            $table->unsignedBigInteger('source_id');
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('changed_at');
        });

        // null = Legacy BHC Monitoring (started before RHU confirmation existed).
        Schema::table('condition_monitorings', function (Blueprint $table) {
            $table->foreignId('patient_condition_id')->nullable()->constrained('patient_conditions')->nullOnDelete();
        });
        $this->restoreMonitoringPartialIndex();

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        $statuses = "'under_evaluation', 'active', 'controlled', 'resolved', 'ruled_out'";
        DB::statement("ALTER TABLE public.patient_conditions ADD CONSTRAINT patient_conditions_status_check CHECK (status IN ($statuses))");
        DB::statement("ALTER TABLE public.patient_conditions ADD CONSTRAINT patient_conditions_source_type_check CHECK (source_type IN ('rhu_feedback', 'rhu_record'))");
        DB::statement("ALTER TABLE public.patient_condition_events ADD CONSTRAINT patient_condition_events_to_status_check CHECK (to_status IN ($statuses))");
        DB::statement("ALTER TABLE public.patient_condition_events ADD CONSTRAINT patient_condition_events_source_type_check CHECK (source_type IN ('rhu_feedback', 'rhu_record'))");
        foreach (['patient_conditions', 'patient_condition_events'] as $table) {
            DB::statement("ALTER TABLE public.$table ENABLE ROW LEVEL SECURITY");
        }
    }

    public function down(): void
    {
        Schema::table('condition_monitorings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('patient_condition_id');
        });
        $this->restoreMonitoringPartialIndex();
        Schema::dropIfExists('patient_condition_events');
        Schema::dropIfExists('patient_conditions');
    }

    /**
     * SQLite alters a table by rebuilding it, and the rebuild keeps only the
     * plain columns of an index, dropping its WHERE clause. Without this the
     * "one active record per patient and condition" index would silently turn
     * into "one record ever". PostgreSQL alters in place and needs nothing.
     */
    private function restoreMonitoringPartialIndex(): void
    {
        if (DB::connection()->getDriverName() !== 'sqlite') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS condition_monitorings_one_active_idx');
        DB::statement(
            'CREATE UNIQUE INDEX condition_monitorings_one_active_idx '
            .'ON condition_monitorings (patient_id, condition_identity) '
            ."WHERE status = 'active'"
        );
    }
};
