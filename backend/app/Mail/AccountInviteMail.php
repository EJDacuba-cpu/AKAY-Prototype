<?php

namespace App\Mail;

use App\Models\AccountInvite;
use App\Services\StaffRoles;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AccountInviteMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public AccountInvite $invite,
        public string $inviteUrl,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "You're now in AKAY",
        );
    }

    public function content(): Content
    {
        $user = $this->invite->user()->with(['barangayHealthCenter', 'ruralHealthUnit'])->first();

        return new Content(
            view: 'emails.account-invite',
            with: [
                'name' => $user?->name ?? 'AKAY user',
                'facility' => $user?->barangayHealthCenter?->name ?: $user?->ruralHealthUnit?->name,
                'roleLabel' => StaffRoles::label($user?->staff_role),
            ],
        );
    }
}
