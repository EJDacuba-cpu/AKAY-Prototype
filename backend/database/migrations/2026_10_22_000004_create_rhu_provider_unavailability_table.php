<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Calendar exceptions for official RHU doctors.
 *
 * Manual Available/Unavailable stays on rhu_providers. These rows are
 * dated absences in Asia/Manila. A future row does not change today's
 * eligibility. Once a window starts, the doctor stays ineligible until
 * staff reconfirm Available after the window ends.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->timestamp('availability_status_set_at')->nullable()->after('availability_status');
        });

        Schema::create('rhu_provider_unavailability', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rhu_provider_id')
                ->constrained('rhu_providers')
                ->cascadeOnDelete();
            $table->date('local_date');
            $table->boolean('all_day')->default(true);
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(
                ['rhu_provider_id', 'local_date'],
                'rhu_provider_unavailability_provider_date_idx'
            );
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'ALTER TABLE public.rhu_provider_unavailability '
            .'ADD CONSTRAINT rhu_provider_unavailability_window_check CHECK ('
            .'(all_day = true AND start_time IS NULL AND end_time IS NULL) OR '
            .'(all_day = false AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)'
            .')'
        );
        DB::statement('ALTER TABLE public.rhu_provider_unavailability ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('rhu_provider_unavailability');

        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->dropColumn('availability_status_set_at');
        });
    }
};
