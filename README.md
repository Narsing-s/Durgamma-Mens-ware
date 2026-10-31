# Durgamma Menswear

A responsive men's fashion storefront built with Next.js 15, React, TypeScript, Tailwind CSS and Supabase.

## Storefront experience

- Responsive charcoal, ivory and muted-gold visual identity
- Product search, category and budget filters, sorting and wishlist
- Persistent shopping bag with size selection and quantity controls
- Style Finder, Mix & Match Studio and curated Capsule Lookbook
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
4. Configure the Supabase URL, anon key and service-role key in local environment variables or Vercel project settings. Never expose the service-role key to the browser.
5. Configure both Upstash Redis REST variables before enabling order creation; the server-side order route fails closed when rate limiting is unavailable.

See [Production backend setup](docs/PRODUCTION_BACKEND.md) for the full launch checklist.

## Deployment

Import this repository into Vercel as a Next.js project. The GitHub Actions workflow runs the production build on pushes and pull requests to the main branch.

## Before accepting live orders

- Replace sample catalogue data and sample photography with accurate, store-owned product content.
- Confirm Supabase catalogue products and variants match the displayed products and selected sizes.
- Configure delivery serviceability, shipping rules, customer support, returns, privacy and terms.
- Configure transactional order notifications and operational order fulfilment.
- Run the full build and checkout tests with production-like data.
- For Razorpay, complete test-mode checkout, signature verification, webhook idempotency, cancellation and refund testing before enabling online payment.
- Add a secure, role-protected admin workflow before exposing product, inventory or order management to staff.

The repository is a development storefront and must not be treated as production-ready until the launch checklist is complete.
