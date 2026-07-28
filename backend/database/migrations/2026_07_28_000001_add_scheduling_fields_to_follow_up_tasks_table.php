<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table) {
            $table->string('due_time', 5)->nullable()->after('due_date');
            $table->string('reason', 255)->nullable()->after('notes');
            $table->foreignId('practitioner_id')->nullable()->after('reason')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('follow_up_tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('practitioner_id');
            $table->dropColumn(['due_time', 'reason']);
        });
    }
};
