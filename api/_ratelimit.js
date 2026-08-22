import { kv } from '@vercel/kv';

const WINDOW_SECONDS = 15 * 60; // fenetre glissante de 15 minutes
const MAX_ATTEMPTS = 10; // au-dela, l'IP est bloquee jusqu'a expiration de la fenetre

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function rlKey(req) {
  return `ratelimit:admin:${getClientIp(req)}`;
}

// Sans KV configure, on "fail open" (comportement d'avant cette fonctionnalite) plutot que
// de bloquer les endpoints admin si le suivi de stock n'est pas active.

export async function isRateLimited(req) {
  if (!process.env.KV_REST_API_URL) return false;
  const count = await kv.get(rlKey(req));
  return Number(count) >= MAX_ATTEMPTS;
}

export async function recordFailure(req) {
  if (!process.env.KV_REST_API_URL) return;
  const k = rlKey(req);
  const count = await kv.incr(k);
  if (count === 1) await kv.expire(k, WINDOW_SECONDS);
}

export async function clearFailures(req) {
  if (!process.env.KV_REST_API_URL) return;
  await kv.del(rlKey(req));
}
