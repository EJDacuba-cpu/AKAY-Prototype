<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * users.role holds the account type. Its BHC value was "bhw", which reads as Barangay Health Worker and collides
 * with staff_role "bhw"; its RHU value was "rhu_staff". They become "bhc" and "rhu". Postgres functions compare
 * p_role / u.role against these literals, so their role comparisons (and only those) are rewritten in place.
 */
return new class extends Migration
{
    // `role` or `p_role`, optionally table-qualified, never `staff_role` or `facility_type`.
    private const ROLE_COMPARISON = '/\b((?:[a-z_][a-z0-9_]*\.)?(?:p_)?role\s*=\s*)\'(%s)\'/i';

    private const UP = ['bhw' => 'bhc', 'rhu_staff' => 'rhu'];

    public function up(): void
    {
        foreach (self::UP as $old => $new) {
            DB::table('users')->where('role', $old)->update(['role' => $new]);
        }
        $this->rewriteFunctions(array_keys(self::UP), fn (string $sql) => $this->rewriteUp($sql));
    }

    public function down(): void
    {
        $this->rewriteFunctions(array_values(self::UP), fn (string $sql) => $this->rewriteDown($sql));
        foreach (self::UP as $old => $new) {
            DB::table('users')->where('role', $new)->update(['role' => $old]);
        }
    }

    public function rewriteUp(string $sql): string
    {
        return $this->rewrite($sql, self::UP);
    }

    public function rewriteDown(string $sql): string
    {
        return $this->rewrite($sql, array_flip(self::UP));
    }

    private function rewrite(string $sql, array $map): string
    {
        $pattern = sprintf(self::ROLE_COMPARISON, implode('|', array_map('preg_quote', array_keys($map))));

        return preg_replace_callback($pattern, fn (array $m) => $m[1]."'".$map[strtolower($m[2])]."'", $sql);
    }

    /** Re-creates every public function whose definition compares a role against one of `$values`. */
    private function rewriteFunctions(array $values, callable $rewrite): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        $pattern = sprintf(self::ROLE_COMPARISON, implode('|', $values));
        $functions = DB::select("SELECT p.oid, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'");
        foreach ($functions as $function) {
            if (preg_match($pattern, $function->definition)) {
                DB::unprepared($rewrite($function->definition));
            }
        }
    }
};
