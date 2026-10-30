<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medicines', fn (Blueprint $table) => $table->string('item_type', 30)->default('medicine'));
        Schema::create('medicine_expiry_groups', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('medicine_id')->constrained()->restrictOnDelete();
            $table->date('expiration_date')->nullable();
            $table->boolean('expiry_not_applicable')->default(false);
            $table->integer('available_quantity')->default(0);
            $table->integer('quarantined_quantity')->default(0);
            $table->timestamps();
            $table->unique(['medicine_id', 'expiration_date'], 'medicine_expiry_group_date_unique');
        });
        Schema::create('medicine_inventory_allocations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('transaction_id')->constrained('medicine_inventory_transactions')->restrictOnDelete();
            $table->foreignId('expiry_group_id')->constrained('medicine_expiry_groups')->restrictOnDelete();
            foreach (['available', 'quarantined'] as $pool) {
                $table->integer($pool.'_before');
                $table->integer($pool.'_delta');
                $table->integer($pool.'_after');
            }
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['transaction_id', 'expiry_group_id'], 'medicine_allocation_transaction_group_unique');
        });
        DB::statement('CREATE UNIQUE INDEX medicine_expiry_group_na_unique ON medicine_expiry_groups(medicine_id) WHERE expiry_not_applicable = '.(DB::getDriverName() === 'pgsql' ? 'true' : '1'));
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared(file_get_contents(database_path('sql/medicine_expiry_group_constraints.sql')));
            DB::unprepared(file_get_contents(database_path('sql/medicine_expiry_group_operations.sql')));
        }
    }

    public function down(): void
    {
        if (DB::table('medicine_expiry_groups')->exists() || DB::table('medicine_inventory_allocations')->exists()
            || DB::table('medicine_inventory_transactions')->whereIn('transaction_type', ['quarantine', 'release', 'quarantine_disposal', 'physical_count'])->exists()) {
            throw new RuntimeException('Expiry group balances and posted audit history must be preserved; rollback is refused.');
        }
        if (DB::getDriverName() === 'pgsql') {
            // Restore frozen historical definitions, then the final discrepancy-aware batch.
            $original = require database_path('migrations/2026_07_21_000002_create_akay_inventory_functions.php');
            $method = new ReflectionMethod($original, 'functionSql');
            $sql = $method->invoke($original);
            // Preserve the current assignment-aware actor helper instead of restoring historical roles.
            $start = strpos($sql, 'CREATE OR REPLACE FUNCTION public.akay_inventory_opening_balance');
            DB::unprepared(substr($sql, $start));
            DB::unprepared(file_get_contents(database_path('sql/consultation_dispense_reconciliation.sql')));
            DB::statement('DROP FUNCTION public.akay_inventory_group_operation(bigint,bigint,text,bigint,text,integer,text,text,jsonb)');
            DB::statement('ALTER TABLE public.medicines DROP CONSTRAINT medicines_item_type_check');
            DB::statement('ALTER TABLE public.medicine_inventory_transactions DROP CONSTRAINT medicine_inventory_transactions_type_check');
            DB::statement("ALTER TABLE public.medicine_inventory_transactions ADD CONSTRAINT medicine_inventory_transactions_type_check CHECK (transaction_type IN ('opening_balance','restock','dispense','adjustment_in','adjustment_out','damaged_disposal','expired_disposal','correction'))");
            DB::statement('ALTER TABLE public.medicine_inventory_transactions DROP CONSTRAINT medicine_inventory_transactions_quantity_check');
            DB::statement("ALTER TABLE public.medicine_inventory_transactions ADD CONSTRAINT medicine_inventory_transactions_quantity_check CHECK (quantity_delta <> 0 AND quantity_before >= 0 AND quantity_after >= 0 AND discrepancy <= 0 AND (discrepancy = 0 OR transaction_type = 'dispense') AND quantity_before + quantity_delta = quantity_after + discrepancy)");
        }
        Schema::dropIfExists('medicine_inventory_allocations');
        Schema::dropIfExists('medicine_expiry_groups');
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP FUNCTION public.akay_inventory_group_guard()');
            DB::statement('DROP FUNCTION public.akay_inventory_allocation_guard()');
        }
        Schema::table('medicines', fn (Blueprint $table) => $table->dropColumn('item_type'));
    }
};
