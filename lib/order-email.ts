import nodemailer from 'nodemailer';

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

export type StoreEmailResult = {
  sent: boolean;
  reason?: 'not_configured' | 'invalid_sender' | 'provider_error' | 'network_error';
  warning?: string;
};

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function parseSender(from: string): { email: string; name: string } {
  const match = from.match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (match?.[2] || from).trim();
  const name = (match?.[1] || 'Durgamma Menswear').replace(/^["']|["']$/g, '').trim();
  return { email, name: name || 'Durgamma Menswear' };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function sendStoreEmail(input: EmailInput): Promise<StoreEmailResult> {
  const provider = (process.env.EMAIL_PROVIDER || 'gmail').trim().toLowerCase();

  if (provider === 'gmail') {
    const gmailUser = process.env.GMAIL_USER?.trim().toLowerCase();
    const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
    if (!gmailUser || !appPassword) {
      return {
        sent: false,
        reason: 'not_configured',
        warning: 'Order saved, but email is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to the Production environment, then redeploy.',
      };
    }

    const configuredFrom = process.env.ORDER_EMAIL_FROM?.trim();
    const sender = configuredFrom ? parseSender(configuredFrom) : { email: gmailUser, name: 'Durgamma Menswear' };
    if (!isValidEmail(gmailUser) || !isValidEmail(input.to) || sender.email.toLowerCase() !== gmailUser) {
      return {
        sent: false,
        reason: 'invalid_sender',
        warning: 'Order saved, but the Gmail sender settings are invalid. ORDER_EMAIL_FROM must use the same address as GMAIL_USER.',
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: gmailUser, pass: appPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });
      await transporter.sendMail({
        from: { name: sender.name, address: gmailUser },
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      console.info('Gmail accepted store email for delivery.');
      return { sent: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown SMTP error';
      console.error('Gmail order email failed:', detail);
      return {
        sent: false,
        reason: 'provider_error',
        warning: 'Order saved, but Gmail could not send the notification. Check that 2-Step Verification is enabled, the 16-character Google App Password is correct, and Gmail SMTP access is available. You can retry from the admin order screen.',
      };
    }
  }

  if (!['brevo', 'resend'].includes(provider)) {
    return {
      sent: false,
      reason: 'not_configured',
      warning: 'Order saved, but EMAIL_PROVIDER is invalid. Set it to gmail, brevo or resend.',
    };
  }

  const from = process.env.ORDER_EMAIL_FROM?.trim();
  const apiKey = provider === 'brevo' ? process.env.BREVO_API_KEY?.trim() : process.env.RESEND_API_KEY?.trim();
  if (!apiKey || !from) {
    const keyName = provider === 'brevo' ? 'BREVO_API_KEY' : 'RESEND_API_KEY';
    return {
      sent: false,
      reason: 'not_configured',
      warning: `Order saved, but email is not configured. Add ${keyName} and ORDER_EMAIL_FROM to the production environment, then redeploy.`,
    };
  }

  const sender = parseSender(from);
  const domain = sender.email.split('@')[1]?.toLowerCase();
  const consumerDomains = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'yahoo.com', 'yahoo.co.in', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  ]);
  if (!isValidEmail(sender.email) || !domain || consumerDomains.has(domain)) {
    return {
      sent: false,
      reason: 'invalid_sender',
      warning: `Order saved, but the sender must use a domain authenticated with ${provider === 'brevo' ? 'Brevo' : 'Resend'}. For a no-cost Gmail setup, switch EMAIL_PROVIDER to gmail and configure GMAIL_USER and GMAIL_APP_PASSWORD.`,
    };
  }

  try {
    const isBrevo = provider === 'brevo';
    const response = await fetch(isBrevo ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
      method: 'POST',
      headers: isBrevo
        ? { 'api-key': apiKey, 'Content-Type': 'application/json' }
        : { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(isBrevo
        ? { sender, to: [{ email: input.to }], subject: input.subject, textContent: input.text, htmlContent: input.html }
        : { from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`${provider} rejected store email:`, response.status, detail.slice(0, 500));
      return {
        sent: false,
        reason: 'provider_error',
        warning: `Order saved, but ${provider} rejected the email. Check its transactional email logs and sender-domain verification.`,
      };
    }
    return { sent: true };
  } catch (error) {
    console.error(`Order email request failed via ${provider}:`, error);
    return { sent: false, reason: 'network_error', warning: 'Order saved, but the email provider could not be reached. Check production logs and retry from the admin order screen.' };
  }
}
