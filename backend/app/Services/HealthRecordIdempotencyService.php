<?php

namespace App\Services;

use Illuminate\Support\Arr;

class HealthRecordIdempotencyService
{
    public function hash(array $payload): string
    {
        $officialPayload = Arr::except($payload, ['idempotency_key']);

        return hash('sha256', json_encode(
            $this->normalize($officialPayload),
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
