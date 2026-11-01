import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminJson, requireAdmin } from '../../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return adminJson({ error: 'Choose a product image to upload.' }, 400);
  const extension = EXTENSIONS[file.type];
  if (!extension) return adminJson({ error: 'Use a JPG, PNG or WebP image.' }, 415);
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return adminJson({ error: 'Product images must be smaller than 5 MB.' }, 413);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return adminJson({ error: 'Image storage is not configured.' }, 503);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isJpeg = file.type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = file.type === 'image/png' && bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => bytes[index] === value);
  const isWebp = file.type === 'image/webp' && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) return adminJson({ error: 'The file contents do not match a supported image format.' }, 415);

  const objectPath = 'products/' + randomUUID() + '.' + extension;
  const { data, error } = await auth.db.storage
    .from('product-images')
    .upload(objectPath, bytes, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error || !data) {
    return adminJson({ error: 'The product image could not be uploaded. Check the product-images storage migration.' }, 503);
  }

  const { data: publicData } = auth.db.storage.from('product-images').getPublicUrl(data.path);
  return adminJson({ ok: true, path: data.path, imageUrl: publicData.publicUrl }, 201);
}
