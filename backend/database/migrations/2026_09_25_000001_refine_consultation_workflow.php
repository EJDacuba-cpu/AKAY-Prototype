<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('consultation_events', fn (Blueprint $t) => $t->text('encrypted_changes')->nullable());
        Schema::table('medicines', fn (Blueprint $t) => $t->boolean('reconciliation_required')->default(false));
        Schema::table('medicine_inventory_transactions', fn (Blueprint $t) => $t->integer('discrepancy')->default(0));
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE public.medicine_inventory_transactions DROP CONSTRAINT medicine_inventory_transactions_quantity_check');
            DB::statement('ALTER TABLE public.medicine_inventory_transactions ADD CONSTRAINT medicine_inventory_transactions_quantity_check CHECK (quantity_delta <> 0 AND quantity_before >= 0 AND quantity_after >= 0 AND discrepancy <= 0 AND (discrepancy = 0 OR transaction_type = \'dispense\') AND quantity_before + quantity_delta = quantity_after + discrepancy)');
            DB::unprepared(file_get_contents(database_path('sql/consultation_dispense_reconciliation.sql')));
        }
    }
    public function down(): void {
        if (DB::table('medicine_inventory_transactions')->where('discrepancy', '<', 0)->exists()) throw new \RuntimeException('Reconciliation audit records must be preserved; this migration cannot be rolled back after a discrepancy is posted.');
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared(file_get_contents(database_path('sql/consultation_dispense_original.sql')));
            DB::statement('ALTER TABLE public.medicine_inventory_transactions DROP CONSTRAINT medicine_inventory_transactions_quantity_check');
            DB::statement('ALTER TABLE public.medicine_inventory_transactions ADD CONSTRAINT medicine_inventory_transactions_quantity_check CHECK (quantity_delta <> 0 AND quantity_before >= 0 AND quantity_after >= 0 AND quantity_before + quantity_delta = quantity_after)');
        }
        Schema::table('medicine_inventory_transactions', fn (Blueprint $t) => $t->dropColumn('discrepancy'));
        Schema::table('medicines', fn (Blueprint $t) => $t->dropColumn('reconciliation_required'));
        Schema::table('consultation_events', fn (Blueprint $t) => $t->dropColumn('encrypted_changes'));
    }
};
