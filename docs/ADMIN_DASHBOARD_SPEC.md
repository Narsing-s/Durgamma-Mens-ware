# Admin Dashboard Implementation Specification

This document defines the single owner-facing control centre for Durgamma Menswear.

## Security boundary

The admin dashboard must not be exposed by a client-only password, localStorage flag, or hidden navigation link.

Before enabling /admin, configure Supabase Auth and create a server-side owner allow-list using STORE_ADMIN_EMAILS. Every admin API route must verify the authenticated user on the server and confirm the user's email is in the owner allow-list. Return 401 for unauthenticated requests and 403 for authenticated non-owners. Never expose SUPABASE_SERVICE_ROLE_KEY in browser code.

## Single dashboard

Dashboard → Products → Inventory → Orders → Delivery → Returns → Reports → Settings

Do not create duplicate management pages.

## Required operations

Products: create, edit, activate or archive products; manage SKU, size, colour and stock variants; validate unique SKU and non-negative stock.

Orders: use the trusted set_store_order_status database function and record every transition. Valid fulfilment path is Pending → Confirmed → Packed → Shipped → Delivered. Cancellation restores inventory once.

Inventory: show low-stock variants and use controlled stock adjustments with an audit trail.

Delivery: manage only serviceable PIN codes. Customer shipping information must come from configured rules.

Returns: review requests and move them through supported statuses only after verifying the original order.

## Launch gate

Keep admin controls disabled until server-side authorization is implemented and tested. The customer storefront can continue operating without exposing admin controls.
