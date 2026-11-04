# Production backend and launch setup

## Current storefront state

The storefront uses the Durgamma charcoal, ivory and muted-gold design system. When Supabase is configured, the shop page reads active products, prices, descriptions, image URLs and active size/colour variants from `/api/catalog`. Search, dynamic categories, budget filters, sorting and wishlist are kept together in one shop section. The separate static outfit builder was removed; Style Finder remains the single guided-discovery tool.

When Supabase is not configured, the shop displays a clearly labelled sample preview with selectable sample sizes and a working local preview bag. Preview data cannot be submitted as a real order; checkout remains locked until Supabase catalogue, stock, delivery rules and order services are configured. With Supabase configured, only active database products appear; customers can select available size/colour combinations, and quick-add is enabled only for in-stock variants. The bag stores the exact database variant ID, and checkout revalidates that same variant and quantity against live inventory. Keep the catalogue populated with accurate, store-owned photography and product data.

## Architecture

- Next.js App Router: storefront and server API routes.
- Supabase Postgres: products, size/colour variants, stock, orders, immutable order-item snapshots, delivery PIN rules and order status history.
- Server-side order creation: database prices are authoritative; stock reservation is performed in a database transaction.
- Upstash Redis REST: fail-closed rate limiting for order and payment creation.
- Razorpay: server routes for gateway order creation, signature verification, cancellation and signed webhook handling are retained but customer-facing online payment is staged and disabled.
- Deployment: use a compatible Next.js Node.js host (Vercel or Netlify); store secrets only as encrypted environment variables. Set `NEXT_PUBLIC_SITE_URL` to the exact public origin. Email links, metadata, robots and sitemap URLs resolve from this setting, with request-origin fallback for server-generated links.

## Supabase

1. Create a Supabase project in a region suitable for Indian customers.
2. Review and apply `supabase/schema.sql`. For an existing installation, apply the required migrations under `supabase/migrations/`, including `20261030_payment_recovery.sql` where needed and `20261031_secure_order_tracking.sql` for private order tracking.
3. Apply `20261101_real_store_operations.sql`, `20261101_inventory_audit.sql` and `20261101_pincode_shipping_enforcement.sql` after the base schema and secure tracking migration, in dependency order.
4. Apply `20261102_product_media_and_returns.sql` and `20261102_store_workflow_hardening.sql` after the order and return foundation migrations. Review existing migration history before reapplying functions.
5. Apply `20261105_delivery_otp_and_refunds.sql` after the return-request foundation; it adds delivery OTP fields, tracking rate limits and refund audit data.
6. Apply `20261106_email_order_confirmation.sql` after the order-status workflow migration; it adds expiring, single-use customer confirmation tokens and the secure pending → confirmed/cancelled transition.
7. Add real products, upload store-owned images, and create all size/colour variants through the owner-only admin dashboard.
8. Keep Row Level Security enabled. Only active catalogue rows are public. Orders, order items and webhook records have no public read/write policies.
9. Keep the service-role key server-only. Never put it in a `NEXT_PUBLIC_*` variable.
10. Ensure product names and size values in the active catalogue match the cart mapping used by checkout.

## Environment variables

Copy `.env.example` to `.env.local` for local development. Configure the following in the hosting provider's project environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `NEXT_PUBLIC_SITE_URL` (canonical public origin)
- `EMAIL_PROVIDER=gmail` (recommended for a zero-budget launch; `brevo` and `resend` remain optional alternatives)
- `GMAIL_USER` (the Gmail account that sends store notifications)
- `GMAIL_APP_PASSWORD` (Google App Password; server-only; never use your normal Gmail password)
- `ORDER_EMAIL_FROM` (optional display name and the same Gmail address, e.g. `Durgamma Menswear <store@gmail.com>`)
- `BREVO_API_KEY` and `RESEND_API_KEY` (optional; not needed for Gmail)
- `STORE_ADMIN_EMAILS` (comma-separated exact owner email allow-list)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Free Gmail SMTP setup (recommended for a zero-budget launch)

1. Use the Gmail account you want customers to receive store notifications from.
2. Enable **2-Step Verification** in that Google Account.
3. Open Google's [App passwords](https://myaccount.google.com/apppasswords) page and create an app password for the store. Google may not show this option for some managed or Advanced Protection accounts.
4. In Vercel → Project → Settings → Environment Variables, add `EMAIL_PROVIDER=gmail`, `GMAIL_USER` (your Gmail address), and `GMAIL_APP_PASSWORD` (the generated 16-character app password). Optionally set `ORDER_EMAIL_FROM` to `Durgamma Menswear <same-gmail-address>`.
5. Set the variables for **Production** and redeploy. Never paste the app password into GitHub, source code, or chat.
6. Place a low-value test order using an email address you can access. Check inbox, spam and Vercel function logs.

The Gmail implementation uses authenticated SMTP over TLS and is shared by the existing order email hooks, so it covers checkout confirmation and other lifecycle notifications that already call `sendStoreEmail`. It requires no custom domain or paid email-provider account. Gmail has account sending limits and anti-abuse restrictions; it is suitable for low-volume startup use, not guaranteed bulk mail.

### Brevo / Resend alternatives

If you later own a domain, you can switch `EMAIL_PROVIDER` to `brevo` or `resend`, configure that provider's API key and set `ORDER_EMAIL_FROM` to a sender on the authenticated domain. Exactly one provider is used per notification; do not configure multiple providers expecting automatic fallback.

Checkout returns an `emailWarning` when sending fails. Server logs record provider rejection details without exposing API keys or confirmation tokens.

Set the same `NEXT_PUBLIC_SITE_URL` as the Supabase Auth Site URL and include `/account` in the allowed redirect URLs. Redeploy after changing environment variables.

Razorpay variables are reserved for later payment activation:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Never commit real credentials or expose secret keys to browser code.

## Checkout and payment status

Cash on Delivery is the default checkout method. The order endpoint validates customer and delivery details, applies rate limiting, requires a serviceable PIN code, calls the trusted database function, calculates the total from database prices and reserves stock atomically. Checkout PIN validation is only a user-friendly pre-check; the database independently enforces serviceability and configured shipping charges at order creation. On success, the server creates a 256-bit random tracking token, stores only its SHA-256 hash, and returns the token once as a private `/track` link. Tracking lookup returns order status and item summary only; it never returns customer email, phone or address. Apply the tracking migration and configure Upstash before relying on this feature.

Razorpay server routes remain in the codebase, but the online option is disabled in the checkout UI by design. Do not enable it merely by adding credentials. Before activation:

1. Configure Razorpay test credentials and webhook secret in the hosting environment.
2. Confirm the live Supabase catalogue and variant stock are correct.
3. Test order creation and server-calculated amount cross-checks.
4. Test successful capture, failed payment, checkout dismissal, cancellation and inventory release.
5. Verify webhook signatures and duplicate-event handling.
6. Confirm the customer receives a durable order confirmation and support can reconcile payment/order states.
7. Complete test-mode sign-off before switching to live credentials.

## Launch checklist

- Replace demo products and remote sample imagery with owned photography and accurate descriptions.
- Validate garment size charts and supplier-specific fit information.
- Configure shipping charges, serviceable PIN codes and delivery estimates.
- Publish customer support details, privacy policy, terms, cancellation, return and refund policies.
- Configure the selected transactional email provider (Brevo Free is supported; Resend remains an option) and verify pending-order confirmation, customer confirmation/cancellation, order-status, delivery OTP, delivered and return/exchange notification emails. SMS and carrier integrations are not currently enabled.
- Use the owner-only admin dashboard to manage products, upload photos directly from a computer or phone (JPG/PNG/WebP, max 5 MB), preview selected photos, replace product photos, edit selling price and MRP, create size/colour variants, publish drafts, update stock with an audit trail, configure delivery PIN codes, and process return/exchange requests.
- Selling price is stored in `price_inr`; optional MRP/original price is stored in `compare_at_price_inr`. The server rejects an MRP below the selling price. Keep MRP accurate and do not use an inflated reference price.
- Customers can request a return or exchange from their private tracking link within 7 days of delivery. The database checks eligibility and prevents duplicate active requests.
- Order status transitions are enforced as pending → confirmed → packed → shipped → delivered, with cancellation allowed before shipment.
- Verify the `STORE_ADMIN_EMAILS` allow-list, owner login, order status transitions and inventory restoration using a non-production test order.
- Configure backups, monitoring, access reviews and rate limits.
- Run mobile, accessibility, inventory-race and end-to-end checkout tests before launch.

## Honest scope boundary

The repository includes customer sign-in/account screens and transactional email hooks through Gmail SMTP, Brevo or Resend, but it does not yet provide a consolidated customer order-history dashboard, carrier API integration, SMS delivery or live Razorpay checkout. Email sending is conditional on valid Gmail App Password/SMTP access (or credentials for a domain-authenticated provider); a successful order response with `emailSent: false` means the order exists but the notification was not delivered. Product image uploads require the product-media migration and a public `product-images` Supabase Storage bucket; uploads are accepted only by the owner-authenticated server route. The owner must configure real products, delivery PIN codes, support contacts, and store policies before launch. These require store-owner decisions, authentication/authorization and service credentials; the storefront should not pretend those capabilities are active.
