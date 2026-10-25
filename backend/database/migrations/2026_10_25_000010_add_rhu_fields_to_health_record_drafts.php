<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_record_drafts', function (Blueprint $table): void {
            $table->foreignId('rural_health_unit_id')
                ->nullable()
                ->after('barangay_health_center_id')
                ->constrained('rural_health_units')
                ->nullOnDelete();
            $table->foreignId('rhu_visit_id')
                ->nullable()
                ->after('rural_health_unit_id')
                ->constrained('rhu_visit_queue_entries')
                ->nullOnDelete();
        });

        Schema::table('health_record_drafts', function (Blueprint $table): void {
            $table->unsignedBigInteger('barangay_health_center_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('health_record_drafts', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('rhu_visit_id');
            $table->dropConstrainedForeignId('rural_health_unit_id');
        });
    }
};
