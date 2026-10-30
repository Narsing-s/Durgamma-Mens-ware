"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

type Props = { onExplore: (category: string) => void };
const occasions = [
  { id: "everyday", label: "Everyday", note: "Effortless, repeat-worthy essentials" },
  { id: "work", label: "Work & meetings", note: "Polished pieces with quiet confidence" },
  { id: "weekend", label: "Weekend", note: "Relaxed layers and easy movement" },
  { id: "evening", label: "Evening out", note: "Sharper silhouettes after dark" },
];
const fits = [
  { id: "classic", label: "Classic", note: "Clean, balanced proportions" },
  { id: "relaxed", label: "Relaxed", note: "Room to move, never oversized" },
  { id: "tailored", label: "Tailored", note: "A more structured finish" },
];
const palettes = [
  { id: "neutrals", label: "Quiet neutrals", swatches: ["#e8dfcf", "#b9aa91", "#373832"] },
  { id: "dark", label: "After-dark", swatches: ["#171713", "#343a43", "#77736b"] },
  { id: "earth", label: "Earth tones", swatches: ["#a18a68", "#6d7054", "#d2c0a1"] },
];
export default function StyleFinder({ onExplore }: Props) {
  const [occasion, setOccasion] = useState("everyday");
  const [fit, setFit] = useState("classic");
  const [palette, setPalette] = useState("neutrals");
  const result = useMemo(() => {
    const category = occasion === "work" ? "Shirts" : occasion === "weekend" ? "Jeans" : occasion === "evening" ? "Trousers" : fit === "relaxed" ? "T-Shirts" : "All";
    const title = occasion === "work" ? "The considered professional" : occasion === "weekend" ? "The off-duty original" : occasion === "evening" ? "The after-hours edit" : "The everyday signature";
    const detail = palette === "dark" ? "Build around deep tones, crisp contrast and understated texture." : palette === "earth" ? "Layer warm, grounded shades for a naturally confident look." : "Keep it light, tonal and versatile with pieces that work together.";
    return { category, title, detail };
  }, [occasion, fit, palette]);
  return <section className="style-atelier" id="style-atelier">
    <div className="atelier-intro"><p className="eyebrow"><Sparkles size={13}/> YOUR PERSONAL STYLE EDIT</p><h2>Find your <em>uniform.</em></h2><p>Three quick choices. One direction that feels like you. No rules, just a better starting point.</p><div className="atelier-mark">DM<br/><span>STYLE / 001</span></div></div>
    <div className="atelier-builder">
      <div className="atelier-step"><span>01 / OCCASION</span><div className="atelier-options">{occasions.map(x=><button key={x.id} className={occasion===x.id?"selected":""} onClick={()=>setOccasion(x.id)}><b>{x.label}</b><small>{x.note}</small></button>)}</div></div>
      <div className="atelier-step"><span>02 / YOUR FIT</span><div className="atelier-options fit-options">{fits.map(x=><button key={x.id} className={fit===x.id?"selected":""} onClick={()=>setFit(x.id)}><b>{x.label}</b><small>{x.note}</small></button>)}</div></div>
      <div className="atelier-step"><span>03 / COLOUR MOOD</span><div className="palette-options">{palettes.map(x=><button key={x.id} className={palette===x.id?"selected":""} onClick={()=>setPalette(x.id)}><span className="swatches">{x.swatches.map(c=><i key={c} style={{backgroundColor:c}}/>)}</span><b>{x.label}</b></button>)}</div></div>
      <div className="atelier-result"><div><span>YOUR EDIT IS READY</span><h3>{result.title}</h3><p>{result.detail}</p></div><button onClick={()=>onExplore(result.category)}>EXPLORE THIS EDIT <ArrowRight size={16}/></button></div>
    </div>
  </section>;
}
