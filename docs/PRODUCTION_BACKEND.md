# Production backend and launch setup

## Current storefront state

The storefront uses the Durgamma charcoal, ivory and muted-gold design system. It includes search, category and budget filters, sorting, wishlist, a persistent local shopping bag, size guide, Style Finder and Mix & Match Studio. Product discovery supports category, budget, search and sort controls without repeating the same navigation actions.

The shopping page still contains demo catalogue records and sample imagery. The checkout fetches the active Supabase catalogue and matches cart products and sizes to active database variants. Before accepting orders, replace demo content and ensure every displayed product and size has a matching active database record.

## Architecture

- Next.js App Router: storefront and server API routes.
- Supabase Postgres: products, size/colour variants, stock, orders and immutable order-item snapshots.
- Server-side order creation: database prices are authoritative; stock reservation is performed in a database transaction.
- Upstash Redis REST: fail-closed rate limiting for order and payment creation.
- Razorpay: server routes for gateway order creation, signature verification, cancellation and signed webhook handling are retained but customer-facing online payment is staged and disabled.
- Vercel: host the storefront and server routes; store secrets only as encrypted environment variables.

## Supabase

1. Create a Supabase project in a region suitable for Indian customers.
2. Review and apply `supabase/schema.sql`. For an existing installation, review and apply the payment recovery migration under `supabase/migrations/`.
3. Add real products, images and size/colour variants through a trusted admin process.
4. Keep Row Level Security enabled. Only active catalogue rows are public. Orders, order items and webhook records have no public read/write policies.
5. Keep the service-role key server-only. Never put it in a `NEXT_PUBLIC_*` variable.
6. Ensure product names and size values in the active catalogue match the cart mapping used by checkout.

## Environment variables

Copy `.env.example` to `.env.local` for local development. Configure the following in Vercel Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `NEXT_PUBLIC_SITE_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Razorpay variables are reserved for the later payment activation:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Never commit real credentials or expose secret keys to browser code.

## Checkout and payment status

Cash on Delivery is the default checkout method. The order endpoint validates customer and delivery details, applies rate limiting, calls the trusted database function, calculates the total from database prices and reserves stock atomically.

Razorpay server routes remain in the codebase, but the online option is disabled in the checkout UI by design. Do not enable it merely by adding credentials. Before activation:

1. Configure Razorpay test credentials and webhook secret in Vercel.
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
- Add transactional email/SMS notifications and a secure order fulfilment process.
- Implement admin access with verified authentication and server-side role checks before exposing product, stock or order management.
- Configure backups, monitoring, access reviews and rate limits.
- Run mobile, accessibility, inventory-race and end-to-end checkout tests before launch.

## Honest scope boundary

The repository does not yet contain a production admin dashboard, customer sign-in/order-history experience, delivery-provider integration or transactional notification service. These require store-owner decisions, authentication/authorization and service credentials; the storefront should not pretend those capabilities are active.
