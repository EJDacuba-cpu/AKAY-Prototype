<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * RHU visit queue. A row is one patient visit, not a registration or a
 * clinical record. closed_at IS NULL means the visit is still active, and the
 * partial unique index allows one active visit per patient per RHU. Additive:
 * no existing table is altered.
 */
return new class extends Migration
{
    private const SOURCE_RULE = "source IN ('referral', 'walk_in') AND (source = 'walk_in' OR referral_id IS NOT NULL)";

    public function up(): void
    {
        Schema::create('rhu_visit_queue_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rural_health_unit_id')->constrained()->restrictOnDelete();
            $table->foreignId('patient_id')->constrained()->restrictOnDelete();
            $table->foreignId('referral_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('source', 20);
            $table->string('status', 30)->default('waiting');
            $table->timestamp('checked_in_at');
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('checked_in_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('check_in_key', 100);
            $table->timestamps();

            $table->unique(['rural_health_unit_id', 'check_in_key'], 'rhu_visit_queue_entries_key_unique');
            $table->index(['rural_health_unit_id', 'closed_at', 'checked_in_at'], 'rhu_visit_queue_entries_listing_idx');
        });

        DB::statement('CREATE UNIQUE INDEX rhu_visit_queue_entries_active_patient_unique ON rhu_visit_queue_entries (rural_health_unit_id, patient_id) WHERE closed_at IS NULL');

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE public.rhu_visit_queue_entries ADD CONSTRAINT rhu_visit_queue_entries_source_check CHECK ('.self::SOURCE_RULE.')');
            DB::statement('ALTER TABLE public.rhu_visit_queue_entries ENABLE ROW LEVEL SECURITY');
        } elseif (DB::getDriverName() === 'sqlite') {
            $rule = str_replace(['source', 'referral_id'], ['NEW.source', 'NEW.referral_id'], self::SOURCE_RULE);
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::unprepared("CREATE TRIGGER rhu_visit_queue_entries_source_{$event} BEFORE {$event} ON rhu_visit_queue_entries WHEN NOT ({$rule}) BEGIN SELECT RAISE(ABORT, 'Invalid visit source'); END");
            }
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::statement("DROP TRIGGER IF EXISTS rhu_visit_queue_entries_source_{$event}");
            }
        }
        Schema::dropIfExists('rhu_visit_queue_entries');
    }
};
