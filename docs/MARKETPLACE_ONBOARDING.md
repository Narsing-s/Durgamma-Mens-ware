# Marketplace onboarding for Durgamma Menswear

Current status: seller registration / approval has not been confirmed for any channel. This is an onboarding preparation guide, not a claim that marketplace APIs are connected.

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

- Amazon India: https://sell.amazon.in/
  - Register in Amazon Seller Central and complete business/tax verification.
  - SP-API is a separate developer onboarding process. Amazon's official documentation states private seller applications require a Professional selling account; confirm current India plan charges before upgrading.
  - Official SP-API registration: https://developer-docs.amazon.com/sp-api/docs/sp-api-registration-overview
  - API access also requires application registration and seller authorisation: https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api
- JioMart: https://identity.seller.jiomart.com/seller_interest_form
  - Submit the official seller interest form and confirm that the fashion/apparel category is currently accepting sellers.
  - JioMart lists brand authorisation, trademark or MSME proof as possible onboarding information; follow the current portal requirements.
  - Ask JioMart onboarding to confirm whether API access or an approved integration partner is available for your account. Do not assume public API access.
  - Seller information: https://identity.seller.jiomart.com/jiomartseller
- AJIO Commerce: https://seller.ajio.com/ajiocommerce/
  - Apply through AJIO Commerce / Reliance Seller Central.
  - AJIO lists GSTIN, PAN, trademark certificate or brand-authorisation letter and bank details among its seller requirements.
  - Official requirements: https://seller.ajio.com/ajiocommerce/resources/
  - Complete brand review and obtain written confirmation of integration access before building catalogue/order sync.
- Snapdeal: https://setu.snapdeal.com/
  - Register through the official Snapdeal seller onboarding flow with contact, GST and bank details, then complete store and pickup information.
  - Snapdeal provides seller APIs for inventory, pricing and order management. API access is separate from seller registration; request API-user approval and platform-issued credentials.
  - Official API overview: https://sellerapis.snapdeal.com/reference/overview
  - API authentication: https://sellerapis.snapdeal.com/reference/api-authentication

Shopsy is part of the Flipkart seller ecosystem. Treat it as a Flipkart channel rather than creating a duplicate independent connection unless Flipkart issues separate access.

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
