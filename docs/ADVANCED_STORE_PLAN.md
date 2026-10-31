# Advanced storefront roadmap

This roadmap keeps the customer journey intentionally small: **Shop → Bag → Checkout**. Supporting tools belong in one owner-only admin area rather than being repeated in the storefront navigation.

## Already in the storefront

- Responsive product discovery with category, budget, text search and sort controls.
- Search matches product name, category, description and merchandising tag.
- Wishlist, persistent bag, size guide, Style Finder and Mix & Match outfit builder.
- Quantity controls, shipping threshold preview and server-calculated checkout totals.
- Cash on Delivery checkout with database-backed variant and stock validation.
- Razorpay server routes are staged but online payment remains disabled in the customer UI.

## Highest-priority additions before launch

1. **One catalogue source of truth** — replace the eight sample products and remote sample photos with products, images, prices and variants from Supabase. The storefront and checkout must read the same active catalogue. Do not let the customer add an unavailable size.
2. **Secure owner dashboard** — authenticated owner-only access with server-side role checks for product CRUD, image upload, SKU/size stock, order status and low-stock alerts. Never expose the Supabase service-role key in browser code.
3. **Order lifecycle** — COD checkout now issues a private, high-entropy tracking token; only its SHA-256 hash is stored. Customers can follow order status and item summary at `/track` without creating an account. Apply `supabase/migrations/20261031_secure_order_tracking.sql` before deploying this feature. Owner updates for confirmed, packed, shipped, delivered and cancelled still need a secure admin workflow.
4. **Delivery rules** — PIN-code serviceability, shipping charge rules, delivery estimate and return/exchange policy shown before payment.
5. **Notifications** — transactional email/SMS/WhatsApp notifications only after provider credentials, templates, consent and delivery-failure handling are configured.
6. **Payment activation** — Razorpay test-mode end-to-end tests for success, failure, dismissal, cancellation, webhook signature, duplicate events, amount verification and stock release. Keep COD available as a separate payment method. Enable live mode only after sign-off.
7. **Operations and quality** — inventory reconciliation, backups, monitoring, accessibility checks, mobile checkout tests and basic sales/order analytics.

## Keep the interface free of duplicate options

- Keep one primary Shop entry and one product grid.
- Keep category, budget, search and sort as complementary filters; provide one **Clear all filters** action.
- Keep one bag entry and one checkout action.
- Keep size help in the product size selector, not as repeated size-guide links in every navigation area.
- Keep outfit inspiration inside Style Finder / Outfit Builder; do not add another lookbook menu.
- Put owner-only operations in the admin dashboard, not in customer navigation.

## Release gates

Do not advertise customer accounts, reviews, coupons, newsletter signup, admin management, delivery integration or online payment as active until the underlying service and end-to-end tests exist. Tracking is available only after the Supabase tracking migration is applied and the Upstash rate-limit integration is configured. Do not invent product ratings, stock counts, delivery dates or return promises.
