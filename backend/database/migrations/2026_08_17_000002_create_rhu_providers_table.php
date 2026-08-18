<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * DOC-BACKEND / DOC-20 / DOC-21 / DOC-22 - the RHU provider roster.
 *
 * Doctor availability previously existed only in one browser's localStorage,
 * so a BHW and an RHU never saw the same roster. This table makes the RHU the
 * single server-side source of record (DOC-15).
 *
 * DOC-15a-V - binding: this table has NO is_default, is_fallback, is_covering,
 * priority_order or equivalent column, and must not gain one. DOC-15a forbids
 * designating any provider as an automatic replacement; a convenience default
 * column would reintroduce that rule through the schema. Coverage is expressed
 * only as free-text `remarks` (DOC-22) - data the RHU writes, never a system
 * rule.
 *
 * DOC-19 - the available/total aggregate is COMPUTED at read time. There is
 * deliberately no stored counter column: the aggregate gates referral
 * submission under DOC-14, and a drifted counter would either block valid
 * referrals (REL-01) or admit blocked ones.
 *
 * DOC-02 - the RHU currently has two GPs. That is evidence about today's
 * roster, not a schema constraint: no provider count is hard-coded and no
 * named provider is seeded. The RHU adds its own.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rhu_providers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('rural_health_unit_id')
                ->constrained('rural_health_units')
                ->cascadeOnDelete();
            $table->string('name');                       // DOC-20
            $table->string('specialization')->nullable(); // DOC-21 (stored; DOC-09 filtering is FUTURE SCOPE)
            $table->string('availability_status')->default('Available');
            $table->text('remarks')->nullable();          // DOC-22
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(
                ['rural_health_unit_id', 'is_active', 'availability_status'],
                'rhu_providers_rhu_active_status_idx'
            );
        });

        // Partial unique index: a name may be reused after deactivation, but an
        // RHU cannot hold two active providers with the same name. Both
        // PostgreSQL and SQLite support partial indexes; the schema builder has
        // no API for the WHERE clause, so this is raw on purpose.
        DB::statement(
            'CREATE UNIQUE INDEX rhu_providers_rhu_active_name_unique '
            .'ON rhu_providers (rural_health_unit_id, name) WHERE is_active = true'
        );

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            "ALTER TABLE public.rhu_providers ADD CONSTRAINT rhu_providers_availability_status_check "
            ."CHECK (availability_status IN ('Available', 'Unavailable'))"
        );

        // Phase 2B (docs/database-exposure-containment.md) enabled RLS on every
        // public table that existed when it ran, with zero policies, as
        // deny-by-default for non-exempt roles. That migration was
        // catalog-driven at its own run time, so a table created afterwards
        // does not inherit the posture. Enabling it here keeps rhu_providers
        // consistent with every other public table rather than leaving it as
        // the single un-contained one.
        //
        // Safe now for the same reason it was safe then: Laravel connects as
        // the table owner, which PostgreSQL exempts from RLS, so this changes
        // nothing the application can see. No policy is created - "RLS on,
        // zero policies" is the intended terminal state for the phase.
        DB::statement('ALTER TABLE public.rhu_providers ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('rhu_providers');
    }
};
