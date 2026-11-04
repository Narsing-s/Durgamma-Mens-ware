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

export async function sendStoreEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<StoreEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ORDER_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.warn('Order email not sent: RESEND_API_KEY or ORDER_EMAIL_FROM is missing.');
    return { sent: false, reason: 'not_configured', warning: 'Order saved, but email is not configured. Add RESEND_API_KEY and ORDER_EMAIL_FROM to the production hosting environment, then redeploy.' };
  }

  // Resend production senders must belong to a domain verified in the same Resend account.
  const address = from.match(/<([^<>]+)>/)?.[1] || from;
  const domain = address.split('@')[1]?.toLowerCase();
  const consumerDomains = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'yahoo.com', 'yahoo.co.in', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  ]);
  if (!domain || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || consumerDomains.has(domain)) {
    console.error('Invalid store email sender. ORDER_EMAIL_FROM must use a domain verified in Resend.');
    return {
      sent: false,
      reason: 'invalid_sender',
      warning: 'Order saved, but its email was not sent. Verify a domain you own in Resend, then set ORDER_EMAIL_FROM to an address on that domain (for example, Durgamma Menswear <orders@yourdomain.com>) in Production and redeploy. A personal Gmail address cannot be used as the store sender.',
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('Resend rejected the order email:', response.status, detail.slice(0, 500));
      return {
        sent: false,
        reason: 'provider_error',
        warning: 'Order saved, but Resend rejected the email. Check Resend → Emails for the provider error. Verify the sender domain and make sure RESEND_API_KEY belongs to the same Resend account.',
      };
    }
    const result = await response.json().catch(() => ({}));
    console.info('Resend accepted store email:', typeof result?.id === 'string' ? result.id : 'accepted');
    return { sent: true };
  } catch (error) {
    console.error('Order email request failed:', error);
    return { sent: false, reason: 'network_error', warning: 'Order saved, but the app could not contact Resend. Check production function logs and retry from the admin order screen.' };
  }
}
