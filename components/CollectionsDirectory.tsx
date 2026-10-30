'use client';

import { useState } from 'react';
import { ArrowUpRight, Check, Clock3, Shirt, Footprints, Dumbbell, Watch, BriefcaseBusiness, Layers3 } from 'lucide-react';

type Props = { onSelectCategory: (category: string) => void };

const collections = [
  { name: 'Innerwear', note: 'Briefs · Trunks · Vests', group: 'ESSENTIALS', status: 'soon', icon: 'layers' },
  { name: 'Lounge & Sleepwear', note: 'Relaxed sets · Pyjamas', group: 'ESSENTIALS', status: 'soon', icon: 'layers' },
  { name: 'T-Shirts', note: 'Crew neck · Oversized · Graphic', group: 'EVERYDAY', status: 'live', icon: 'shirt', category: 'T-Shirts' },
  { name: 'Shirts', note: 'Oxford · Linen · Casual', group: 'EVERYDAY', status: 'live', icon: 'shirt', category: 'Shirts' },
  { name: 'Polos', note: 'Smart casual · Classic fits', group: 'EVERYDAY', status: 'soon', icon: 'shirt' },
  { name: 'Jeans & Denim', note: 'Straight · Slim · Relaxed', group: 'BOTTOMS', status: 'live', icon: 'layers', category: 'Jeans' },
  { name: 'Trousers & Chinos', note: 'Tailored · Everyday · Formal', group: 'BOTTOMS', status: 'live', icon: 'layers', category: 'Trousers' },
  { name: 'Shorts', note: 'Casual · Active · Summer', group: 'BOTTOMS', status: 'soon', icon: 'layers' },
  { name: 'Activewear', note: 'Training · Running · Athleisure', group: 'SPORT', status: 'soon', icon: 'sport' },
  { name: 'Ethnic Wear', note: 'Kurtas · Nehru jackets · Festive', group: 'OCCASION', status: 'soon', icon: 'layers' },
  { name: 'Blazers & Suits', note: 'Office · Weddings · Events', group: 'OCCASION', status: 'soon', icon: 'formal' },
  { name: 'Jackets & Outerwear', note: 'Denim · Utility · Layers', group: 'LAYERS', status: 'live', icon: 'formal', category: 'Outerwear' },
  { name: 'Sneakers & Footwear', note: 'Everyday · Sports · Formal', group: 'FINISHING TOUCHES', status: 'soon', icon: 'shoe' },
  { name: 'Watches', note: 'Minimal · Classic · Statement', group: 'FINISHING TOUCHES', status: 'soon', icon: 'watch' },
  { name: 'Belts & Wallets', note: 'Leather · Everyday carry', group: 'FINISHING TOUCHES', status: 'soon', icon: 'formal' },
  { name: 'Bags & Accessories', note: 'Backpacks · Caps · Sunglasses', group: 'FINISHING TOUCHES', status: 'soon', icon: 'formal' }
];

const brands = [
  { name: 'Jockey', lane: 'INNERWEAR & LOUNGE', origin: 'Everyday comfort' },
  { name: 'XYXX', lane: 'INNERWEAR & LOUNGE', origin: 'Modern essentials' },
  { name: 'Levi’s', lane: 'DENIM & CASUAL', origin: 'Iconic denim' },
  { name: 'U.S. Polo Assn.', lane: 'POLOS & CASUAL', origin: 'Sport-inspired classics' },
  { name: 'Tommy Hilfiger', lane: 'PREMIUM CASUAL', origin: 'American classics' },
  { name: 'Calvin Klein', lane: 'PREMIUM ESSENTIALS', origin: 'Minimal essentials' },
  { name: 'Louis Philippe', lane: 'SMART & FORMAL', origin: 'Refined workwear' },
  { name: 'Van Heusen', lane: 'SMART & FORMAL', origin: 'Office-to-evening' },
  { name: 'Allen Solly', lane: 'SMART CASUAL', origin: 'Contemporary casual' },
  { name: 'Peter England', lane: 'EVERYDAY FORMAL', origin: 'Everyday tailoring' },
  { name: 'Jack & Jones', lane: 'DENIM & STREET', origin: 'Youthful casualwear' },
  { name: 'Nike', lane: 'SPORT & SNEAKERS', origin: 'Performance sportswear' },
  { name: 'Adidas', lane: 'SPORT & SNEAKERS', origin: 'Sport-inspired style' },
  { name: 'Puma', lane: 'SPORT & SNEAKERS', origin: 'Sport lifestyle' },
  { name: 'Reebok', lane: 'SPORT & SNEAKERS', origin: 'Training heritage' },
  { name: 'H&M', lane: 'CONTEMPORARY FASHION', origin: 'Trend-led essentials' },
  { name: 'Zara', lane: 'CONTEMPORARY FASHION', origin: 'Modern fashion' }
];

export default function CollectionsDirectory({ onSelectCategory }: Props) {
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const selectedBrand = brands.find((brand) => brand.name === activeBrand);
  const selectedCollection = collections.find((item) => item.name === activeCollection);

  return (
    <section className="collections-directory" aria-labelledby="collections-title">
      <div className="directory-heading">
        <div>
          <p className="eyebrow">THE COMPLETE MENSWEAR DESTINATION</p>
          <h2 id="collections-title">From the <em>first layer</em><br />to the final detail.</h2>
        </div>
        <p>Build your wardrobe your way. Explore everyday essentials, occasion dressing and the finishing touches.</p>
      </div>

      <div className="directory-kicker"><span>01 / SHOP BY COLLECTION</span><span>16 WARDROBE CATEGORIES</span></div>
      <div className="collection-directory-grid">
        {collections.map((item, index) => (
          <button key={item.name} className={'directory-card' + (activeCollection === item.name ? ' selected' : '')} onClick={() => {
            setActiveCollection(item.name);
            if (item.status === 'live' && item.category) onSelectCategory(item.category);
          }}>
            <span className="directory-card-top"><small>{String(index + 1).padStart(2, '0')} / {item.group}</small>{item.status === 'live' ? <Check size={15} /> : <Clock3 size={15} />}</span>
            <strong>{item.name}</strong>
            <span className="directory-card-note">{item.note}</span>
            <span className="directory-card-bottom">{item.status === 'live' ? 'SHOP AVAILABLE EDIT' : 'COMING SOON'} <ArrowUpRight size={14} /></span>
          </button>
        ))}
      </div>
      {selectedCollection && (
        <div className="directory-selection" aria-live="polite">
          <b>{selectedCollection.name}</b>
          <span>{selectedCollection.status === 'live' ? 'Showing the currently available demo edit in the shop above.' : 'We’re preparing this collection. Product selection and live stock will be added before launch.'}</span>
        </div>
      )}

      <div className="brand-directory">
        <div className="directory-kicker"><span>02 / BRAND DISCOVERY</span><span>17 LABELS TO EXPLORE</span></div>
        <div className="brand-directory-heading">
          <h3>Names that <em>define style.</em></h3>
          <p>Explore the labels on our brand discovery list. Select a name to see its style direction.</p>
        </div>
        <div className="brand-directory-grid">
          {brands.map((brand, index) => (
            <button key={brand.name} className={'brand-directory-card' + (activeBrand === brand.name ? ' selected' : '')} onClick={() => setActiveBrand(activeBrand === brand.name ? null : brand.name)}>
              <span>{String(index + 1).padStart(2, '0')}</span><strong>{brand.name}</strong><small>{brand.lane}</small><ArrowUpRight size={14} />
            </button>
          ))}
        </div>
        {selectedBrand && <div className="brand-detail" aria-live="polite"><span>BRAND STYLE NOTE</span><strong>{selectedBrand.name}</strong><p>{selectedBrand.origin} · {selectedBrand.lane.toLowerCase()}.</p><small>Discovery list only — no stock, partnership or authenticity claim is implied. Brand availability will be confirmed only after sourcing and verification.</small></div>}
        <p className="brand-disclaimer">Independent multi-brand store concept. These are third-party brand names shown for discovery and future assortment planning only; DURGAMMA MENSWEAR is not claiming affiliation or current authorised stock.</p>
      </div>
    </section>
  );
}
