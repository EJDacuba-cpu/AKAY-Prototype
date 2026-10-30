<?php

namespace App\Services;

class MedicineCreateIdempotencyService
{
    public function hash(array $payload): string
    {
        $fingerprint = [
            'name' => trim((string) ($payload['name'] ?? '')),
            'category' => $payload['category'] ?? null,
            'description' => $payload['description'] ?? null,
            'quantity' => (int) ($payload['quantity'] ?? 0),
            'low_stock_threshold' => array_key_exists('low_stock_threshold', $payload)
                ? (int) $payload['low_stock_threshold']
                : null,
            'unit' => $payload['unit'] ?? null,
            'expiration_date' => $payload['expiration_date'] ?? null,
            'item_type' => $payload['item_type'] ?? 'medicine',
            'expiry_not_applicable' => (bool) ($payload['expiry_not_applicable'] ?? false),
        ];
        ksort($fingerprint, SORT_STRING);

        return hash('sha256', json_encode(
            $fingerprint,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        ));
    }
}
