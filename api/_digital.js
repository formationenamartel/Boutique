import crypto from 'node:crypto';
import { kv } from '@vercel/kv';

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 jours
const MAX_DOWNLOADS = 3;

function downloadKey(token) {
  return `download:${token}`;
}

export async function createDownloadToken(fileUrl) {
  const token = crypto.randomBytes(24).toString('hex');
  await kv.set(
    downloadKey(token),
    JSON.stringify({ url: fileUrl, remaining: MAX_DOWNLOADS }),
    { ex: TOKEN_TTL_SECONDS }
  );
  return token;
}

// Decremente le compteur et renvoie l'URL si le jeton est encore valide, sinon null.
export async function consumeDownloadToken(token) {
  const key = downloadKey(token);
  const raw = await kv.get(key);
  if (!raw) return null;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || data.remaining <= 0) return null;

  data.remaining -= 1;
  if (data.remaining <= 0) {
    await kv.del(key);
  } else {
    const ttl = await kv.ttl(key);
    await kv.set(key, JSON.stringify(data), { ex: ttl > 0 ? ttl : TOKEN_TTL_SECONDS });
  }
  return data.url;
}
