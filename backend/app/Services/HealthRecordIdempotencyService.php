<?php

namespace App\Services;

use Illuminate\Support\Arr;

class HealthRecordIdempotencyService
{
    public function __construct(private readonly MedicineStockService $medicineStock) {}

    /**
     * Identity fields are never part of the payload fingerprint. They say
     * WHICH submission or consultation this is, not WHAT is being submitted,
     * so leaving them out keeps the hash byte-identical to what it was before
     * consultation_uuid existed - existing idempotency semantics unchanged.
     */
    private const IDENTITY_FIELDS = [
        'idempotency_key',
        'draft_public_id',
        'consultation_uuid',
    ];

    public function hash(array $payload): string
    {
        $officialPayload = Arr::except($payload, self::IDENTITY_FIELDS);
        if (is_array($officialPayload['dispensed_medicines'] ?? null)) {
            $officialPayload['dispensed_medicines'] = $this->medicineStock->normalize(
                $officialPayload['dispensed_medicines']
            );
        }

        return $this->hashNormalized($officialPayload);
    }

    public function legacyHash(array $payload): string
    {
        return $this->hashNormalized(Arr::except($payload, self::IDENTITY_FIELDS));
    }

    private function hashNormalized(array $payload): string
    {
        return hash('sha256', json_encode(
            $this->normalize($payload),
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        ));
    }

    private function normalize(mixed $value, ?string $field = null): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        if (array_is_list($value)) {
            $normalized = array_map(
                fn (mixed $item): mixed => $this->normalize($item),
                $value
            );

            if ($field === 'dispensed_medicines') {
                usort($normalized, fn (mixed $left, mixed $right): int => strcmp(
                    json_encode($left, JSON_THROW_ON_ERROR),
                    json_encode($right, JSON_THROW_ON_ERROR)
                ));
            }

            return $normalized;
        }

        ksort($value, SORT_STRING);

        foreach ($value as $key => $item) {
            $value[$key] = $this->normalize($item, (string) $key);
        }

        return $value;
    }
}
