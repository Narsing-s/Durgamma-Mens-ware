# Marketplace onboarding for Durgamma Menswear

Current status: no seller accounts are registered or approved. This is an onboarding preparation guide, not a claim that marketplace APIs are connected.

## Seller registration

- Flipkart: https://seller.flipkart.com/
  - Register the business as a seller.
  - After seller approval, use Seller Dashboard → Manage Profile → Developer Access to create a self-access application for the seller's own integration.
  - Official API getting started: https://flipkart.github.io/fk-api-platform-docs/docs/intro
  - Seller portal login credentials are not API credentials. Keep application secrets and tokens server-side.
- Meesho: https://supplier.meesho.com/
  - Follow the supplier registration and verification flow.
  - Meesho's published registration guide lists mobile/email verification, GSTIN verification, pickup address, bank account and store name. Follow the current supplier portal for the eligibility route applicable to the business.
  - Official guide: https://supplier.int.meeshogcp.in/learning-hub/lessons/how-to-register-on-meesho-lesson
- Myntra: https://partners.myntrainfo.com/Register
  - Apply for partner / brand onboarding and confirm business and brand eligibility with Myntra.
  - After approval, use the official Myntra Marketplace Integration Platform (MMIP) documentation: https://mmip.myntrainfo.com/
  - Do not assume individual-seller eligibility; confirm the current requirements directly with Myntra.

## Integration sequence after approval

1. Collect seller IDs and platform-issued API access for each approved channel.
2. Store credentials only in hosting-provider server-side environment variables or a dedicated secret store. Never commit credentials, expose them through NEXT_PUBLIC variables, or send them to browser code.
3. Create explicit SKU mappings from Durgamma product variants to each marketplace listing / seller SKU.
4. Validate product title, category, size/colour attributes, images, MRP, selling price, tax and fulfilment configuration against each platform's current templates.
5. Implement per-platform adapters with token refresh, rate-limit handling, retries, idempotency and audit logs.
6. Begin with controlled listing and inventory tests; enable order, shipment, cancellation and return sync only after reconciliation tests pass.

## Important operational safeguards

- Do not publish products, change stock or accept marketplace orders until seller approval and API authorisation are confirmed.
- Keep marketplace order IDs and source-channel identifiers distinct from Durgamma website order IDs.
- Prevent overselling with a shared stock allocation/reservation strategy; do not blindly overwrite stock from asynchronous webhooks.
- Never mark a marketplace order shipped, delivered or refunded unless the platform confirms the operation.
- Meesho API access and Myntra integration permissions must be confirmed in the seller / partner portal. Do not build against unofficial endpoints.
