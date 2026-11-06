<?php

namespace Database\Seeders;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class FacilitySeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            $rhuName = 'Rural Health Unit Bulakan';
            $rhu = RuralHealthUnit::where('name', $rhuName)->first();

            // Names are editable; an absent name does not prove the RHU is missing.
            if ($rhu === null && RuralHealthUnit::exists()) {
                throw new RuntimeException(
                    'Cannot identify the default RHU: Rural Health Unit Bulakan is missing but other RHUs exist. '
                    .'Resolve its identity explicitly before rerunning FacilitySeeder. No facilities were changed.'
                );
            }

            $rhu ??= RuralHealthUnit::create([
                'name' => $rhuName,
                'address' => 'Bulakan, Bulacan',
                'contact_information' => null,
                'status' => 'active',
            ]);

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
                $name = $barangay.' Health Center';
                $matches = BarangayHealthCenter::where('barangay', $barangay)
                    ->orWhere('name', $name)
                    ->limit(2)
                    ->get();

                if ($matches->count() > 1) {
                    throw new RuntimeException(
                        "Multiple BHCs match {$barangay}. Resolve the duplicate identities before rerunning FacilitySeeder. "
                        .'No facilities were changed.'
                    );
                }

                if ($existing = $matches->first()) {
                    if (! in_array($existing->barangay, [null, '', $barangay], true)) {
                        throw new RuntimeException(
                            "The canonical BHC name for {$barangay} belongs to a different barangay. "
                            .'Resolve its identity before rerunning FacilitySeeder. No facilities were changed.'
                        );
                    }

                    // Preserve administrator edits, including names and unassigned RHUs.
                    continue;
                }

                BarangayHealthCenter::create([
                    'name' => $name,
                    'barangay' => $barangay,
                    'address' => $barangay.', Bulakan, Bulacan',
                    'contact_information' => null,
                    'status' => 'active',
                    'rural_health_unit_id' => $rhu->id,
                ]);
            }
        });
    }
}
