<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AKAY Password Reset</title>
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
                            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#111827;">Your password reset request has been approved.</h1>
                            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">
                                Hello {{ $resetRequest->user?->name ?? 'AKAY user' }},
                            </p>
                            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
                                Use the secure one-time link below to create a new password for your AKAY account. This link expires at
                                <strong>{{ optional($resetRequest->expires_at)->format('M d, Y h:i A') }}</strong>.
                            </p>
                            <p style="margin:0 0 24px;">
                                <a href="{{ $resetUrl }}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 18px;font-size:14px;font-weight:700;">
                                    Set new password
                                </a>
                            </p>
                            <p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#64748b;">
                                If the button does not work, copy and paste this link into your browser:<br>
                                <span style="word-break:break-all;color:#b91c1c;">{{ $resetUrl }}</span>
                            </p>
                            <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
                                If you did not request this password reset, contact your administrator immediately. AKAY will never email your password.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
