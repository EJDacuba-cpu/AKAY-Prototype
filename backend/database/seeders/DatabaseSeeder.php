<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        // 1. The single receiving facility.
        DB::table('rural_health_units')->updateOrInsert(
            ['name' => 'Rural Health Unit Bulakan'],
            [
                'address' => 'Bulakan, Bulacan',
                'contact_information' => null,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]
        );

        $rhuId = DB::table('rural_health_units')
            ->where('name', 'Rural Health Unit Bulakan')
            ->value('id');

        // 2. Barangay health centers - all 14 barangays of Bulakan, Bulacan.
        $barangays = [
            'Bagumbayan',
            'Balubad',
            'Bambang',
            'Matungao',
            'Maysantol',
            'Perez',
            'Pitpitan',
            'San Francisco',
            'San Jose (Poblacion)',
            'San Nicolas',
            'Santa Ana',
            'Santa Ines',
            'Taliptip',
            'Tibig',
        ];

        foreach ($barangays as $barangay) {
            DB::table('barangay_health_centers')->updateOrInsert(
                ['name' => $barangay.' Health Center'],
                [
                    'barangay' => $barangay,
                    'address' => $barangay.', Bulakan, Bulacan',
                    'contact_information' => null,
                    'status' => 'active',
                    'rural_health_unit_id' => $rhuId,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]
            );
        }
    }
}
