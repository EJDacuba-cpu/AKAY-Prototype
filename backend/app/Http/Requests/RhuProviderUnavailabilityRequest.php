<?php

namespace App\Http\Requests;

use App\Models\RhuProviderUnavailability;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class RhuProviderUnavailabilityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isRhu() ?? false;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('all_day') && $this->boolean('all_day')) {
            $this->merge([
                'all_day' => true,
                'start_time' => null,
                'end_time' => null,
            ]);
        }
    }

    public function rules(): array
    {
        $creating = $this->isMethod('post');

        return [
            'local_date' => [$creating ? 'required' : 'sometimes', 'date_format:Y-m-d'],
            'all_day' => [$creating ? 'required' : 'sometimes', 'boolean'],
            'start_time' => ['nullable', 'date_format:H:i', 'required_if:all_day,false'],
            'end_time' => ['nullable', 'date_format:H:i', 'required_if:all_day,false', 'after:start_time'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $provider = $this->route('rhuProvider');
            $existing = $this->route('unavailability');
            $allDay = $this->has('all_day')
                ? $this->boolean('all_day')
                : (bool) ($existing?->all_day ?? true);
            $localDate = $this->input('local_date', $existing?->localDateString());
            $startTime = $allDay ? null : $this->input('start_time', $existing?->start_time);
            $endTime = $allDay ? null : $this->input('end_time', $existing?->end_time);
            $today = RhuProviderUnavailability::facilityCalendarDate();

            if ($localDate < $today) {
                $validator->errors()->add('local_date', 'Scheduled absences cannot start before today.');
            }

            if (! $allDay && $localDate === $today) {
                $now = now(RhuProviderUnavailability::TIMEZONE)->format('H:i');
                $end = substr((string) $endTime, 0, 5);
                if ($end !== '' && $end <= $now) {
                    $validator->errors()->add('end_time', 'A timed absence must end after the current time.');
                }
            }

            $candidate = new RhuProviderUnavailability([
                'rhu_provider_id' => $provider->id,
                'local_date' => $localDate,
                'all_day' => $allDay,
                'start_time' => $allDay ? null : $startTime,
                'end_time' => $allDay ? null : $endTime,
            ]);

            $others = RhuProviderUnavailability::query()
                ->where('rhu_provider_id', $provider->id)
                ->whereDate('local_date', $localDate)
                ->when($existing, fn ($query) => $query->whereKeyNot($existing->id))
                ->get();

            if ($others->contains(fn (RhuProviderUnavailability $other): bool => $candidate->overlaps($other))) {
                $validator->errors()->add('local_date', 'This absence overlaps another scheduled window for the same day.');
            }
        });
    }
}
