import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Size & Fit Guide',
  description: 'A practical guide to choosing your Durgamma Menswear fit.',
};

const rows = [
  ['S', '36–38', '28–30', '36–38'],
  ['M', '38–40', '30–32', '38–40'],
  ['L', '40–42', '32–34', '40–42'],
  ['XL', '42–44', '34–36', '42–44'],
  ['XXL', '44–46', '36–38', '44–46'],
];

export default function SizeGuidePage() {
  return (
    <main className="min-h-screen bg-[#fbfaf7] text-[#171713]">
      <header className="border-b border-[#e7e1d6] px-6 py-6 sm:px-12">
        <Link href="/" className="text-xs tracking-[.22em]">← DURGAMMA MENSWEAR</Link>
      </header>
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-10 sm:py-24">
        <p className="mb-4 text-[10px] tracking-[.28em] text-[#9b8255]">THE DURGAMMA FIT NOTE</p>
        <h1 className="font-serif text-5xl sm:text-7xl">Find your <em className="text-[#a78b59]">fit.</em></h1>
        <p className="mt-6 max-w-2xl text-sm leading-7 text-[#77756e]">Use this general guide as a starting point. Measurements are body-measurement ranges in inches, not garment measurements. Product-specific fit notes should take priority when available.</p>
        <div className="mt-12 overflow-x-auto border-y border-[#e5e0d6]">
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead className="text-[10px] tracking-[.16em] text-[#9b8255]"><tr><th className="py-5">SIZE</th><th>BUST / CHEST</th><th>WAIST</th><th>HIP</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row[0]} className="border-t border-[#e5e0d6]"><th className="py-5 font-medium">{row[0]}</th>{row.slice(1).map((cell) => <td key={cell} className="py-5 text-[#66645e]">{cell} in</td>)}</tr>)}</tbody>
          </table>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          <article><h2 className="font-serif text-2xl">How to measure</h2><p className="mt-3 text-sm leading-7 text-[#77756e]">Chest: measure around the fullest part of your chest, keeping the tape level. Waist: measure around your natural waist without pulling the tape tight. Hip: measure around the fullest part of your hips.</p></article>
          <article><h2 className="font-serif text-2xl">Between sizes?</h2><p className="mt-3 text-sm leading-7 text-[#77756e]">Choose the larger size for a more relaxed feel, or the smaller size for a closer fit. If you are unsure, contact the store before placing an order.</p></article>
        </div>
        <p className="mt-10 border-l-2 border-[#b79a61] pl-4 text-xs leading-6 text-[#77756e]">Fit ranges are indicative and must be validated against the final supplier size charts before accepting customer orders.</p>
        <Link href="/#shop" className="mt-10 inline-flex bg-[#171713] px-7 py-4 text-[10px] tracking-[.18em] text-white">BACK TO THE COLLECTION →</Link>
      </section>
    </main>
  );
}
