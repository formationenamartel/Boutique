import Stripe from 'stripe';
import { loadCatalog } from './_shared.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const MAX_SESSIONS = 500; // garde-fou pour eviter un depassement du temps d'execution de la fonction

// Reservee a l'admin (jeton), pas au widget public : donnees de vente sensibles.
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
  const authHeader = req.headers.authorization || '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (providedToken !== expectedToken) {
    res.status(401).json({ error: 'Jeton invalide.' });
    return;
  }

  try {
    const startParam = parseInt(req.query.start, 10);
    const endParam = parseInt(req.query.end, 10);
    if (!startParam || !endParam || endParam <= startParam) {
      res.status(400).json({ error: 'Parametres start et end (timestamps Unix en secondes) requis, avec end > start.' });
      return;
    }

    const catalog = await loadCatalog();
    const productsById = new Map((catalog.products || []).map((p) => [p.id, p]));
    const categoriesById = new Map((catalog.categories || []).map((c) => [c.id, c.name]));

    const sessions = [];
    let startingAfter;
    let truncated = false;
    while (sessions.length < MAX_SESSIONS) {
      const page = await stripe.checkout.sessions.list({
        created: { gte: startParam, lte: endParam },
        limit: 100,
        starting_after: startingAfter,
      });
      sessions.push(...page.data);
      if (!page.has_more) break;
      startingAfter = page.data[page.data.length - 1].id;
      if (sessions.length >= MAX_SESSIONS) {
        truncated = true;
        break;
      }
    }

    const paidSessions = sessions.filter((s) => s.payment_status === 'paid');

    const lines = [];
    for (const session of paidSessions) {
      const siteId = session.metadata && session.metadata.siteId ? session.metadata.siteId : 'inconnu';
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        expand: ['data.price.product'],
        limit: 100,
      });
      for (const item of lineItems.data) {
        const productId = item.price && item.price.product && item.price.product.metadata
          ? item.price.product.metadata.productId
          : null;
        const product = productId ? productsById.get(productId) : null;
        lines.push({
          date: new Date(session.created * 1000).toISOString(),
          sessionId: session.id,
          siteId,
          productId: productId || 'inconnu',
          productName: (product && product.name) || item.description || 'Produit supprime du catalogue',
          sku: (product && product.sku) || '',
          categoryId: (product && product.category) || 'inconnu',
          categoryName: (product && categoriesById.get(product.category)) || 'Inconnue',
          quantity: item.quantity,
          revenue: item.amount_subtotal, // hors taxes
          collected: item.amount_total, // taxes incluses
          currency: session.currency,
        });
      }
    }

    function aggregate(keyFn, labelFields) {
      const map = new Map();
      for (const line of lines) {
        const key = keyFn(line);
        if (!map.has(key)) {
          map.set(key, { key, revenue: 0, collected: 0, quantity: 0, orderIds: new Set(), ...labelFields(line) });
        }
        const entry = map.get(key);
        entry.revenue += line.revenue;
        entry.collected += line.collected;
        entry.quantity += line.quantity;
        entry.orderIds.add(line.sessionId);
      }
      return Array.from(map.values())
        .map((e) => ({ ...e, orderCount: e.orderIds.size, orderIds: undefined }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    const byCategory = aggregate(
      (l) => l.categoryId,
      (l) => ({ categoryId: l.categoryId, categoryName: l.categoryName })
    );
    const byProduct = aggregate(
      (l) => l.productId,
      (l) => ({ productId: l.productId, productName: l.productName, sku: l.sku })
    );
    const bySite = aggregate(
      (l) => l.siteId,
      (l) => ({ siteId: l.siteId })
    );

    const totalRevenue = lines.reduce((sum, l) => sum + l.revenue, 0);
    const totalCollected = lines.reduce((sum, l) => sum + l.collected, 0);

    res.status(200).json({
      range: { start: startParam, end: endParam },
      currency: (catalog.currency || 'eur').toLowerCase(),
      orderCount: paidSessions.length,
      totalRevenue,
      totalCollected,
      byCategory,
      byProduct,
      bySite,
      lines,
      truncated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la generation du rapport.' });
  }
}
