'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import Link from 'next/link';

type VariantDraft = { sku: string; size: string; colour: string; stock: string };

export default function AdminProductsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [form, setForm] = useState({ name: '', category: 'Menswear', description: '', price: '', slug: '', image_url: '' });
  const [variants, setVariants] = useState<VariantDraft[]>([{ sku: '', size: 'M', colour: 'Default', stock: '0' }]);
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

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMsg('');
    if (variants.length < 1 || variants.some(v => !v.sku.trim() || !v.size.trim() || !Number.isInteger(Number(v.stock)) || Number(v.stock) < 0)) {
      setMsg('Enter a unique SKU, size and valid opening stock for every variant.');
      return;
    }
    setSaving(true);
    try {
      let imageUrl = form.image_url.trim();
      if (imageFile) {
        const upload = new FormData();
        upload.append('file', imageFile);
        const uploadResponse = await fetch('/api/admin/products/image', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          body: upload,
        });
        const uploaded = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploaded.error || 'Product image upload failed.');
        imageUrl = uploaded.imageUrl;
      }

      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          name: form.name, category: form.category, description: form.description,
          price_inr: Number(form.price), slug: form.slug || undefined, image_url: imageUrl,
          variants: variants.map(v => ({ sku: v.sku.trim(), size: v.size.trim(), colour: v.colour.trim() || 'Default', stock: Number(v.stock) })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create product.');
      setMsg('Product saved as a draft with ' + variants.length + ' variant(s). Review it and publish when ready.');
      setForm({ name: '', category: 'Menswear', description: '', price: '', slug: '', image_url: '' });
      setVariants([{ sku: '', size: 'M', colour: 'Default', stock: '0' }]);
      setImageFile(null);
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Could not create product.');
    } finally {
      setSaving(false);
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
        <input type="number" min="0" max="10000000" placeholder="Price in INR" value={form.price} onChange={e => setForm(v => ({ ...v, price: e.target.value }))} required/>
        <input placeholder="URL slug (optional)" value={form.slug} onChange={e => setForm(v => ({ ...v, slug: e.target.value }))}/>
        <input type="url" placeholder="Or paste an HTTPS image URL" value={form.image_url} onChange={e => { setForm(v => ({ ...v, image_url: e.target.value })); setImageFile(null); }}/>
        <label>Upload product photo (JPG, PNG or WebP, max 5 MB)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e: ChangeEvent<HTMLInputElement>) => setImageFile(e.target.files?.[0] || null)}/>
        </label>
        {imageFile && <small>Selected image: {imageFile.name}</small>}
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
      {items.map(product => <div className="admin-row" key={product.id}>
        <span><b>{product.name}</b><small>{product.category} · {product.product_variants?.length || 0} variants</small></span>
        <span>₹{product.price_inr} · {product.is_active ? 'Live' : 'Draft'} <button onClick={() => publish(product.id, !product.is_active)}>{product.is_active ? 'Unpublish' : 'Publish'}</button></span>
      </div>)}
    </section>
  </main>;
}
