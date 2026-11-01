export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] || char);
}

export async function sendStoreEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn('Order email not sent: configure RESEND_API_KEY and ORDER_EMAIL_FROM.');
    return { sent: false, reason: 'not_configured' };
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
      console.error('Order email provider rejected the message:', response.status, detail.slice(0, 500));
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (error) {
    console.error('Order email delivery failed:', error);
    return { sent: false, reason: 'network_error' };
  }
}
