import Stripe from 'stripe';
import { loadCatalog } from './_shared.js';
import { isRateLimited, recordFailure, clearFailures } from './_ratelimit.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Reserve a l'admin (jeton) : renvoie l'adresse de livraison et le poids total d'une commande,
// pour pre-remplir l'outil d'etiquettes (etiquettes/index.html).
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

  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
  if (!sessionId.startsWith('cs_')) {
    res.status(400).json({ error: 'sessionId invalide (doit commencer par "cs_").' });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
      expand: ['data.price.product'],
      limit: 100,
    });

    const catalog = await loadCatalog();
    const productsById = new Map((catalog.products || []).map((p) => [p.id, p]));

    let totalWeight = 0;
    const items = lineItems.data.map((item) => {
      const productId = item.price?.product?.metadata?.productId || null;
      const product = productId ? productsById.get(productId) : null;
      const unitWeight = product && typeof product.weight === 'number' ? product.weight : null;
      const lineWeight = unitWeight ? unitWeight * item.quantity : 0;
      totalWeight += lineWeight;
      return {
        productId,
        name: (product && product.name) || item.description || 'Produit',
        sku: (product && product.sku) || '',
        quantity: item.quantity,
        unitWeight,
        lineWeight,
      };
    });

    const shipping = session.shipping_details || null;
    const customer = session.customer_details || null;
    const address = (shipping && shipping.address) || (customer && customer.address) || null;

    res.status(200).json({
      sessionId,
      recipientName: (shipping && shipping.name) || (customer && customer.name) || '',
      email: (customer && customer.email) || '',
      phone: (customer && customer.phone) || '',
      address: address
        ? {
            line1: address.line1 || '',
            line2: address.line2 || '',
            city: address.city || '',
            state: address.state || '',
            postalCode: address.postal_code || '',
            country: address.country || '',
          }
        : null,
      items,
      totalWeight: Math.round(totalWeight * 100) / 100,
      hasShippableItems: totalWeight > 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la recuperation de la commande.' });
  }
}
