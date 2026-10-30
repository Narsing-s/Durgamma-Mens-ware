# Durgamma Menswear

Premium-inspired men's fashion storefront built with Next.js, React, TypeScript and Tailwind CSS.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Included in this first storefront version

- Responsive layout for mobile, tablet and desktop
- Premium charcoal, ivory and muted-gold visual identity
- Product collection with category filters and search
- Wishlist interactions
- Shopping bag drawer and subtotal calculation
- Newsletter form placeholder

## Important before taking real orders

This is currently a storefront prototype. It does not yet save orders or process payments. Before launch, connect a product/order database, inventory and size variants, address capture, Razorpay checkout for UPI/cards, Cash on Delivery order handling, verified payment webhooks, order confirmations and admin access. Store all payment secrets in Vercel environment variables, never in client-side code.

## Vercel

Import this repository into Vercel as a Next.js project. Build command: `npm run build`. The current demo needs no environment variables.
