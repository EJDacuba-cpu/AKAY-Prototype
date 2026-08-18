<?php

use App\Models\Referral;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * URG-01..URG-06 (revised) - replace the retired four-value urgency scheme
 * (Low / Normal / Urgent / Emergency) with the two-value attention scheme
 * (Routine / Priority).
 *
 * The retired scheme is REPLACED, not patched: there is no legacy_urgency_level
 * column, no value mapping, and no compatibility alias (URG-06 revised).
 *
 * URG-DATA-RESET / TEST-RESET-SCOPE (Option A, project-owner locked):
 * existing referral rows are test data and are purged rather than migrated.
 * Two of the confirmed defects in the retired scheme make a value-by-value
 * backfill impossible to do honestly:
 *
 *   - the frontend normaliser matched "Non-Urgent" with a substring test for
 *     "urgent", so stored 'Urgent' rows are an unresolvable mix of genuinely
 *     urgent and routine referrals;
 *   - two submission paths collapsed 'Emergency' to 'Normal', so stored
 *     'Normal' rows may be downgraded emergent referrals.
 *
 * Neither is distinguishable from urgency_level alone, so any mapping rule
 * would migrate the corruption forward under a new name.
 *
 * SCOPE BOUNDARY - TEST-RESET-SCOPE, binding:
 * deletes ONLY feedback, referral_updates and referrals. Patients, health
 * records, drafts, users, facilities, medicines, inventory transactions,
 * follow-up tasks, providers and audit logs are NOT touched. Extending this
 * deletion requires separate authorisation.
 *
 * Two documented, intentional side effects:
 *   - audit_logs keeps rows referencing deleted referrals (no FK). Correct for
 *     an audit trail under SCR-06 - do not clean.
 *   - notifications.related_referral_id is nullOnDelete, so referral
 *     notifications survive with a null link. notifications is outside this
 *     migration's authorised delete scope and is deliberately left alone.
 *
 * PRECONDITION - a Supabase backup must exist before this runs (plan 5.1).
 * ORDERING - every application write site must already emit 'Routine' /
 * 'Priority' before this lands, or the CHECK constraint rejects live
 * submissions (plan 8, critical dependency).
 */
return new class extends Migration
{
    private const CHECK_CONSTRAINT = 'referrals_urgency_level_check';

    public function up(): void
    {
        DB::transaction(function (): void {
            // STEP 1 - purge referral test data, child-first.
            // The FKs already cascade; the deletes are explicit and separate so
            // each table reports its own count. A destructive step should be
            // observable rather than implied.
            $feedback = DB::table('feedback')->delete();
            $updates = DB::table('referral_updates')->delete();
            $referrals = DB::table('referrals')->delete();

            $this->report("URG-DATA-RESET: deleted {$feedback} feedback, {$updates} referral_updates, {$referrals} referrals.");

            // STEP 2 - new default. ->change() rather than raw ALTER COLUMN:
            // the test suite runs on SQLite, which cannot ALTER COLUMN, and
            // Laravel's schema builder rebuilds the table instead.
            Schema::table('referrals', function (Blueprint $table): void {
                $table->string('urgency_level')
                    ->default(Referral::ATTENTION_ROUTINE)
                    ->change();
            });

            // STEP 3 - enforce the two-value set at the database.
            // Applied after the purge: PostgreSQL validates existing rows when
            // the constraint is added, and retired values would fail it.
            $this->addCheckConstraint();
        });
    }

    public function down(): void
    {
        DB::transaction(function (): void {
            $this->dropCheckConstraint();

            Schema::table('referrals', function (Blueprint $table): void {
                $table->string('urgency_level')->default('Normal')->change();
            });
        });

        // Purged rows are NOT restored. Recovery is via the Supabase backup
        // taken in plan 5.1, not via this migration.
    }

    private function addCheckConstraint(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        $allowed = collect(Referral::ATTENTION_LEVELS)
            ->map(fn (string $level): string => "'".$level."'")
            ->implode(', ');

        DB::statement(
            'ALTER TABLE referrals ADD CONSTRAINT '.self::CHECK_CONSTRAINT
            .' CHECK (urgency_level IN ('.$allowed.'))'
        );
    }

    private function dropCheckConstraint(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'ALTER TABLE referrals DROP CONSTRAINT IF EXISTS '.self::CHECK_CONSTRAINT
        );
    }

    private function report(string $message): void
    {
        if (app()->runningInConsole()) {
            echo $message.PHP_EOL;
        }
    }
};
