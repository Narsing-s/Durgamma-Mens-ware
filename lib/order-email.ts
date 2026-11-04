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

function validateSender(from: string): { email: string; name: string } | null {
  const match = from.match(/^(.*?)\s*<([^<>]+)>$/);
  const email = (match?.[2] || from).trim();
  const name = (match?.[1] || 'Durgamma Menswear').replace(/^["']|["']$/g, '').trim();
  const domain = email.split('@')[1]?.toLowerCase();
  const consumerDomains = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'yahoo.com', 'yahoo.co.in', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  ]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !domain || consumerDomains.has(domain)) return null;
  return { email, name: name || 'Durgamma Menswear' };
}

export async function sendStoreEmail(input: EmailInput): Promise<StoreEmailResult> {
  const from = process.env.ORDER_EMAIL_FROM?.trim();
  // Brevo is the recommended free provider. Resend remains available by setting EMAIL_PROVIDER=resend.
  const provider = (process.env.EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'resend')).trim().toLowerCase();
  const apiKey = provider === 'brevo'
    ? process.env.BREVO_API_KEY?.trim()
    : provider === 'resend'
      ? process.env.RESEND_API_KEY?.trim()
      : undefined;

  if (!['brevo', 'resend'].includes(provider)) {
    console.error('Unsupported EMAIL_PROVIDER. Use brevo or resend.');
    return { sent: false, reason: 'not_configured', warning: 'Order saved, but the email provider setting is invalid. Set EMAIL_PROVIDER to brevo or resend.' };
  }
  if (!apiKey || !from) {
    console.warn('Order email not sent: provider API key or ORDER_EMAIL_FROM is missing.');
    const keyName = provider === 'brevo' ? 'BREVO_API_KEY' : 'RESEND_API_KEY';
    return { sent: false, reason: 'not_configured', warning: `Order saved, but email is not configured. Add ${keyName} and ORDER_EMAIL_FROM to the production hosting environment, then redeploy.` };
  }

  const sender = validateSender(from);
  if (!sender) {
    console.error('Invalid store email sender. ORDER_EMAIL_FROM must use a domain verified with the selected email provider.');
    return {
      sent: false,
      reason: 'invalid_sender',
      warning: `Order saved, but its email was not sent. Verify a domain you own in ${provider === 'brevo' ? 'Brevo' : 'Resend'}, then set ORDER_EMAIL_FROM to an address on that domain (for example, Durgamma Menswear <orders@yourdomain.com>) in Production and redeploy. A personal Gmail address cannot be used as the store sender.`,
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
        ? {
            sender,
            to: [{ email: input.to }],
            subject: input.subject,
            textContent: input.text,
            htmlContent: input.html,
          }
        : { from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(`${provider} rejected the order email:`, response.status, detail.slice(0, 500));
      return {
        sent: false,
        reason: 'provider_error',
        warning: `Order saved, but ${provider === 'brevo' ? 'Brevo' : 'Resend'} rejected the email. Check the provider's transactional email logs, verify the sender domain and confirm the API key belongs to the same account.`,
      };
    }
    const result = await response.json().catch(() => ({}));
    const messageId = typeof result?.messageId === 'string' ? result.messageId
      : typeof result?.id === 'string' ? result.id : 'accepted';
    console.info(`${provider} accepted store email:`, messageId);
    return { sent: true };
  } catch (error) {
    console.error(`Order email request failed via ${provider}:`, error);
    return { sent: false, reason: 'network_error', warning: 'Order saved, but the app could not contact the email provider. Check production function logs and retry from the admin order screen.' };
  }
}
