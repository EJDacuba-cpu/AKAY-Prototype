<?php

namespace App\Mail;

use Google\Service\Gmail as GmailService;
use Google\Service\Gmail\Message as GmailMessage;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;

final class GmailApiTransport extends AbstractTransport
{
    public function __construct(
        private readonly GmailService $gmail
    ) {
        parent::__construct();
    }

    protected function doSend(SentMessage $message): void
    {
        // Preserve the complete Laravel-generated email,
        // including its HTML, text, and MIME headers.
        $raw = $message->toString();

        // Gmail API requires base64url-encoded email content.
        $encoded = rtrim(
            strtr(base64_encode($raw), '+/', '-_'),
            '='
        );

        $gmailMessage = new GmailMessage();
        $gmailMessage->setRaw($encoded);

        $this->gmail->users_messages->send(
            'me',
            $gmailMessage
        );
    }

    public function __toString(): string
    {
        return 'gmail_api';
    }
}
