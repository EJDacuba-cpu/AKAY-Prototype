<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Explicit close of a Nutrition Care episode. Enrollment itself stays derived
 * from finalized Nutrition health records; this row ends the episode that
 * started on started_health_record_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('nutrition_care_closures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('started_health_record_id')->unique()->constrained('health_records')->cascadeOnDelete();
            $table->string('reason', 32);
            $table->date('closed_on');
            $table->text('note')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE public.nutrition_care_closures ENABLE ROW LEVEL SECURITY');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('nutrition_care_closures');
    }
};
