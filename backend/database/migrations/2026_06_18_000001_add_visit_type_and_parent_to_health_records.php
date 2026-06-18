<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            if (!Schema::hasColumn('health_records', 'visit_type')) {
                $table->string('visit_type')->nullable()->index()->after('vital_signs');
            }

            if (!Schema::hasColumn('health_records', 'parent_health_record_id')) {
                $table
                    ->foreignId('parent_health_record_id')
                    ->nullable()
                    ->after('visit_type')
                    ->constrained('health_records')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            if (Schema::hasColumn('health_records', 'parent_health_record_id')) {
                $table->dropConstrainedForeignId('parent_health_record_id');
            }

            if (Schema::hasColumn('health_records', 'visit_type')) {
                $table->dropColumn('visit_type');
            }
        });
    }
};
