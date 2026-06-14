<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('health_records', function (Blueprint $table) {
            if (! Schema::hasColumn('health_records', 'maternal_data')) {
                $table->json('maternal_data')->nullable()->after('category');
            }

            if (! Schema::hasColumn('health_records', 'immunization_data')) {
                $table->json('immunization_data')->nullable()->after('maternal_data');
            }

            if (! Schema::hasColumn('health_records', 'monitoring_data')) {
                $table->json('monitoring_data')->nullable()->after('immunization_data');
            }

            if (! Schema::hasColumn('health_records', 'needs_referral')) {
                $table->boolean('needs_referral')->nullable()->after('monitoring_data');
            }
        });

        Schema::table('referrals', function (Blueprint $table) {
            if (! Schema::hasColumn('referrals', 'health_record_id')) {
                $table->foreignId('health_record_id')
                    ->nullable()
                    ->after('patient_id')
                    ->constrained('health_records')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('referrals', function (Blueprint $table) {
            if (Schema::hasColumn('referrals', 'health_record_id')) {
                $table->dropConstrainedForeignId('health_record_id');
            }
        });

        Schema::table('health_records', function (Blueprint $table) {
            foreach (['maternal_data', 'immunization_data', 'monitoring_data', 'needs_referral'] as $column) {
                if (Schema::hasColumn('health_records', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
