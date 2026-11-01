# Production backend and launch setup

## Current storefront state

The storefront uses the Durgamma charcoal, ivory and muted-gold design system. When Supabase is configured, the shop page reads active products, prices, descriptions, image URLs and active size/colour variants from `/api/catalog`. Search, dynamic categories, budget filters, sorting and wishlist are kept together in one shop section. The separate static outfit builder was removed; Style Finder remains the single guided-discovery tool.

When Supabase is not configured, the shop displays a clearly labelled sample preview and disables add-to-bag. Preview data cannot be checked out. With Supabase configured, only active database products appear; quick-add is enabled only for sizes with stock. The bag stores the exact database variant ID, and checkout revalidates that same variant and quantity against live inventory. Keep the catalogue populated with accurate, store-owned photography and product data.

## Architecture

- Next.js App Router: storefront and server API routes.
- Supabase Postgres: products, size/colour variants, stock, orders, immutable order-item snapshots, delivery PIN rules and order status history.
- Server-side order creation: database prices are authoritative; stock reservation is performed in a database transaction.
- Upstash Redis REST: fail-closed rate limiting for order and payment creation.
- Razorpay: server routes for gateway order creation, signature verification, cancellation and signed webhook handling are retained but customer-facing online payment is staged and disabled.
- Vercel: host the storefront and server routes; store secrets only as encrypted environment variables.

## Supabase

1. Create a Supabase project in a region suitable for Indian customers.
2. Review and apply `supabase/schema.sql`. For an existing installation, apply the required migrations under `supabase/migrations/`, including `20261030_payment_recovery.sql` where needed and `20261031_secure_order_tracking.sql` for private order tracking.
3. Apply `20261101_real_store_operations.sql`, `20261101_inventory_audit.sql` and `20261101_pincode_shipping_enforcement.sql` after the base schema and secure tracking migration, in dependency order. Review existing migration history before reapplying functions.
4. Add real products, images and size/colour variants through the owner-only admin dashboard.
5. Keep Row Level Security enabled. Only active catalogue rows are public. Orders, order items and webhook records have no public read/write policies.
6. Keep the service-role key server-only. Never put it in a `NEXT_PUBLIC_*` variable.
7. Ensure product names and size values in the active catalogue match the cart mapping used by checkout.

## Environment variables

Copy `.env.example` to `.env.local` for local development. Configure the following in Vercel Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `NEXT_PUBLIC_SITE_URL`
- `STORE_ADMIN_EMAILS` (comma-separated exact owner email allow-list; each owner must have a Supabase Auth account)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Razorpay variables are reserved for the later payment activation:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Never commit real credentials or expose secret keys to browser code.

## Checkout and payment status

Cash on Delivery is the default checkout method. The order endpoint validates customer and delivery details, applies rate limiting, requires a serviceable PIN code, calls the trusted database function, calculates the total from database prices and reserves stock atomically. Checkout PIN validation is only a user-friendly pre-check; the database independently enforces serviceability and configured shipping charges at order creation. On success, the server creates a 256-bit random tracking token, stores only its SHA-256 hash, and returns the token once as a private `/track` link. Tracking lookup returns order status and item summary only; it never returns customer email, phone or address. Apply the tracking migration and configure Upstash before relying on this feature.

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
- Use the owner-only admin dashboard to manage products, publish drafts, update stock with an audit trail, configure delivery PIN codes, and review orders and return requests.
- Verify the `STORE_ADMIN_EMAILS` allow-list, owner login, order status transitions and inventory restoration using a non-production test order.
- Configure backups, monitoring, access reviews and rate limits.
- Run mobile, accessibility, inventory-race and end-to-end checkout tests before launch.

## Honest scope boundary

The repository does not yet contain customer sign-in/order-history, carrier API integration, transactional notification delivery or live Razorpay checkout. The owner must configure real products, delivery PIN codes, support contacts, and store policies before launch. These require store-owner decisions, authentication/authorization and service credentials; the storefront should not pretend those capabilities are active.
