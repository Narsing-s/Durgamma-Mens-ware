'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import Link from 'next/link';

type VariantDraft = { sku: string; size: string; colour: string; stock: string };
type ProductEdit = { name: string; category: string; description: string; price: string; mrp: string; image_url: string };

export default function AdminProductsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, ProductEdit>>({});
  const [editFiles, setEditFiles] = useState<Record<string, File>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [editPreviews, setEditPreviews] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', category: 'Menswear', description: '', price: '', mrp: '', slug: '', image_url: '' });
  const [variants, setVariants] = useState<VariantDraft[]>([{ sku: '', size: 'M', colour: 'Default', stock: '0' }]);
  useEffect(() => {
    if (!imageFile) { setImagePreview(''); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    const previews = Object.fromEntries(Object.entries(editFiles).map(([id, file]) => [id, URL.createObjectURL(file)]));
    setEditPreviews(previews);
    return () => Object.values(previews).forEach(URL.revokeObjectURL);
  }, [editFiles]);

  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;

  async function load(t = token) {
    if (!t) return;
    const response = await fetch('/api/admin/store', { headers: { Authorization: 'Bearer ' + t } });
    const data = await response.json();
    if (response.ok) setItems(data.products || []);
    else setMsg(data.error || 'Unable to load products.');
  }

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
        setToken(data.session.access_token);
        load(data.session.access_token);
      }
    });
  }, []);

  function updateVariant(index: number, field: keyof VariantDraft, value: string) {
    setVariants(current => current.map((variant, i) => i === index ? { ...variant, [field]: value } : variant));
  }

  function editValue(product: any): ProductEdit {
    return editValues[product.id] || {
      name: product.name,
      category: product.category,
      description: product.description || '',
      price: String(product.price_inr),
      mrp: product.compare_at_price_inr ? String(product.compare_at_price_inr) : '',
      image_url: product.image_url || '',
    };
  }

  function updateEdit(product: any, field: keyof ProductEdit, value: string) {
    setEditValues(current => ({ ...current, [product.id]: { ...editValue(product), [field]: value } }));
  }

  async function uploadImage(file: File): Promise<string> {
    const uploadData = new FormData();
    uploadData.append('file', file);
    const response = await fetch('/api/admin/products/image', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: uploadData,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Product image upload failed.');
    return result.imageUrl;
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMsg('');
    const skuSet = new Set(variants.map(v => v.sku.trim().toLowerCase()));
    const variantSet = new Set(variants.map(v => v.size.trim().toLowerCase() + '|' + (v.colour.trim() || 'default').toLowerCase()));
    if (!variants.length || variants.some(v => !v.sku.trim() || !v.size.trim() || !Number.isInteger(Number(v.stock)) || Number(v.stock) < 0) ||
        skuSet.size !== variants.length || variantSet.size !== variants.length) {
      setMsg('Each variant needs a unique SKU and unique size/colour combination, with valid opening stock.');
      return;
    }
    setSaving(true);
    try {
      const imageUrl = imageFile ? await uploadImage(imageFile) : form.image_url.trim();
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          name: form.name, category: form.category, description: form.description,
          price_inr: Number(form.price), compare_at_price_inr: form.mrp.trim() ? Number(form.mrp) : null, slug: form.slug || undefined, image_url: imageUrl,
          variants: variants.map(v => ({ sku: v.sku.trim(), size: v.size.trim(), colour: v.colour.trim() || 'Default', stock: Number(v.stock) })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create product.');
      setMsg('Product saved as a draft with ' + variants.length + ' variant(s). Review it and publish when ready.');
      setForm({ name: '', category: 'Menswear', description: '', price: '', mrp: '', slug: '', image_url: '' });
      setVariants([{ sku: '', size: 'M', colour: 'Default', stock: '0' }]);
      setImageFile(null);
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Could not create product.');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(product: any) {
    const values = editValue(product);
    setMsg('');
    try {
      const imageUrl = editFiles[product.id] ? await uploadImage(editFiles[product.id]) : values.image_url;
      const response = await fetch('/api/admin/products/' + product.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ name: values.name, category: values.category, description: values.description, price_inr: Number(values.price), compare_at_price_inr: values.mrp.trim() ? Number(values.mrp) : null, image_url: imageUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Product update failed.');
      setMsg('Product details updated.');
      setEditFiles(current => { const next = { ...current }; delete next[product.id]; return next; });
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Product update failed.');
    }
  }

  async function publish(id: string, active: boolean) {
    const response = await fetch('/api/admin/products/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ is_active: active }),
    });
    const data = await response.json();
    setMsg(response.ok ? 'Product visibility updated.' : data.error || 'Update failed.');
    if (response.ok) load();
  }

  if (!user) return <main className="admin-shell"><Link href="/admin">← Admin sign in</Link><p>Sign in to the main admin dashboard first, then open product management.</p></main>;

  return <main className="admin-shell">
    <Link href="/admin">← Store control centre</Link>
    <h1>Product management</h1>
    {msg && <p className="admin-message" role="status">{msg}</p>}
    <section className="admin-section">
      <h2>Create product</h2>
      <p>Products are saved as drafts. Add all size/colour variants and verify stock before publishing.</p>
      <form className="admin-product-form" onSubmit={create}>
        <input placeholder="Product name" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} required maxLength={120}/>
        <input placeholder="Category" value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} required maxLength={80}/>
        <input type="number" min="0" max="10000000" placeholder="Selling price (₹)" value={form.price} onChange={e => setForm(v => ({ ...v, price: e.target.value }))} required/>
        <input type="number" min="0" max="10000000" placeholder="MRP / original price (₹)" value={form.mrp} onChange={e => setForm(v => ({ ...v, mrp: e.target.value }))}/>
        <input placeholder="URL slug (optional)" value={form.slug} onChange={e => setForm(v => ({ ...v, slug: e.target.value }))}/>
        <input type="url" placeholder="Or paste an HTTPS image URL" value={form.image_url} onChange={e => { setForm(v => ({ ...v, image_url: e.target.value })); setImageFile(null); }}/>
        <label>Upload product photo (JPG, PNG or WebP, max 5 MB)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e: ChangeEvent<HTMLInputElement>) => setImageFile(e.target.files?.[0] || null)}/>
        </label>
        {imageFile && <div className="admin-image-preview"><img src={imagePreview} alt="Selected product preview"/><span>Selected: {imageFile.name}</span></div>}
        <textarea placeholder="Description" value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} maxLength={5000}/>
        <div className="admin-variant-list">
          <h3>Size and colour variants</h3>
          {variants.map((variant, index) => <div className="admin-variant-row" key={index}>
            <input aria-label={'SKU ' + (index + 1)} placeholder="SKU" value={variant.sku} onChange={e => updateVariant(index, 'sku', e.target.value)} required/>
            <input aria-label={'Size ' + (index + 1)} placeholder="Size (S, M, L, XL)" value={variant.size} onChange={e => updateVariant(index, 'size', e.target.value)} required/>
            <input aria-label={'Colour ' + (index + 1)} placeholder="Colour" value={variant.colour} onChange={e => updateVariant(index, 'colour', e.target.value)}/>
            <input aria-label={'Stock ' + (index + 1)} type="number" min="0" max="1000000" placeholder="Opening stock" value={variant.stock} onChange={e => updateVariant(index, 'stock', e.target.value)} required/>
            {variants.length > 1 && <button type="button" onClick={() => setVariants(current => current.filter((_, i) => i !== index))}>Remove</button>}
          </div>)}
          <button type="button" onClick={() => setVariants(current => [...current, { sku: '', size: 'M', colour: 'Default', stock: '0' }])}>+ Add another size / colour</button>
        </div>
        <button className="gold-btn" disabled={saving}>{saving ? 'SAVING PRODUCT…' : 'CREATE PRODUCT DRAFT'}</button>
      </form>
    </section>
    <section className="admin-section">
      <h2>Existing products</h2>
      {items.map(product => <div className="admin-product-item" key={product.id}>
        <div className="admin-row">
          <span><b>{product.name}</b><small>{product.category} · {product.product_variants?.length || 0} variants</small></span>
          <span>₹{product.price_inr}{product.compare_at_price_inr ? ' / MRP ₹' + product.compare_at_price_inr : ''} · {product.is_active ? 'Live' : 'Draft'} <button onClick={() => publish(product.id, !product.is_active)}>{product.is_active ? 'Unpublish' : 'Publish'}</button></span>
        </div>
        <details className="admin-edit-product">
          <summary>Edit product details</summary>
          <div className="admin-product-form">
            <input aria-label="Product name" value={editValue(product).name} onChange={e => updateEdit(product, 'name', e.target.value)}/>
            <input aria-label="Category" value={editValue(product).category} onChange={e => updateEdit(product, 'category', e.target.value)}/>
            <input aria-label="Selling price in INR" type="number" min="0" value={editValue(product).price} onChange={e => updateEdit(product, 'price', e.target.value)}/>
            <input aria-label="MRP in INR" type="number" min="0" placeholder="MRP / original price (₹)" value={editValue(product).mrp} onChange={e => updateEdit(product, 'mrp', e.target.value)}/>
            <input aria-label="Image URL" value={editValue(product).image_url} onChange={e => updateEdit(product, 'image_url', e.target.value)}/>
            <label>Replace product photo
              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Replace product photo" onChange={e => { const file = e.target.files?.[0]; if (file) setEditFiles(v => ({ ...v, [product.id]: file })); }}/>
              {editFiles[product.id] && <div className="admin-image-preview"><img src={editPreviews[product.id] || ''} alt="Replacement product photo preview"/><span>Selected: {editFiles[product.id].name}</span></div>}
            </label>
            <textarea aria-label="Description" value={editValue(product).description} onChange={e => updateEdit(product, 'description', e.target.value)}/>
            <button className="gold-btn" onClick={() => saveEdit(product)}>SAVE PRODUCT DETAILS</button>
          </div>
        </details>
      </div>)}
    </section>
  </main>;
}
