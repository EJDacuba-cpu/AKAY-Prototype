<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Midwives stock BHC medicine inventory. Defaults now include inventory.manage;
 * backfill existing midwife accounts whose stored permissions still omit it.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->where('staff_role', 'midwife')
            ->orderBy('id')
            ->chunkById(100, function ($rows): void {
                foreach ($rows as $row) {
                    if ($row->permissions === null) {
                        // Null means ActionPermissions::home() follows role defaults.
                        continue;
                    }

                    $permissions = json_decode($row->permissions, true);
                    if (! is_array($permissions)) {
                        continue;
                    }

                    if (in_array('inventory.manage', $permissions, true)) {
                        continue;
                    }

                    $next = array_values(array_unique([
                        ...$permissions,
                        'inventory.view',
                        'inventory.manage',
                    ]));

                    DB::table('users')->where('id', $row->id)->update([
                        'permissions' => json_encode($next),
                    ]);
                }
            });
    }

    public function down(): void
    {
        // Do not revoke a duty that may have been granted intentionally after this migration.
    }
};
