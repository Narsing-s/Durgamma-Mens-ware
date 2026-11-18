'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type Gate = 'checking' | 'allowed' | 'denied';

const channels = [
  {
    name: 'Flipkart',
    stage: 'Seller registration required',
    description: 'Register Durgamma Menswear as a seller first. After approval, create a self-access API application in Seller Dashboard → Manage Profile → Developer Access. Seller login credentials alone do not grant API access.',
    register: 'https://seller.flipkart.com/',
    docs: 'https://flipkart.github.io/fk-api-platform-docs/docs/intro',
    requirements: ['Business and tax details requested by Flipkart', 'Approved seller account and seller ID', 'API application ID and secret created in Developer Access'],
  },
  {
    name: 'Meesho',
    stage: 'Supplier registration required',
    description: 'Create a supplier account and complete the supplier-panel verification. Meesho’s published onboarding guide describes mobile/email verification, GSTIN verification, pickup address, bank account and store name.',
    register: 'https://supplier.meesho.com/',
    docs: 'https://supplier.int.meeshogcp.in/learning-hub/lessons/how-to-register-on-meesho-lesson',
    requirements: ['Mobile number and email access', 'GSTIN or the applicable non-GST enrolment route offered by Meesho', 'Pickup address and matching bank details'],
  },
  {
    name: 'Myntra',
    stage: 'Brand / partner approval required',
    description: 'Apply through Myntra’s partner onboarding route and confirm that Durgamma Menswear’s business and brand meet its eligibility requirements. After approval, use MMIP documentation and the credentials issued for your seller account.',
    register: 'https://partners.myntrainfo.com/Register',
    docs: 'https://mmip.myntrainfo.com/',
    requirements: ['Business / brand eligibility confirmation', 'GST and business documents requested during onboarding', 'Myntra seller / merchant approval and MMIP access'],
  },
  {
    name: 'Amazon India',
    stage: 'Seller registration + SP-API approval required',
    description: 'Register in Amazon Seller Central. After the seller account is active, complete the SP-API developer onboarding and create/authorise an application. Amazon states private SP-API seller apps require a Professional selling account; check current India plan fees before upgrading.',
    register: 'https://sell.amazon.in/',
    docs: 'https://developer-docs.amazon.com/sp-api/docs/sp-api-registration-overview',
    requirements: ['Business, PAN/GST details as applicable and active bank account', 'Active Seller Central account', 'SP-API developer profile, application registration and seller authorisation'],
  },
  {
    name: 'JioMart',
    stage: 'Seller interest / onboarding required',
    description: 'Submit the official JioMart seller interest form or contact its onboarding team. Ask JioMart to confirm fashion-category acceptance and whether API or approved integration-partner access is available for your seller account.',
    register: 'https://identity.seller.jiomart.com/seller_interest_form',
    docs: 'https://identity.seller.jiomart.com/jiomartseller',
    requirements: ['Business name and contact details', 'GST status and pickup pincode', 'Brand authorisation, trademark or MSME proof if requested', 'Written confirmation of integration/API access before development'],
  },
  {
    name: 'AJIO Commerce',
    stage: 'Brand / seller onboarding required',
    description: 'Apply through AJIO Commerce / Reliance Seller Central. AJIO lists GSTIN, PAN, brand trademark or authorisation proof and bank details among its seller requirements. Complete brand review before planning catalogue sync.',
    register: 'https://seller.ajio.com/ajiocommerce/',
    docs: 'https://seller.ajio.com/ajiocommerce/resources/',
    requirements: ['Regular GSTIN and PAN', 'Trademark certificate or brand-authorisation letter', 'Bank account and KYC details', 'AJIO seller approval and any integration access issued to the account'],
  },
  {
    name: 'Snapdeal',
    stage: 'Seller registration + API access request required',
    description: 'Register through Snapdeal Seller Onboarding. Its Seller API documentation covers inventory, pricing and order management; API access requires a separate API-user request and platform-issued credentials.',
    register: 'https://setu.snapdeal.com/',
    docs: 'https://sellerapis.snapdeal.com/reference/overview',
    requirements: ['Mobile number, email, GST and bank details', 'Store and pickup-address details', 'Approved seller account', 'Snapdeal API-user approval and separate sandbox/production access tokens'],
  },
];

export default function MarketplaceOnboardingPage() {
  const [gate, setGate] = useState<Gate>('checking');
  const [message, setMessage] = useState('Verifying store administrator access…');

  useEffect(() => {
    let active = true;
    const verify = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (active) { setGate('denied'); setMessage('Store authentication is not configured.'); }
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (active) { setGate('denied'); setMessage('Please sign in to the store administration first.'); }
        return;
      }
      try {
        const response = await fetch('/api/admin/store', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
        });
        if (!response.ok) throw new Error('Your account is not authorised to manage this store.');
        if (active) { setGate('allowed'); setMessage('Owner access verified. Marketplace accounts are not connected yet.'); }
      } catch (error) {
        if (active) { setGate('denied'); setMessage(error instanceof Error ? error.message : 'Could not verify store access.'); }
      }
    };
    void verify();
    return () => { active = false; };
  }, []);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <Link href="/admin" className="admin-back">← Store control centre</Link>
          <h1>Marketplace integrations</h1>
          <small>Durgamma Menswear · Seller onboarding</small>
        </div>
        <div className="admin-header-actions"><Link href="/admin">Back to admin</Link></div>
      </header>
      <section className="admin-section">
        <h2>Explore and connect sales channels</h2>
        <p>Marketplace seller accounts are not yet confirmed as registered or approved. Use these official onboarding links to explore additional channels; live API synchronisation cannot start until each platform grants seller access and the required credentials.</p>
        <p className="admin-message" role="status">{message}</p>
        {gate === 'allowed' ? (
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16,marginTop:20}}>
              {channels.map(channel => (
                <article key={channel.name} style={{border:'1px solid #d9d2c5',borderRadius:14,padding:18,background:'#fff'}}>
                  <p className="eyebrow">NOT CONNECTED</p>
                  <h3 style={{marginTop:4}}>{channel.name}</h3>
                  <strong>{channel.stage}</strong>
                  <p>{channel.description}</p>
                  <h4>Prepare these items</h4>
                  <ul>{channel.requirements.map(item => <li key={item}>{item}</li>)}</ul>
                  <div style={{display:'flex',flexWrap:'wrap',gap:12,marginTop:16}}>
                    <a className="gold-btn" href={channel.register} target="_blank" rel="noreferrer">Start registration ↗</a>
                    <a href={channel.docs} target="_blank" rel="noreferrer">Official guide ↗</a>
                  </div>
                </article>
              ))}
            </div>
            <div style={{marginTop:24,padding:18,border:'1px solid #d9d2c5',borderRadius:12}}>
              <h3>What happens after approval?</h3>
              <ol>
                <li>Securely configure each marketplace’s approved API credentials on the server only.</li>
                <li>Map your existing product SKUs, sizes, colours, images and prices to each marketplace catalogue.</li>
                <li>Test listing and inventory updates in the platform’s approved test process where available.</li>
                <li>Enable order, shipment, cancellation and return synchronisation after reconciliation tests.</li>
              </ol>
              <p>We will keep your website inventory and order records as the source of truth only after the marketplace stock rules and sync direction are agreed and tested. No live listings or orders are changed from this onboarding page.</p><p><strong>Note:</strong> Shopsy is part of the Flipkart seller ecosystem; treat it as a Flipkart channel rather than creating a duplicate independent connection unless Flipkart issues separate access.</p>
            </div>
          </>
        ) : gate === 'checking' ? <p>Checking permissions…</p> : (
          <p><Link href="/admin">Open store admin and sign in</Link>, then revisit this page.</p>
        )}
      </section>
    </main>
  );
}
