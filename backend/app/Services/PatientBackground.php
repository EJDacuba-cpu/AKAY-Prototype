<?php

namespace App\Services;

use App\Exceptions\PatientBackgroundConflictException;
use App\Models\Patient;
use App\Models\User;
use Closure;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The patient's longitudinal background (patients.medical_background) as the
 * four editable ITR Patient History sections (II-V), and the one way a
 * consultation changes it - per
 * docs/superpowers/specs/2026-10-16-itr-patient-history-design.md.
 *
 * Each section is a slice of the JSON object. A consultation stages edits to
 * whole sections; on finalize apply() merges only those slices onto the locked
 * patient row, so the sections it did not touch keep whatever they hold now.
 * revisions.{section} is the optimistic-concurrency token: an edited section
 * whose revision moved since the clinician opened it is a conflict, an
 * untouched one never is. A section the consultation only reviewed ("No
 * changes") is stamped in reviewedAt without a conflict check or a revision.
 */
class PatientBackground
{
    /** Section => the top-level medical_background keys it owns. */
    public const SECTIONS = [
        'medical' => ['currentDiseases', 'allergies', 'hospitalizations'],
        'family' => ['familyHistory'],
        'social' => ['personalSocial'],
        'obstetric' => ['obstetric'],
    ];

    /** The only source a consultation can give a condition. */
    private const PATIENT_REPORTED = 'Patient-reported';

    /**
     * What normalize() keeps of each key, recursively: 'text', 'int', 'bool',
     * 'list' (of strings), an object (field => type) or a list of objects
     * (['*' => object]). Anything else is dropped; so are "", null, false and
     * empty lists or objects, so a never-recorded field equals an empty one.
     */
    private const FIELDS = [
        'currentDiseases' => ['*' => [
            'name' => 'text', 'yearDiagnosed' => 'int', 'diagnosedWhere' => 'text', 'note' => 'text',
            'source' => 'text', 'firstRecorded' => 'text',
        ]],
        'allergies' => [
            'noneKnown' => 'bool',
            'items' => ['*' => ['allergen' => 'text', 'reaction' => 'text']],
        ],
        'hospitalizations' => [
            'none' => 'bool',
            'items' => ['*' => ['type' => 'text', 'year' => 'int', 'reason' => 'text', 'place' => 'text']],
        ],
        'familyHistory' => [
            'noneKnown' => 'bool',
            'items' => ['*' => ['condition' => 'text', 'kind' => 'text', 'relation' => 'text', 'relativePatientId' => 'int']],
        ],
        'personalSocial' => [
            'education' => ['level' => 'text', 'completed' => 'text'],
            'pastOccupations' => 'text',
            'smoking' => ['status' => 'text', 'sticksPerDay' => 'int', 'years' => 'int', 'quitYear' => 'int'],
            'alcohol' => ['status' => 'text', 'frequency' => 'text'],
            'diet' => ['highSalt' => 'bool', 'fatty' => 'bool', 'sweetDrinks' => 'bool', 'lowFruitVeg' => 'bool', 'notes' => 'text'],
            'sexual' => ['active' => 'text', 'notes' => 'text'],
            'environment' => ['waterSource' => 'text', 'toilet' => 'text', 'exposures' => 'list', 'notes' => 'text'],
        ],
        'obstetric' => [
            'menarcheAge' => 'int', 'menstrualStatus' => 'text', 'menopauseAge' => 'int',
            'intervalDays' => 'int', 'durationDays' => 'int', 'amount' => 'text', 'regularity' => 'text',
            'symptoms' => 'list', 'symptomNotes' => 'text',
            'pregnancies' => ['*' => ['year' => 'int', 'outcome' => 'text', 'delivery' => 'text', 'place' => 'text', 'note' => 'text']],
        ],
    ];

    /**
     * The staged update as the draft sanitizer's node tree: the same sections,
     * keys and nesting as FIELDS, every leaf a plain value. Drafts carry the
     * update under $basesKey (camelCase) instead of base_revisions.
     *
     * @return array<string, mixed>
     */
    public static function draftSchema(string $basesKey): array
    {
        $sections = [];
        $bases = [];
        foreach (self::SECTIONS as $section => $keys) {
            $bases[$section] = true;
            foreach ($keys as $key) {
                $sections[$section][$key] = self::draftNode(self::FIELDS[$key]);
            }
        }

        return ['sections' => $sections, $basesKey => $bases, 'reviewed' => ['*' => true]];
    }

    private static function draftNode(string|array $schema): bool|array
    {
        if ($schema === 'list') {
            return ['*' => true];
        }
        if (is_string($schema)) {
            return true;
        }

        return isset($schema['*'])
            ? ['*' => self::draftNode($schema['*'])]
            : array_map(fn ($field) => self::draftNode($field), $schema);
    }

    private const STATUS = ['never', 'former', 'current'];

    private const YEAR = ['nullable', 'integer', 'between:1900,2100'];

    public static function canAccess(?User $user): bool
    {
        return $user !== null && ($user->isAdmin() || ActionPermissions::allows($user, 'clinical.history'));
    }

    /**
     * Validation for a staged update under $prefix: { sections, $basesKey, reviewed }.
     * An edited section needs its base revision; a reviewed-only one does not.
     */
    public static function rules(string $prefix, string $basesKey): array
    {
        $sections = "{$prefix}.sections";
        $bases = "{$prefix}.{$basesKey}";
        $names = implode(',', array_keys(self::SECTIONS));
        $medical = "{$sections}.medical";
        $family = "{$sections}.family.familyHistory";
        $social = "{$sections}.social.personalSocial";
        $obstetric = "{$sections}.obstetric.obstetric";
        $text = fn (int $max) => ['nullable', 'string', "max:{$max}"];

        $rules = [
            $prefix => ['nullable', "array:sections,reviewed,{$basesKey}"],
            $sections => ['nullable', "array:{$names}"],
            $bases => ['nullable', "required_with:{$sections}", "array:{$names}"],
            "{$bases}.*" => ['integer', 'min:0'],
            "{$prefix}.reviewed" => ['nullable', 'array', 'max:20'],
            "{$prefix}.reviewed.*" => ['string', Rule::in(array_keys(self::SECTIONS))],
        ];
        foreach (array_keys(self::SECTIONS) as $section) {
            $rules["{$bases}.{$section}"] = ["required_with:{$sections}.{$section}"];
            $rules["{$sections}.{$section}"] = ['nullable', 'array'];
        }

        return [
            ...$rules,

            // II. Past Medical History
            "{$medical}.currentDiseases" => ['nullable', 'array', 'max:50'],
            "{$medical}.currentDiseases.*" => ['array'],
            "{$medical}.currentDiseases.*.name" => ['required', 'string', 'max:150'],
            "{$medical}.currentDiseases.*.yearDiagnosed" => self::YEAR,
            "{$medical}.currentDiseases.*.diagnosedWhere" => $text(150),
            "{$medical}.currentDiseases.*.note" => $text(500),
            "{$medical}.allergies" => ['nullable', 'array', self::exclusive('noneKnown')],
            "{$medical}.allergies.noneKnown" => ['nullable', 'boolean'],
            "{$medical}.allergies.items" => ['nullable', 'array', 'max:50'],
            "{$medical}.allergies.items.*" => ['array'],
            "{$medical}.allergies.items.*.allergen" => ['required', 'string', 'max:150'],
            "{$medical}.allergies.items.*.reaction" => $text(255),
            "{$medical}.hospitalizations" => ['nullable', 'array', self::exclusive('none')],
            "{$medical}.hospitalizations.none" => ['nullable', 'boolean'],
            "{$medical}.hospitalizations.items" => ['nullable', 'array', 'max:50'],
            "{$medical}.hospitalizations.items.*" => ['array'],
            "{$medical}.hospitalizations.items.*.type" => ['required', 'string', Rule::in(['Hospitalization', 'Surgery'])],
            "{$medical}.hospitalizations.items.*.year" => self::YEAR,
            "{$medical}.hospitalizations.items.*.reason" => $text(255),
            "{$medical}.hospitalizations.items.*.place" => $text(150),

            // III. Family History
            $family => ['nullable', 'array', self::exclusive('noneKnown')],
            "{$family}.noneKnown" => ['nullable', 'boolean'],
            "{$family}.items" => ['nullable', 'array', 'max:50'],
            "{$family}.items.*" => ['array'],
            "{$family}.items.*.condition" => ['required', 'string', 'max:150'],
            "{$family}.items.*.kind" => ['nullable', 'string', Rule::in(['Chronic', 'Hereditary'])],
            "{$family}.items.*.relation" => ['nullable', 'string', Rule::in(['Mother', 'Father', 'Sibling', 'Grandparent', 'Child', 'Other'])],
            "{$family}.items.*.relativePatientId" => ['nullable', 'integer', 'min:1'],

            // IV. Personal & Social History
            $social => ['nullable', 'array'],
            "{$social}.education" => ['nullable', 'array'],
            "{$social}.education.level" => ['nullable', 'string', Rule::in([
                'None', 'Elementary', 'High School', 'Senior High School', 'Vocational', 'College', 'Postgraduate',
            ])],
            "{$social}.education.completed" => ['nullable', 'string', Rule::in(['Level', 'Graduate'])],
            "{$social}.pastOccupations" => $text(500),
            "{$social}.smoking" => ['nullable', 'array'],
            "{$social}.smoking.status" => ['nullable', 'string', Rule::in(self::STATUS)],
            "{$social}.smoking.sticksPerDay" => ['nullable', 'integer', 'between:1,100'],
            "{$social}.smoking.years" => ['nullable', 'integer', 'between:0,80'],
            "{$social}.smoking.quitYear" => self::YEAR,
            "{$social}.alcohol" => ['nullable', 'array'],
            "{$social}.alcohol.status" => ['nullable', 'string', Rule::in(self::STATUS)],
            "{$social}.alcohol.frequency" => ['nullable', 'string', Rule::in(['occasional', 'weekly', 'daily'])],
            "{$social}.diet" => ['nullable', 'array'],
            "{$social}.diet.highSalt" => ['nullable', 'boolean'],
            "{$social}.diet.fatty" => ['nullable', 'boolean'],
            "{$social}.diet.sweetDrinks" => ['nullable', 'boolean'],
            "{$social}.diet.lowFruitVeg" => ['nullable', 'boolean'],
            "{$social}.diet.notes" => $text(500),
            "{$social}.sexual" => ['nullable', 'array'],
            "{$social}.sexual.active" => ['nullable', 'string', Rule::in(['yes', 'no', 'declined'])],
            "{$social}.sexual.notes" => $text(500),
            "{$social}.environment" => ['nullable', 'array'],
            "{$social}.environment.waterSource" => ['nullable', 'string', Rule::in(['Level I', 'Level II', 'Level III', 'Other'])],
            "{$social}.environment.toilet" => ['nullable', 'string', Rule::in([
                'Water-sealed (own)', 'Water-sealed (shared)', 'Pit latrine', 'None', 'Other',
            ])],
            "{$social}.environment.exposures" => ['nullable', 'array', 'max:3'],
            "{$social}.environment.exposures.*" => ['string', Rule::in(['secondhandSmoke', 'biomassCooking', 'industrialPollution'])],
            "{$social}.environment.notes" => $text(500),

            // V. Obstetric & Menstrual History (Female only - enforced in apply())
            $obstetric => ['nullable', 'array'],
            "{$obstetric}.menarcheAge" => ['nullable', 'integer', 'between:6,25'],
            "{$obstetric}.menstrualStatus" => ['nullable', 'string', Rule::in(['menstruating', 'menopause'])],
            "{$obstetric}.menopauseAge" => ['nullable', 'integer', 'between:30,70'],
            "{$obstetric}.intervalDays" => ['nullable', 'integer', 'between:10,90'],
            "{$obstetric}.durationDays" => ['nullable', 'integer', 'between:1,15'],
            "{$obstetric}.amount" => ['nullable', 'string', Rule::in(['light', 'moderate', 'heavy'])],
            "{$obstetric}.regularity" => ['nullable', 'string', Rule::in(['regular', 'irregular'])],
            "{$obstetric}.symptoms" => ['nullable', 'array', 'max:5'],
            "{$obstetric}.symptoms.*" => ['string', Rule::in(['dysmenorrhea', 'headache', 'moodChanges', 'bloating', 'breastTenderness'])],
            "{$obstetric}.symptomNotes" => $text(500),
            "{$obstetric}.pregnancies" => ['nullable', 'array', 'max:30'],
            "{$obstetric}.pregnancies.*" => ['array'],
            "{$obstetric}.pregnancies.*.year" => self::YEAR,
            "{$obstetric}.pregnancies.*.outcome" => ['nullable', 'string', Rule::in(['liveBirth', 'miscarriage', 'stillbirth'])],
            "{$obstetric}.pregnancies.*.delivery" => ['nullable', 'string', Rule::in(['normal', 'cesarean', 'notApplicable'])],
            "{$obstetric}.pregnancies.*.place" => $text(150),
            "{$obstetric}.pregnancies.*.note" => $text(500),
        ];
    }

    /** "None known" / "None" is an answer of its own; it cannot also list items. */
    private static function exclusive(string $flag): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($flag): void {
            if (is_array($value)
                && filter_var($value[$flag] ?? false, FILTER_VALIDATE_BOOLEAN)
                && is_array($value['items'] ?? null) && $value['items'] !== []) {
                $fail('Choose either none or list the items, not both.');
            }
        };
    }

    /**
     * True when a staged update still uses the pre-ITR string shapes (a draft
     * saved before this change), so the caller can drop it instead of failing.
     */
    public static function isLegacyUpdate(array $update): bool
    {
        $sections = is_array($update['sections'] ?? null) ? $update['sections'] : [];
        $medical = is_array($sections['medical'] ?? null) ? $sections['medical'] : [];
        foreach (['allergies', 'hospitalizations', 'surgeries'] as $key) {
            if (is_string($medical[$key] ?? null)) {
                return true;
            }
        }

        $family = $sections['family']['familyHistory'] ?? null;
        if (is_array($family) && array_intersect(['similarIllness', 'chronicIllness', 'hereditaryIllness'], array_keys($family)) !== []) {
            return true;
        }

        $social = $sections['social']['personalSocial'] ?? null;
        foreach (['diet', 'smoking', 'alcohol'] as $key) {
            if (is_array($social) && is_string($social[$key] ?? null)) {
                return true;
            }
        }

        return false;
    }

    public static function revision(array $background, string $section): int
    {
        return (int) ($background['revisions'][$section] ?? 0);
    }

    /** The keys one section owns, each present (null when never recorded). */
    public static function slice(array $background, string $section): array
    {
        $slice = [];
        foreach (self::SECTIONS[$section] as $key) {
            $slice[$key] = $background[$key] ?? null;
        }

        return $slice;
    }

    public static function entry(
        string $section,
        string $source,
        array $before,
        array $after,
        int $revision,
        ?User $user
    ): array {
        return [
            'section' => $section,
            'source' => $source,
            'before' => $before,
            'after' => $after,
            'revision' => $revision,
            'changedBy' => $user?->id,
            'changedAt' => now()->toISOString(),
        ];
    }

    /**
     * Applies a staged update to the patient, inside the caller's transaction.
     *
     * @param  array{sections?: array, base_revisions?: array, reviewed?: string[]}  $update
     * @return array<int, array> one change entry per edited section that actually changed
     *
     * @throws PatientBackgroundConflictException when an edited section is stale
     * @throws ValidationException when obstetric history is updated or reviewed for a non-Female patient
     */
    public function apply(Patient $patient, array $update, User $user, string $date): array
    {
        $sections = array_intersect_key(
            array_filter(is_array($update['sections'] ?? null) ? $update['sections'] : [], 'is_array'),
            self::SECTIONS
        );
        $reviewed = array_values(array_unique(array_filter(
            is_array($update['reviewed'] ?? null) ? $update['reviewed'] : [],
            fn ($section) => is_string($section) && isset(self::SECTIONS[$section])
        )));
        if ($sections === [] && $reviewed === []) {
            return [];
        }

        $locked = Patient::query()->whereKey($patient->id)->lockForUpdate()->firstOrFail();
        if ($locked->sex !== 'Female' && (isset($sections['obstetric']) || in_array('obstetric', $reviewed, true))) {
            throw ValidationException::withMessages([
                (isset($sections['obstetric']) ? 'background_update.sections.obstetric' : 'background_update.reviewed') => 'Obstetric and menstrual history is recorded for female patients only.',
            ]);
        }

        $background = is_array($locked->medical_background) ? $locked->medical_background : [];
        $bases = is_array($update['base_revisions'] ?? null) ? $update['base_revisions'] : [];

        $conflicts = [];
        foreach (array_keys($sections) as $section) {
            $current = self::revision($background, $section);
            if (! array_key_exists($section, $bases) || (int) $bases[$section] !== $current) {
                $conflicts[] = [
                    'section' => $section,
                    'current' => self::slice($background, $section),
                    'revision' => $current,
                    'updatedAt' => $background['updatedAt'][$section] ?? null,
                ];
            }
        }
        if ($conflicts !== []) {
            throw new PatientBackgroundConflictException($conflicts);
        }

        $changes = [];
        foreach ($sections as $section => $edited) {
            $before = self::slice($background, $section);
            $after = $this->normalize($section, $edited, $before, $date);
            if (self::canonicalSlice($after) === self::canonicalSlice($before)) {
                continue;
            }

            $revision = self::revision($background, $section) + 1;
            $background = [...$background, ...$after];
            $background['revisions'][$section] = $revision;
            $background['updatedAt'][$section] = $date;
            $changes[] = self::entry($section, 'consultation', $before, $after, $revision, $user);
        }

        // Edited and reviewed sections alike were looked at in this consultation.
        $stamp = [
            'date' => $date,
            'facility' => $user->barangayHealthCenter?->name ?? $user->ruralHealthUnit?->name,
            'by' => $user->id,
        ];
        foreach (array_unique([...array_keys($sections), ...$reviewed]) as $section) {
            $background['reviewedAt'][$section] = $stamp;
        }

        $locked->update(['medical_background' => $background]);

        return $changes;
    }

    /**
     * The edited slice reduced to the keys its section owns, each normalized.
     * A key the client left out keeps its current value.
     */
    private function normalize(string $section, array $edited, array $before, string $date): array
    {
        $after = $before;
        foreach (self::SECTIONS[$section] as $key) {
            if (! array_key_exists($key, $edited)) {
                continue;
            }
            $value = $key === 'currentDiseases'
                ? $this->conditionEntries(is_array($edited[$key]) ? $edited[$key] : [], $before[$key], $date)
                : $edited[$key];
            $after[$key] = self::canonical($value, self::FIELDS[$key]);
        }

        return $after;
    }

    /** A slice in comparable form: "" and null both mean "not recorded". */
    private static function canonicalSlice(array $slice): array
    {
        foreach ($slice as $key => $value) {
            $slice[$key] = self::canonical($value, self::FIELDS[$key]);
        }

        return $slice;
    }

    /**
     * $value reduced to $schema (see FIELDS), or null when nothing is left. A
     * stored pre-ITR string where an object is expected is kept as text, so it
     * still differs from "not recorded".
     */
    private static function canonical(mixed $value, string|array $schema): mixed
    {
        if ($schema === 'text') {
            $text = is_string($value) || is_int($value) || is_float($value) ? trim((string) $value) : '';

            return $text === '' ? null : $text;
        }
        if ($schema === 'int') {
            return is_numeric($value) ? (int) $value : null;
        }
        if ($schema === 'bool') {
            return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) === true ? true : null;
        }
        if (! is_array($value)) {
            return is_string($schema) ? null : self::canonical($value, 'text');
        }
        if ($schema === 'list') {
            $items = array_values(array_unique(array_filter(
                array_map(fn ($item) => self::canonical($item, 'text'), $value),
                fn ($item) => $item !== null
            )));

            return $items === [] ? null : $items;
        }
        if (isset($schema['*'])) {
            $items = array_values(array_filter(
                array_map(fn ($item) => is_array($item) ? self::canonical($item, $schema['*']) : null, $value),
                fn ($item) => $item !== null
            ));

            return $items === [] ? null : $items;
        }

        $object = [];
        foreach ($schema as $field => $type) {
            $kept = self::canonical($value[$field] ?? null, $type);
            if ($kept !== null) {
                $object[$field] = $kept;
            }
        }

        return $object === [] ? null : $object;
    }

    /**
     * Every submitted entry is a patient-reported condition: the server sets
     * its source, and a name already stored keeps its first-recorded date.
     * RHU-confirmed conditions live in patient_conditions, never here.
     */
    private function conditionEntries(array $submitted, mixed $stored, string $date): array
    {
        $firstRecorded = [];
        foreach (is_array($stored) ? array_filter($stored, 'is_array') : [] as $entry) {
            $firstRecorded[self::nameKey($entry['name'] ?? '')] ??= $entry['firstRecorded'] ?? null;
        }

        $entries = [];
        foreach (array_filter($submitted, 'is_array') as $entry) {
            $entries[] = [
                'name' => $entry['name'] ?? null,
                'yearDiagnosed' => $entry['yearDiagnosed'] ?? null,
                'diagnosedWhere' => $entry['diagnosedWhere'] ?? null,
                'note' => $entry['note'] ?? null,
                'source' => self::PATIENT_REPORTED,
                'firstRecorded' => $firstRecorded[self::nameKey($entry['name'] ?? '')] ?? $date,
            ];
        }

        return $entries;
    }

    private static function nameKey(mixed $name): string
    {
        return mb_strtolower(trim(is_string($name) ? $name : ''));
    }
}
