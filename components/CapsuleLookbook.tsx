"use client";
import { ArrowRight, Plus, Sparkles } from "lucide-react";

type Look = { id: string; name: string; mood: string; description: string; products: number[]; total: number; image: string; label: string };
const looks: Look[] = [
  { id: "weekday", name: "The 9-to-5 Edit", mood: "MONDAY TO FRIDAY", description: "A crisp shirt and tailored lines that move from the first meeting to the last call.", products: [1, 6], total: 3298, image: "photo-1507398941214-572c25f4b1dc", label: "THE POLISHED SET" },
  { id: "offduty", name: "The Off-Duty Set", mood: "SLOW WEEKENDS", description: "A relaxed tee with straight denim. Easy proportions, considered every time.", products: [2, 3], total: 2698, image: "photo-1515886657613-9f3515b0c78f", label: "THE WEEKEND UNIFORM" },
  { id: "afterdark", name: "The After-Hours Edit", mood: "DINNER / CITY NIGHTS", description: "A dark polo and clean trousers. Understated, confident and ready after dark.", products: [5, 6], total: 2798, image: "photo-1617137968427-85924c800a22", label: "THE NIGHT SHIFT" }
];
export default function CapsuleLookbook({ onAddLook }: { onAddLook: (ids: number[]) => void }) {
  return <section className="capsule-lookbook" id="capsule-lookbook">
    <div className="capsule-heading"><div><p className="eyebrow"><Sparkles size={13}/> THE CAPSULE WARDROBE</p><h2>One look.<br/><em>Already figured out.</em></h2></div><p>Less time deciding. More ways to wear it. Discover ready-made combinations from the DURGAMMA edit.</p></div>
    <div className="capsule-grid">{looks.map((look, i) => <article className="capsule-card" key={look.id}>
      <div className="capsule-photo"><img src={`https://images.unsplash.com/${look.image}?w=900&q=85&fit=crop`} alt={look.name} loading="lazy"/><span>0{i + 1} / 03</span><b>{look.label}</b></div>
      <div className="capsule-copy"><span>{look.mood}</span><h3>{look.name}</h3><p>{look.description}</p><div className="capsule-bottom"><strong>FROM ₹{look.total.toLocaleString("en-IN")}</strong><button onClick={() => onAddLook(look.products)}>ADD THE LOOK <Plus size={15}/></button></div></div>
    </article>)}</div>
    <div className="capsule-footnote">CURATED COMBINATIONS · SELECTED PIECES ADDED IN SIZE M — YOU CAN ADJUST SIZES IN YOUR BAG</div>
  </section>;
}
