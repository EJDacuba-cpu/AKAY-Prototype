<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const PERMISSION = 'conditions.confirm';

    public function up(): void
    {
        foreach (['users', 'facility_assignments'] as $table) {
            $this->rewrite($table, fn (array $permissions) => in_array(self::PERMISSION, $permissions, true)
                ? $permissions
                : [...$permissions, self::PERMISSION]);
        }
    }

    public function down(): void
    {
        foreach (['users', 'facility_assignments'] as $table) {
            $this->rewrite($table, fn (array $permissions) => array_values(array_diff($permissions, [self::PERMISSION])));
        }
    }

    /** Rewrites the JSON permission list of every row that holds `rhu.manage`. */
    private function rewrite(string $table, callable $change): void
    {
        DB::table($table)->whereNotNull('permissions')->orderBy('id')->each(function ($row) use ($table, $change): void {
            $permissions = json_decode($row->permissions, true);
            if (! is_array($permissions) || ! in_array('rhu.manage', $permissions, true)) {
                return;
            }
            $updated = $change($permissions);
            if ($updated !== $permissions) {
                DB::table($table)->where('id', $row->id)->update(['permissions' => json_encode($updated)]);
            }
        });
    }
};
