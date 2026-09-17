import Stripe from 'stripe';
import { isRateLimited, recordFailure, clearFailures } from './_ratelimit.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FETCH_LIMIT = 30; // sessions inspectees pour en trouver jusqu'a MAX_RESULTS payees
const MAX_RESULTS = 15;

// Reservee a l'admin (jeton) : liste les commandes payees les plus recentes, pour eviter
// de devoir copier-coller un ID de session dans l'outil d'etiquettes.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Methode non autorisee.' });
    return;
  }

  const expectedToken = process.env.ADMIN_STOCK_TOKEN;
  if (!expectedToken) {
    res.status(500).json({ error: 'ADMIN_STOCK_TOKEN n\'est pas configure sur le serveur.' });
    return;
  }

  if (await isRateLimited(req)) {
    res.status(429).json({ error: 'Trop de tentatives echouees. Reessayez dans 15 minutes.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (providedToken !== expectedToken) {
    await recordFailure(req);
    res.status(401).json({ error: 'Jeton invalide.' });
    return;
  }
  await clearFailures(req);

  try {
    const page = await stripe.checkout.sessions.list({ limit: FETCH_LIMIT });
    const orders = page.data
      .filter((s) => s.payment_status === 'paid')
      .slice(0, MAX_RESULTS)
      .map((s) => ({
        sessionId: s.id,
        date: new Date(s.created * 1000).toISOString(),
        recipientName: (s.shipping_details && s.shipping_details.name) || (s.customer_details && s.customer_details.name) || '',
        amountTotal: s.amount_total,
        currency: s.currency,
        hasShipping: Boolean(s.shipping_details && s.shipping_details.address),
      }));

    res.status(200).json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la recuperation des commandes.' });
  }
}
