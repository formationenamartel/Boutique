let catalogCache = { data: null, fetchedAt: 0, url: null };
const CATALOG_TTL_MS = 60 * 1000;

export function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function resolveOrigin(req) {
  const origin = req.headers.origin || '';
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return origin || '*'; // mode ouvert (developpement)
  return allowed.includes(origin) ? origin : null;
}

export function setCors(res, origin, methods = 'GET, OPTIONS') {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export async function loadCatalog() {
  const url = process.env.PRODUCTS_JSON_URL;
  if (!url) throw new Error('PRODUCTS_JSON_URL n\'est pas configuree.');

  const isFresh =
    catalogCache.data &&
    catalogCache.url === url &&
    Date.now() - catalogCache.fetchedAt < CATALOG_TTL_MS;
  if (isFresh) return catalogCache.data;

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Impossible de charger le catalogue (${response.status}).`);
  const data = await response.json();
  catalogCache = { data, fetchedAt: Date.now(), url };
  return data;
}

export function isUrlAllowed(candidate, allowedOrigins) {
  if (!candidate) return false;
  try {
    new URL(candidate);
    if (allowedOrigins.length === 0) return true; // mode ouvert
    return allowedOrigins.some((o) => candidate.startsWith(o));
  } catch {
    return false;
  }
}
