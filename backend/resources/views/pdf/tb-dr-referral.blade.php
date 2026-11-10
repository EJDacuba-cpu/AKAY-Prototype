<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Outbound DR-TB Referral</title>
<style>
body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #17202f; }
h1 { font-size: 17px; margin-bottom: 4px; } h2 { font-size: 12px; margin: 18px 0 6px; }
table { width: 100%; border-collapse: collapse; } td, th { padding: 6px; border: 1px solid #cbd0d7; text-align: left; vertical-align: top; word-wrap: break-word; }
th { background: #f1f3f6; } .note { white-space: pre-wrap; word-wrap: break-word; } .muted { color: #667085; }
.cancelled { color: #b91c1c; border: 2px solid #b91c1c; padding: 8px; font-size: 15px; font-weight: bold; }
</style></head>
<body>
@php
    $patient = $referral->patient_snapshot;
    $source = $referral->source_snapshot;
    $labels = \App\Models\TbDrReferral::STATUS_LABELS;
    $reference = 'DRR-'.$referral->authorized_at->copy()->timezone('Asia/Manila')->year.'-'.str_pad((string) $referral->id, 6, '0', STR_PAD_LEFT);
@endphp
<h1>Outbound DR-TB Referral Slip</h1>
<p>{{ $source['rhu_name'] ?? '' }} · {{ $reference }}</p>
@if ($referral->status === 'cancelled')<p class="cancelled">CANCELLED REFERRAL</p>@endif
<p><strong>RHU-recorded disposition:</strong> {{ $labels[$referral->status] }}</p>
<h2>Patient</h2>
<table><tr><th>Name</th><td>{{ $patient['full_name'] ?? '' }}</td><th>Birth date / sex</th><td>{{ $patient['birthdate'] ?? '' }} / {{ $patient['sex'] ?? '' }}</td></tr>
<tr><th>Address</th><td colspan="3">{{ implode(', ', array_filter([$patient['street_address'] ?? '', $patient['purok_area'] ?? '', $patient['barangay'] ?? '', $patient['municipality'] ?? ''])) }}</td></tr>
<tr><th>Contact</th><td colspan="3">{{ $patient['contact_number'] ?? '' }}</td></tr></table>
<h2>External PMDT / DR-TB destination</h2>
<p><strong>{{ $referral->destination_name }}</strong><br>{{ $referral->destination_address }}<br>{{ $referral->destination_contact }}</p>
<h2>Physician assessment</h2>
<p>TB Disease · {{ $source['resistance_label'] ?? '' }}<br>Consultation date: {{ $source['date_recorded'] ?? '' }}<br>Assessing physician: {{ $source['physician_name'] ?? '' }}</p>
<p class="note"><strong>Reason / clinical referral instructions:</strong><br>{{ $referral->reason }}</p>
<h2>Reviewed laboratory evidence</h2>
<table><tr><th>Test</th><th>Examination date</th><th>Result status</th><th>Recorded result</th></tr>
@forelse ($source['laboratory_tests'] ?? [] as $lab)
<tr><td>{{ $lab['testName'] ?? '' }}</td><td>{{ $lab['examinationDate'] ?? '' }}</td><td>{{ $lab['resultStatus'] ?? '' }}</td><td class="note">{{ is_scalar($lab['result'] ?? null) ? $lab['result'] : json_encode($lab['result'] ?? '') }}</td></tr>
@empty<tr><td colspan="4">No laboratory evidence attached to the reviewed consultation.</td></tr>@endforelse
</table>
<h2>Referral authorization</h2>
<p><strong>{{ $referral->authorized_name }}</strong>, RHU physician<br>Authorized {{ $referral->authorized_at->copy()->timezone('Asia/Manila')->format('Y-m-d H:i') }} (Philippine time)</p>
<h2>RHU-recorded follow-up</h2>
<table><tr><th>Date</th><th>Disposition</th><th>RHU recorder</th><th>Note / reported basis</th></tr>
@foreach ($referral->events as $event)<tr><td>{{ $event->event_on->toDateString() }}</td><td>{{ $labels[$event->status] }}</td><td>{{ $event->recorder_name }}</td><td class="note">{{ $event->note }}</td></tr>@endforeach
</table>
<p class="muted">Follow-up entries document information recorded by the RHU. Attendance reports are separate from a DR-TB treatment outcome.</p>
</body></html>
