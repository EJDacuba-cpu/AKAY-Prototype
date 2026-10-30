<?php

namespace App\Services;

use Illuminate\Validation\ValidationException;

/**
 * A member's relationship to the household head is a display label. It never
 * creates a graph connection by itself; only Husband/Wife and Brother/Sister
 * may be confirmed as an explicit spouse/sibling link, and Partner may not.
 */
class RelationshipLabels
{
    public const HEAD = 'Household head';

    public const LABELS = [
        'Husband', 'Wife', 'Partner', 'Brother', 'Sister', 'Father', 'Mother', 'Son', 'Daughter',
        'Grandfather', 'Grandmother', 'Grandson', 'Granddaughter',
        'Father-in-law', 'Mother-in-law', 'Son-in-law', 'Daughter-in-law',
        'Uncle', 'Aunt', 'Nephew', 'Niece', 'Cousin', 'Other relative', 'Non-relative',
    ];

    /** Combined labels saved before the specific list; readable and kept as saved, never rewritten. */
    public const LEGACY = [
        'Spouse / Partner', 'Son / Daughter', 'Parent', 'Sibling', 'Grandchild', 'Grandparent',
        'Son / Daughter-in-law', 'Parent-in-law', 'Niece / Nephew', 'Aunt / Uncle', 'Cousin', 'Other relative', 'Non-relative',
    ];

    private const LINK_TYPES = ['Husband' => 'spouse', 'Wife' => 'spouse', 'Brother' => 'sibling', 'Sister' => 'sibling'];

    public static function linkTypeFor(string $label): ?string
    {
        return self::LINK_TYPES[trim($label)] ?? null;
    }

    /** A legacy label is accepted only when it equals the value already saved for this member. */
    public static function validate(string $label, ?string $current = null, string $field = 'relationship'): void
    {
        $label = trim($label);
        if (in_array($label, self::LABELS, true)) {
            return;
        }
        if ($current !== null && $label === trim($current) && in_array($label, self::LEGACY, true)) {
            return;
        }
        throw ValidationException::withMessages([$field => 'Choose the member’s specific relationship to the household head.']);
    }
}
