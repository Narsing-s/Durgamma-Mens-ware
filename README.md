# Durgamma Menswear

A responsive men's fashion storefront built with Next.js 15, React, TypeScript, Tailwind CSS and Supabase.

## Storefront experience

- Responsive charcoal, ivory and muted-gold visual identity
- Live product discovery from Supabase: product details, images, prices, sizes and available stock
- Search, dynamic categories, budget filters, sorting and wishlist with one reset action
- Demo catalogue and working local preview bag shown when Supabase is not configured; real order submission remains locked until live database and inventory are connected
- Responsive product cards with accessible quick-add controls
- Owner-only manual product photo uploads (JPG, PNG, WebP) with preview and replacement
- Editable selling price and MRP/original price with server-side validation and automatic storefront discount display
- Multiple size/colour variants with SKU and stock controls, including customer-facing colour selection
- Customer order tracking by secure link or order number plus checkout email
- Transactional order/status/delivery emails through Resend when sender credentials are configured
- Customer delivery OTP verification before an order can be marked delivered
- Seven-day return/exchange requests with eligibility checks, inspection stages and auditable manual refund references
- Admin return processing and enforced order fulfilment transitions
- Cart quantity limits, clear shipping estimate and server-verified checkout totals
- Persistent shopping bag with size selection and quantity controls
- One Style Finder for guided product discovery, with no duplicate outfit-builder navigation
- Size guide and installable PWA manifest
- Checkout with server-calculated order totals and Cash on Delivery flow

## Payment status

Razorpay server-side order creation, payment verification, cancellation and webhook routes are retained as a staged integration. Online payment is intentionally not selectable in the customer checkout yet. Cash on Delivery is the default payment option. Do not enable Razorpay until test credentials, webhook configuration, database setup and end-to-end payment tests have been completed.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Supabase setup

1. Create a Supabase project.
2. Review and apply `supabase/schema.sql` in the SQL editor.
3. Add real products and active size/colour variants. Product names, variant sizes and stock must match the catalogue used at checkout.
4. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and the server-only `SUPABASE_SERVICE_ROLE_KEY` in your hosting environment. Never expose the service-role key to the browser or commit credentials.
5. Checkout and customer tracking/return endpoints use Supabase-backed rate limiting; apply the corresponding database migrations before accepting live traffic.

Apply the [secure order tracking migration](supabase/migrations/20261031_secure_order_tracking.sql), the real-store operations, inventory audit, PIN shipping, product media/returns, rate-limit and [delivery OTP/refund migration](supabase/migrations/20261105_delivery_otp_and_refunds.sql) in dependency order. The latest migration adds expiring delivery OTPs, tracking rate limits and refund audit fields. Run it in Supabase SQL Editor before deploying this branch. The product media migration creates the public-read `product-images` storage bucket; uploads are restricted to the authenticated owner route. Customer returns are accepted only for delivered orders within 7 days, and the database prevents duplicate active requests. See [Production backend setup](docs/PRODUCTION_BACKEND.md) for full migration and launch requirements.

## Deployment

Deploy this Next.js application to a compatible Node.js host or a supported Next.js platform. The GitHub Actions workflow runs the production build on pushes and pull requests to the main branch. For Cloudflare, use the supported Next.js-on-Workers adapter rather than a static Pages export because this app uses API routes.

## Before accepting live orders

- Replace sample catalogue data and sample photography with accurate, store-owned product content.
- Confirm Supabase catalogue products and variants match the displayed products and selected sizes.
- Configure delivery serviceability, shipping rules, customer support, returns, privacy and terms.
- Configure transactional email using `RESEND_API_KEY` and `ORDER_EMAIL_FROM` (the sender must use a domain verified in Resend); test confirmation, status, delivery-OTP and delivered emails.
- Confirm the seven-day return policy and eligibility criteria before publishing them to customers.
- Run the full build and checkout tests with production-like data.
- For Razorpay, complete test-mode checkout, signature verification, webhook idempotency, cancellation and refund testing before enabling online payment.
- Configure the owner’s Supabase Auth account and exact `STORE_ADMIN_EMAILS` allow-list, then verify owner access to product, inventory and order management before launch.

The repository includes a working local preview bag and a live-store checkout flow. When Supabase is not configured, sample products can be added to the preview bag, but checkout is intentionally disabled; preview products are not real inventory and cannot create orders. When Supabase, the required database migrations, service-role access, Supabase-backed rate limiting and serviceable delivery PIN codes are configured, customers can place Cash on Delivery orders against live stock. The admin dashboard is protected by Supabase email/password authentication and the `STORE_ADMIN_EMAILS` allow-list. Create the owner user in Supabase Authentication → Users, enable the Email provider, and add that exact email to `STORE_ADMIN_EMAILS`. Configure the application URL and allowed redirect URLs under Authentication → URL Configuration. Carrier integration and online payments are not yet enabled. Customer tracking and operational email notifications require the new database migration and Resend sender configuration described above.

## Customer accounts

The storefront includes a customer account page at `/account` with email/password sign-up, sign-in, password reset, and sign-out. It uses the existing Supabase browser client and does not require a separate customer-password table.

Before enabling customer accounts in production:

1. In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to `https://durgamma-mens-ware.vercel.app`.
2. Add `https://durgamma-mens-ware.vercel.app/account` to the Redirect URLs allowlist. For local development, also add `http://localhost:3000/account`.
3. In Vercel, ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured for the deployment.
4. Configure Supabase email templates and SMTP delivery if you want reliable production confirmation and password-reset emails.

Customer sign-up may require email confirmation depending on the Supabase Auth settings. The existing `STORE_ADMIN_EMAILS` allowlist remains separate: creating a customer account does not grant store-admin access.
