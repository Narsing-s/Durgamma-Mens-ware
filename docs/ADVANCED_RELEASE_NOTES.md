# Advanced storefront delivery notes

## Implemented in this release

- Authenticated customer order history at `/account`.
- The order-history API validates the Supabase access token server-side and requires a verified email address.
- Results are scoped to the authenticated email and limited to the latest 50 orders.
- Customer responses omit delivery address, phone, tracking-token hashes and other unnecessary personal data.
- Private responses use `Cache-Control: no-store`.
- CI now runs repository integrity tests, production checks, TypeScript validation and a production build.
- CodeQL runs on pushes, pull requests and a weekly schedule.

## Customer order history security model

Orders currently use checkout email as the ownership key. The API requires an authenticated Supabase user with a confirmed email and queries only orders whose checkout email exactly matches that verified email. This avoids adding an unverified customer identifier to historical orders. Customers who checked out with a different email will not see those orders in this account view; they can continue to use the existing secure order tracking flow.

The API returns only order summary, line items, status events, courier details and return-request status. It never returns the shipping address, phone number, raw tracking token or token hash. Responses are not cacheable.

## Features that still require external setup or business decisions

These are deliberately not enabled by code-only changes:

- Live Razorpay checkout: requires gateway credentials, verified webhook configuration and end-to-end test-mode sign-off.
- Courier automation: requires a selected carrier account, API credentials, pickup/return configuration and serviceable PIN-code coverage. Manual courier tracking remains available.
- SMS/WhatsApp: requires a provider account, approved templates and customer consent.
- Push notifications: requires VAPID keys, service-worker notification UX and opt-in.
- AI shopping assistant: requires a product-content and recommendation policy plus a model/provider budget and moderation.
- Coupons, loyalty and referrals: require owner-approved discount, expiry, liability and anti-abuse rules before financial incentives are offered.
- Automated profit analytics: requires cost-of-goods, tax, shipping and payment-fee data; sales totals alone must not be presented as profit.
- Invoices: require the store's legal entity, GSTIN (if applicable), invoice numbering and tax rules.

## Required launch checks

1. Apply `supabase/migrations/20261108_customer_order_history_index.sql` after the existing migrations.
2. Ensure Supabase email confirmation is enabled for customer accounts.
3. Configure the same canonical site URL in Vercel and Supabase Auth.
4. Run `npm test`, `npm run verify:store`, `npx tsc --noEmit` and `npm run build`.
5. Verify a customer sees only orders placed with their verified email, and a different account receives no matching orders.
6. Test empty order history, expired sessions, unverified accounts and Supabase outage behavior.
