import Link from 'next/link';

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-[#fbfaf7] px-6 text-center text-[#171713]"><div><p className="text-[10px] tracking-[.28em] text-[#9b8255]">DURGAMMA MENSWEAR</p><h1 className="mt-6 font-serif text-7xl">404</h1><p className="mt-4 text-sm text-[#77756e]">This page has stepped out of the collection.</p><Link href="/" className="mt-8 inline-flex bg-[#171713] px-7 py-4 text-[10px] tracking-[.18em] text-white">RETURN TO THE STORE →</Link></div></main>;
}
