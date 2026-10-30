# Production backend setup

The current website is a polished storefront prototype. Its catalogue is demo data and checkout is intentionally disabled.

## Planned production architecture

- Supabase Postgres: products, size/colour variants, stock, orders and order-item snapshots.
- Server-only order API: validates customer/address/cart input, calculates prices from the database and reserves inventory in a database transaction.
- Razorpay: create payment orders on the server, verify signatures, and confirm payment only from a verified callback/webhook.
- Cash on Delivery: create an order with cod_due payment status and a pending fulfilment status.
- Vercel: host the Next.js storefront and server routes; store credentials only as encrypted environment variables.

## Supabase

1. Create a Supabase project in a region suitable for Indian customers.
2. Open SQL Editor and review/apply supabase/schema.sql.
3. Add products and their size/colour variants through a trusted admin workflow.
4. Keep Row Level Security enabled. The schema exposes only active catalogue rows publicly. Orders and order items have no public read/write policies.
5. Do not grant the create_store_order function to anon or authenticated until a server-side API with rate limiting, validation and abuse protection is implemented and reviewed.

## Environment variables

Copy .env.example to .env.local for local development. Add production values in Vercel Project → Settings → Environment Variables. Never place service-role or Razorpay secret keys in NEXT_PUBLIC_* variables, source files, GitHub commits or browser code.

## Payment launch gate

Razorpay checkout is not connected. Before accepting online payments, implement server-side order creation, signature verification and webhook idempotency; test successful, failed, cancelled and duplicate webhook events in Razorpay test mode. COD also requires a trusted order API and operational order notifications.

## Launch checklist

- Replace demo products and remote sample imagery with owned product photography and accurate supplier details.
- Validate all garment size charts, SKU/variant stock and final prices.
- Configure shipping charges, serviceable pincodes, delivery estimates, cancellation and return/refund policy.
- Add customer support contact details, privacy policy and terms of sale.
- Configure Supabase backups, access roles, rate limits, monitoring and transactional email.
- Test mobile checkout, accessibility, inventory races, order confirmation and refund flows before going live.
