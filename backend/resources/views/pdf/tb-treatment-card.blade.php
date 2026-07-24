@php
    $labelMaps = [
        'referredBy' => [
            'public' => 'Public', 'other_public' => 'Other Public',
            'private' => 'Private', 'community' => 'Community',
        ],
        'diagnosisType' => [
            'tb_disease' => 'TB Disease', 'tb_infection' => 'TB Infection',
        ],
        'bacteriologicalStatus' => [
            'bacteriologically_confirmed' => 'Bacteriologically-confirmed TB',
            'clinically_diagnosed' => 'Clinically-diagnosed TB',
        ],
        'anatomicalSite' => [
            'pulmonary' => 'Pulmonary', 'extrapulmonary' => 'Extra-pulmonary',
        ],
        'drugResistance' => [
            'drug_susceptible' => 'Drug-susceptible',
            'rr_tb' => 'Bacteriologically-confirmed RR-TB',
            'mdr_tb' => 'Bacteriologically-confirmed MDR-TB',
            'clinically_mdr_tb' => 'Clinically-diagnosed MDR-TB',
            'xdr_tb' => 'Bacteriologically-confirmed XDR-TB',
            'other' => 'Other Drug-resistant TB',
        ],
        'registrationGroup' => [
            'new' => 'New', 'relapse' => 'Relapse', 'taf' => 'TAF',
            'talf' => 'TALF', 'ptou' => 'PTOU', 'unknown_history' => 'Unknown History',
        ],
        'locationOfTreatment' => [
            'facility' => 'Facility-based', 'community' => 'Community-based',
            'home_based' => 'Home-based',
        ],
    ];

    $lbl = function (string $group, ?string $value) use ($labelMaps) {
        if (! $value) return '';
        return $labelMaps[$group][$value] ?? $value;
    };
    $dash = fn ($v) => ($v === null || $v === '') ? '—' : $v;

    $caseFinding = $tb['caseFinding'] ?? [];
    $laboratory = $tb['laboratory'] ?? [];
    $diagnosis = $tb['diagnosis'] ?? [];
    $classification = $tb['classification'] ?? [];
    $regimenRows = $tb['regimen']['rows'] ?? [];
    $supporter = $tb['treatmentSupporter'] ?? [];
    $phases = $tb['phases'] ?? [];
    $adverseEvents = $tb['adverseEvents'] ?? [];
    $months = $tb['doseCalendar']['months'] ?? [];
    $adherence = $tb['doseCalendar']['adherencePercent'] ?? 0;

    $labRows = [
        ['Xpert MTB/RIF (± Ultra)', $laboratory['xpert'] ?? []],
        ['Smear Microscopy / TB LAMP', $laboratory['smearOrLamp'] ?? []],
        ['Chest X-ray', $laboratory['chestXray'] ?? []],
        ['Tuberculin Skin Test', $laboratory['tst'] ?? []],
        [($laboratory['other']['label'] ?? '') ?: 'Other', $laboratory['other'] ?? []],
    ];
@endphp
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
    * { box-sizing: border-box; }
    body { font-family: DejaVu Sans, sans-serif; font-size: 8px; color: #111; margin: 0; }
    h1 { font-size: 13px; text-align: center; margin: 0 0 2px; }
    .sub { text-align: center; font-size: 8px; color: #444; margin-bottom: 8px; }
    .section-title {
        background: #e5e7eb; font-weight: bold; font-size: 8px; text-transform: uppercase;
        padding: 3px 5px; margin-top: 8px; border: 1px solid #9ca3af; border-bottom: none;
    }
    table { width: 100%; border-collapse: collapse; }
    .kv td { border: 1px solid #9ca3af; padding: 2px 4px; vertical-align: top; }
    .kv .k { background: #f3f4f6; font-weight: bold; width: 15%; }
    .grid td, .grid th { border: 1px solid #9ca3af; padding: 2px 3px; text-align: center; }
    .grid th { background: #f3f4f6; font-weight: bold; }
    .cal td, .cal th { border: 1px solid #9ca3af; padding: 1px; text-align: center; font-size: 6.5px; }
    .cal th { background: #f3f4f6; }
    .cal .month { text-align: left; padding-left: 3px; white-space: nowrap; }
    .muted { color: #666; }
    .badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 1px 6px; font-weight: bold; }
</style>
</head>
<body>
    <h1>FORM 4B. DS-TB TREATMENT CARD</h1>
    <div class="sub">National TB Control Program &middot; Department of Health (Philippines)</div>

    <div class="section-title">A. Patient Demographic</div>
    <table class="kv">
        <tr>
            <td class="k">Patient Name</td><td>{{ $dash(optional($patient)->full_name) }}</td>
            <td class="k">Date of Birth</td><td>{{ $dash(optional(optional($patient)->birthdate)->format('m/d/Y')) }}</td>
            <td class="k">Age</td><td>{{ $dash(optional($patient)->age) }}</td>
            <td class="k">Sex</td><td>{{ $dash(optional($patient)->sex) }}</td>
        </tr>
        <tr>
            <td class="k">Civil Status</td><td>{{ $dash(optional($patient)->civil_status) }}</td>
            <td class="k">Contact No.</td><td>{{ $dash(optional($patient)->contact_number) }}</td>
            <td class="k">PhilHealth No.</td><td>{{ $dash(optional($patient)->philhealth_number) }}</td>
            <td class="k">Nationality</td><td>{{ $dash(optional($patient)->nationality ?? 'Filipino') }}</td>
        </tr>
        <tr>
            <td class="k">Address</td>
            <td colspan="7">{{ $dash(trim(implode(', ', array_filter([
                optional($patient)->street_address,
                optional($patient)->barangay,
                optional($patient)->municipality,
            ]))) ?: null) }}</td>
        </tr>
    </table>

    <div class="section-title">I. Case Finding / Notification</div>
    <table class="kv">
        <tr>
            <td class="k">Diagnosing Facility</td><td>{{ $dash($caseFinding['diagnosingFacility'] ?? null) }}</td>
            <td class="k">NTP Facility Code</td><td>{{ $dash($caseFinding['ntpFacilityCode'] ?? null) }}</td>
            <td class="k">Province / HUC</td><td>{{ $dash($caseFinding['provinceHuc'] ?? null) }}</td>
            <td class="k">Region</td><td>{{ $dash($caseFinding['region'] ?? null) }}</td>
        </tr>
        <tr>
            <td class="k">Referred By</td><td>{{ $dash($lbl('referredBy', $caseFinding['referredBy'] ?? null)) }}</td>
            <td class="k">Screening</td><td>{{ $dash($caseFinding['screeningCategory'] ?? null) }}</td>
            <td class="k">Date of Screening</td><td colspan="3">{{ $dash($caseFinding['dateOfScreening'] ?? null) }}</td>
        </tr>
    </table>

    <div class="section-title">C. Laboratory Tests</div>
    <table class="grid">
        <tr><th style="text-align:left">Test</th><th>Collection Date</th><th>Examination Date</th><th style="text-align:left">Result</th></tr>
        @foreach ($labRows as $row)
            <tr>
                <td style="text-align:left">{{ $row[0] }}</td>
                <td>{{ $dash($row[1]['collectionDate'] ?? null) }}</td>
                <td>{{ $dash($row[1]['examDate'] ?? null) }}</td>
                <td style="text-align:left">{{ $dash($row[1]['result'] ?? null) }}</td>
            </tr>
        @endforeach
    </table>

    <div class="section-title">D. Diagnosis &amp; E. TB Disease Classification</div>
    <table class="kv">
        <tr>
            <td class="k">Diagnosis</td><td>{{ $dash($lbl('diagnosisType', $diagnosis['diagnosisType'] ?? null)) }}</td>
            <td class="k">Date of Diagnosis</td><td>{{ $dash($diagnosis['dateOfDiagnosis'] ?? null) }}</td>
            <td class="k">Date of Notification</td><td>{{ $dash($diagnosis['dateOfNotification'] ?? null) }}</td>
        </tr>
        <tr>
            <td class="k">TB Case Number</td><td><strong>{{ $dash($diagnosis['tbCaseNumber'] ?? null) }}</strong></td>
            <td class="k">Attending Physician</td><td>{{ $dash($diagnosis['attendingPhysician'] ?? null) }}</td>
            <td class="k">Referred To</td><td>{{ $dash($diagnosis['referredTo'] ?? null) }}</td>
        </tr>
        <tr>
            <td class="k">Bacteriological Status</td><td>{{ $dash($lbl('bacteriologicalStatus', $classification['bacteriologicalStatus'] ?? null)) }}</td>
            <td class="k">Anatomical Site</td>
            <td>{{ $dash($lbl('anatomicalSite', $classification['anatomicalSite'] ?? null)) }}
                {{ ($classification['extrapulmonarySite'] ?? '') ? '('.$classification['extrapulmonarySite'].')' : '' }}</td>
            <td class="k">Registration Group</td><td>{{ $dash($lbl('registrationGroup', $classification['registrationGroup'] ?? null)) }}</td>
        </tr>
        <tr>
            <td class="k">Drug Resistance</td><td colspan="5">{{ $dash($lbl('drugResistance', $classification['drugResistance'] ?? null)) }}</td>
        </tr>
    </table>

    <div class="section-title">Drug Regimen</div>
    <table class="grid">
        <tr>
            <th>Date Start</th><th>4FDC</th><th>2FDC</th><th>H</th><th>R</th><th>Z</th><th>E</th>
            <th>Strength</th><th>Unit</th>
        </tr>
        @forelse ($regimenRows as $r)
            <tr>
                <td>{{ $dash($r['dateStart'] ?? null) }}</td>
                <td>{{ $dash($r['drug4fdc'] ?? null) }}</td>
                <td>{{ $dash($r['drug2fdc'] ?? null) }}</td>
                <td>{{ $dash($r['drugH'] ?? null) }}</td>
                <td>{{ $dash($r['drugR'] ?? null) }}</td>
                <td>{{ $dash($r['drugZ'] ?? null) }}</td>
                <td>{{ $dash($r['drugE'] ?? null) }}</td>
                <td>{{ $dash($r['strength'] ?? null) }}</td>
                <td>{{ $dash($r['unit'] ?? null) }}</td>
            </tr>
        @empty
            <tr><td colspan="9" class="muted">No regimen recorded.</td></tr>
        @endforelse
    </table>

    <div class="section-title">D. Administration of Drugs — Treatment Supporter &amp; Phases</div>
    <table class="kv">
        <tr>
            <td class="k">Location of Treatment</td><td>{{ $dash($lbl('locationOfTreatment', $supporter['locationOfTreatment'] ?? null)) }}</td>
            <td class="k">Tx Supporter</td><td>{{ $dash($supporter['supporterName'] ?? null) }}</td>
            <td class="k">Designation</td><td>{{ $dash($supporter['supporterDesignation'] ?? null) }}</td>
        </tr>
        <tr>
            <td class="k">Supporter Type</td><td>{{ $dash($supporter['supporterType'] ?? null) }}</td>
            <td class="k">Contact Info</td><td>{{ $dash($supporter['contactInfo'] ?? null) }}</td>
            <td class="k">DAT-supported</td><td>{{ ($supporter['datSupported'] ?? false) ? 'Yes' : 'No' }}</td>
        </tr>
        <tr>
            <td class="k">Schedule</td><td colspan="5">{{ $dash($supporter['scheduleOfTreatment'] ?? null) }}</td>
        </tr>
        <tr>
            <td class="k">Intensive Phase</td><td>{{ $dash($phases['intensiveStart'] ?? null) }} — {{ $dash($phases['intensiveEnd'] ?? null) }}</td>
            <td class="k">Continuation Phase</td><td>{{ $dash($phases['continuationStart'] ?? null) }} — {{ $dash($phases['continuationEnd'] ?? null) }}</td>
            <td class="k">Adherence</td><td><span class="badge">{{ $adherence }}%</span></td>
        </tr>
    </table>

    <div class="section-title">Administration of Drugs — Dose Calendar</div>
    <table class="cal">
        <tr>
            <th class="month">Month</th>
            @for ($d = 1; $d <= 31; $d++)<th>{{ $d }}</th>@endfor
            <th>Total</th><th>Cum.</th><th>%</th><th>Wt</th><th>Ht</th>
        </tr>
        @forelse ($months as $m)
            @php $days = $m['days'] ?? []; @endphp
            <tr>
                <td class="month">{{ ($m['monthIndex'] ?? '') }} · {{ $m['label'] ?? '' }}</td>
                @for ($d = 0; $d < 31; $d++)<td>{{ $days[$d] ?? '' }}</td>@endfor
                <td>{{ $m['monthlyTotal'] ?? 0 }}</td>
                <td>{{ $m['cumulativeDoses'] ?? 0 }}</td>
                <td>{{ $m['monthlyPercent'] ?? 0 }}</td>
                <td>{{ $m['weightKg'] ?? '' }}</td>
                <td>{{ $m['heightCm'] ?? '' }}</td>
            </tr>
        @empty
            <tr><td colspan="37" class="muted">No dose calendar recorded.</td></tr>
        @endforelse
    </table>
    <div class="muted" style="margin-top:3px">
        Legend: initials = supervised dose &middot; X = absent &middot; I = incomplete regimen &middot; HOLD = on hold &middot; [ ] = drugs dispensed &middot; // = shift to continuation phase
    </div>

    <div class="section-title">E. Serious Adverse Events / AEs of Special Interest</div>
    <table class="grid">
        <tr><th>Date of AE</th><th style="text-align:left">Specific AE</th><th>Date Reported to FDA</th></tr>
        @forelse ($adverseEvents as $ae)
            <tr>
                <td>{{ $dash($ae['dateOfAe'] ?? null) }}</td>
                <td style="text-align:left">{{ $dash($ae['specificAe'] ?? null) }}</td>
                <td>{{ $dash($ae['dateReportedToFda'] ?? null) }}</td>
            </tr>
        @empty
            <tr><td colspan="3" class="muted">No adverse events recorded.</td></tr>
        @endforelse
    </table>
</body>
</html>
