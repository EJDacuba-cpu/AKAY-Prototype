<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            if (! Schema::hasColumn('notifications', 'entity_type')) {
                $table->string('entity_type')->nullable()->after('type')->index();
            }
            if (! Schema::hasColumn('notifications', 'entity_id')) {
                $table->unsignedBigInteger('entity_id')->nullable()->after('entity_type')->index();
            }
            if (! Schema::hasColumn('notifications', 'link_url')) {
                $table->string('link_url')->nullable()->after('message');
            }
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            if (Schema::hasColumn('notifications', 'link_url')) {
                $table->dropColumn('link_url');
            }
            if (Schema::hasColumn('notifications', 'entity_id')) {
                $table->dropColumn('entity_id');
            }
            if (Schema::hasColumn('notifications', 'entity_type')) {
                $table->dropColumn('entity_type');
            }
        });
    }
};
