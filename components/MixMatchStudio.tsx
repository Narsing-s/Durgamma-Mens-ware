"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Layers3, Sparkles } from "lucide-react";

type Piece = { id:number; name:string; price:number; image:string; shade:string };
const tops:Piece[]=[
 {id:1,name:"The Signature Oxford",price:1499,image:"photo-1596755094514-f87e34085b2c",shade:"Ivory"},
 {id:2,name:"Everyday Essential Tee",price:799,image:"photo-1521572163474-6864f9cf17ab",shade:"White"},
 {id:4,name:"Modern Fit Linen Shirt",price:1699,image:"photo-1602810318383-e386cc2a3ccf",shade:"Sand"},
 {id:5,name:"Classic Polo Shirt",price:999,image:"photo-1625910513413-5fc45c2fcb42",shade:"Black"}
];
const bottoms:Piece[]=[
 {id:3,name:"Relaxed Straight Denim",price:1899,image:"photo-1542272604-787c3835535d",shade:"Indigo"},
 {id:6,name:"Tailored Smart Trousers",price:1799,image:"photo-1473966968600-fa801b869a1a",shade:"Charcoal"}
];
const layers:Piece[]=[
 {id:8,name:"Premium Denim Jacket",price:2499,image:"photo-1551028719-00167b16eac5",shade:"Blue"}
];
function PiecePicker({title,items,value,onChange,optional=false}:{title:string;items:Piece[];value:number|null;onChange:(id:number|null)=>void;optional?:boolean}){
 return <div className="mix-picker"><div className="mix-picker-title"><span>{title}</span>{optional&&<button onClick={()=>onChange(null)}>NO LAYER</button>}</div><div className="mix-options">{items.map(p=><button key={p.id} className={value===p.id?"active":""} onClick={()=>onChange(p.id)}><img src={`https://images.unsplash.com/${p.image}?w=180&q=75&fit=crop`} alt="" loading="lazy"/><span><b>{p.name}</b><small>{p.shade} · ₹{p.price.toLocaleString("en-IN")}</small></span>{value===p.id&&<Check size={15}/>}</button>)}</div></div>
}
export default function MixMatchStudio({onAddLook}:{onAddLook:(ids:number[],size:string)=>void}){
 const [top,setTop]=useState<number|null>(1),[bottom,setBottom]=useState<number|null>(6),[layer,setLayer]=useState<number|null>(null),[lookSize,setLookSize]=useState("M");
 const selected=useMemo(()=>[...tops,...bottoms,...layers].filter(p=>[top,bottom,layer].includes(p.id)),[top,bottom,layer]);
 const total=selected.reduce((sum,p)=>sum+p.price,0);
 return <section className="mix-studio" id="mix-studio">
  <div className="mix-heading"><p className="eyebrow"><Sparkles size={13}/> THE INTERACTIVE FIT ROOM · 002</p><h2>Your look.<br/><em>Your rules.</em></h2><p>Build a combination that feels like you. Start with a top, pair your bottom, then add a layer if the mood calls for it.</p></div>
  <div className="mix-workspace">
   <div className="mix-preview"><div className="mix-preview-top"><span>LIVE OUTFIT PREVIEW</span><span>DM / STUDIO</span></div><div className="mix-preview-images">{selected.map((p,i)=><div key={p.id} className={i===0?"mix-main-image":"mix-secondary-image"}><img src={`https://images.unsplash.com/${p.image}?w=700&q=85&fit=crop`} alt={p.name}/><span>{i===0?"01 / TOP":i===1?"02 / BOTTOM":"03 / LAYER"}</span></div>)}</div><div className="mix-preview-bottom"><div><small>YOUR COMBINATION</small><b>{selected.map(p=>p.shade).join(" + ")}</b></div><div><small>OUTFIT TOTAL</small><strong>₹{total.toLocaleString("en-IN")}</strong></div></div></div>
   <div className="mix-controls"><PiecePicker title="01 / CHOOSE YOUR TOP" items={tops} value={top} onChange={setTop}/><PiecePicker title="02 / PAIR YOUR BOTTOM" items={bottoms} value={bottom} onChange={setBottom}/><PiecePicker title="03 / ADD A LAYER" items={layers} value={layer} onChange={setLayer} optional/><div className="mix-size-choice"><span>CHOOSE ONE SIZE FOR THIS OUTFIT</span><div>{["S","M","L","XL","XXL"].map(s=><button type="button" key={s} className={lookSize===s?"chosen":""} onClick={()=>setLookSize(s)} aria-pressed={lookSize===s}>{s}</button>)}</div></div><div className="mix-add-row"><div><small>YOUR EDIT · {selected.length} PIECES</small><b>₹{total.toLocaleString("en-IN")}</b></div><button onClick={()=>onAddLook(selected.map(p=>p.id),lookSize)}>ADD OUTFIT · SIZE {lookSize} <ArrowRight size={16}/></button></div></div>
  </div>
  <p className="mix-note"><Layers3 size={13}/> SELECT A SIZE BEFORE ADDING. YOU CAN ADJUST EACH ITEM SEPARATELY IN YOUR BAG.</p>
 </section>;
}
