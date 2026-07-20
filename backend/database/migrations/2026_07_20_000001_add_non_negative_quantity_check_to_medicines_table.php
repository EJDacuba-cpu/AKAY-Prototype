<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const CONSTRAINT = 'medicines_quantity_non_negative';

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql' || $this->constraintExists()) {
            return;
        }

        if (DB::table('medicines')->where('quantity', '<', 0)->exists()) {
            throw new RuntimeException(
                'Cannot add medicines_quantity_non_negative while negative medicine quantities exist.'
            );
        }

        DB::statement(sprintf(
            'ALTER TABLE medicines ADD CONSTRAINT %s CHECK (quantity >= 0)',
            self::CONSTRAINT
        ));
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql' && $this->constraintExists()) {
            DB::statement(sprintf(
                'ALTER TABLE medicines DROP CONSTRAINT %s',
                self::CONSTRAINT
            ));
        }
    }

    private function constraintExists(): bool
    {
        return DB::table('information_schema.table_constraints')
            ->where('constraint_schema', DB::raw('current_schema()'))
            ->where('table_name', 'medicines')
            ->where('constraint_name', self::CONSTRAINT)
            ->exists();
    }
};
