# Real store launch guide

This project is designed to become a real store, not a demo. Apply the database migrations and configure every operational dependency before accepting customer orders.

## Customer flow

**Shop → Product → Bag → Checkout → Order tracking**

Keep this flow simple. Do not add duplicate carts, checkout buttons or competing product-discovery tools.

## Store-owner operations

Use one protected admin area for:

- Product and variant management
- Inventory and low-stock review
- Order status updates
- Delivery/serviceability configuration
- Return and exchange requests
- Sales reporting

Owner authentication must be implemented with server-side role checks before exposing any admin page or API. Never use a client-side-only password or expose `SUPABASE_SERVICE_ROLE_KEY`.

## Apply database migrations

After applying `supabase/schema.sql`, apply all files in `supabase/migrations/` in order, including:

- secure order tracking
- payment recovery, when applicable
- `20261101_real_store_operations.sql`

The real-store operations migration adds:

- order status history
- safe owner status transitions
- inventory restoration on cancellation
- PIN-code delivery rules
- return/exchange request records

## Delivery

Populate `delivery_pincodes` only with serviceable PIN codes and real shipping charges. Do not show estimated delivery dates until delivery rules or a logistics provider can support them.

## Before launch

- Add real store-owned products, photographs, prices and stock.
- Test every size and colour variant.
- Verify checkout against live inventory.
- Configure rate limiting and Supabase secrets.
- Test cancellation and confirm stock is restored once.
- Test private tracking links.
- Add real contact, privacy, terms and return policies.
- Test the complete journey on mobile and desktop.
- Enable online payment only after gateway signature, webhook, failure and refund tests pass.

## Important

The app must fail safely when critical services are unavailable. It is better to temporarily stop checkout than accept an order whose stock, total or payment status cannot be verified.
