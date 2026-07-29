<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('health_records', 'monitoring_data')) {
            DB::table('health_records')
                ->select(['id', 'monitoring_data'])
                ->whereNotNull('monitoring_data')
                ->orderBy('id')
                ->chunkById(200, function ($records): void {
                    foreach ($records as $record) {
                        $monitoringData = is_string($record->monitoring_data)
                            ? json_decode($record->monitoring_data, true)
                            : (array) $record->monitoring_data;

                        if (! is_array($monitoringData)) {
                            continue;
                        }

                        $hasReason = array_key_exists('followUpReason', $monitoringData)
                            || array_key_exists('follow_up_reason', $monitoringData);
                        if (! $hasReason) {
                            continue;
                        }

                        unset(
                            $monitoringData['followUpReason'],
                            $monitoringData['follow_up_reason']
                        );

                        DB::table('health_records')
                            ->where('id', $record->id)
                            ->update([
                                'monitoring_data' => json_encode(
                                    $monitoringData,
                                    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
                                ),
                            ]);
                    }
                }, 'id');
        }

        if (Schema::hasColumn('follow_up_tasks', 'reason')) {
            Schema::table('follow_up_tasks', function (Blueprint $table): void {
                $table->dropColumn('reason');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasColumn('follow_up_tasks', 'reason')) {
            Schema::table('follow_up_tasks', function (Blueprint $table): void {
                $table->string('reason', 255)->nullable()->after('notes');
            });
        }
    }
};
