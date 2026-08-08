<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        DB::table('users')->updateOrInsert(
            ['email' => 'admin@akay.com'],
            [
                'name' => 'Municipal Health Officer',
                'password' => Hash::make('akayadmin2026'),
                'role' => 'admin',
                'status' => 'active',
                'barangay_health_center_id' => null,
                'rural_health_unit_id' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

         // 2. The single receiving facility.
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

            // 3. Barangay health centers - all 14 barangays of Bulakan, Bulacan.
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