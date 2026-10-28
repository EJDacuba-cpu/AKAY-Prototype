<?php

namespace App\Services;

/**
 * Actions Taken documentation for BHC General Consultation v2.
 *
 * Finalization needs non-whitespace text in treatment_notes for both
 * initial and follow-up visits. Medicines and structured services stay on
 * their own fields and are not copied here, but they do not replace this
 * note. Incomplete drafts may still be empty.
 */
final class ActionsTaken
{
    public const REQUIRED_MESSAGE = 'Document the actions taken.';

    public static function hasText(mixed $value): bool
    {
        return trim((string) $value) !== '';
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, string>
     */
    public static function errors(array $input): array
    {
        return self::hasText($input['treatment_notes'] ?? null)
            ? []
            : ['treatment_notes' => self::REQUIRED_MESSAGE];
    }

    /** @param  array<string, mixed>  $input */
    public static function validate(mixed $validator, array $input): void
    {
        foreach (self::errors($input) as $key => $message) {
            $validator->errors()->add($key, $message);
        }
    }
}
