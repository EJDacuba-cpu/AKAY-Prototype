<?php

use App\Models\RhuProvider;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Official RHU Doctor accounts own roster identity. Availability stays on
 * rhu_providers and is still written only by authorized RHU staff.
 *
 * user_id is nullable so existing covering/unlinked roster rows survive.
 * One account may own at most one roster row. New official rows start
 * Unavailable and are never matched to covering rows by name: a shared
 * display name does not mean the same person. Covering-row uniqueness is
 * therefore limited to unlinked active names.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unique('user_id');
        });

        DB::statement('DROP INDEX IF EXISTS rhu_providers_rhu_active_name_unique');
        DB::statement(
            'CREATE UNIQUE INDEX rhu_providers_rhu_active_unlinked_name_unique '
            .'ON rhu_providers (rural_health_unit_id, name) WHERE is_active = true AND user_id IS NULL'
        );

        $now = now();

        $doctors = DB::table('users')
            ->where('role', User::ROLE_RHU)
            ->where('staff_role', 'doctor')
            ->where('status', User::STATUS_ACTIVE)
            ->whereNotNull('rural_health_unit_id')
            ->get(['id', 'name', 'rural_health_unit_id', 'created_by']);

        foreach ($doctors as $doctor) {
            if (DB::table('rhu_providers')->where('user_id', $doctor->id)->exists()) {
                continue;
            }

            DB::table('rhu_providers')->insert([
                'rural_health_unit_id' => $doctor->rural_health_unit_id,
                'user_id' => $doctor->id,
                'name' => $doctor->name,
                'availability_status' => RhuProvider::STATUS_UNAVAILABLE,
                'is_active' => true,
                'created_by' => $doctor->created_by,
                'updated_by' => $doctor->created_by,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS rhu_providers_rhu_active_unlinked_name_unique');

        Schema::table('rhu_providers', function (Blueprint $table) {
            $table->dropUnique(['user_id']);
            $table->dropConstrainedForeignId('user_id');
        });

        DB::statement(
            'CREATE UNIQUE INDEX rhu_providers_rhu_active_name_unique '
            .'ON rhu_providers (rural_health_unit_id, name) WHERE is_active = true'
        );
    }
};
