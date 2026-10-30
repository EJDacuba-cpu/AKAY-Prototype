<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Your AKAY account</title>
</head>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
                    <tr>
                        <td style="background:#b91c1c;padding:18px 24px;color:#ffffff;">
                            <div style="font-size:20px;font-weight:800;letter-spacing:0.04em;">AKAY</div>
                            <div style="font-size:12px;opacity:0.9;margin-top:4px;">Community EHR & Referral Tracking</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:28px 24px;">
                            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#111827;">You're now in AKAY</h1>
                            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">
                                Hello {{ $name }},
                            </p>
                            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">
                                The Municipal Health Officer created your AKAY account.
                            </p>
                            @if ($facility || $roleLabel)
                                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
                                    @if ($facility)Facility: {{ $facility }}<br>@endif
                                    @if ($roleLabel)Role: {{ $roleLabel }}@endif
                                </p>
                            @endif
                            <p style="margin:0 0 24px;">
                                <a href="{{ $inviteUrl }}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 18px;font-size:14px;font-weight:700;">
                                    Set up your account
                                </a>
                            </p>
                            <p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#64748b;">
                                This link works once and expires in 48 hours.
                            </p>
                            <p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#64748b;">
                                If the button does not work, copy and paste this link into your browser:<br>
                                <span style="word-break:break-all;color:#b91c1c;">{{ $inviteUrl }}</span>
                            </p>
                            <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                                If you did not expect this email, do not open the link and tell your MHO.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
