import Stripe from 'stripe';
import { getAllowedOrigins, resolveOrigin, setCors, loadCatalog, isUrlAllowed } from './_shared.js';
import { reserveStock, releaseReservations, saveReservation } from './_stock.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const RESERVATION_WINDOW_SECONDS = 40 * 60; // duree de validite du lien de paiement quand du stock est reserve (minimum Stripe : 30 min)

export default async function handler(req, res) {
  const origin = resolveOrigin(req);

  if (req.method === 'OPTIONS') {
    setCors(res, origin, 'POST, OPTIONS');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Methode non autorisee.' });
    return;
  }

  if (origin === null) {
    res.status(403).json({ error: 'Origine non autorisee.' });
    return;
  }
  setCors(res, origin, 'POST, OPTIONS');

  let reservedItems = [];

  try {
    const { items, successUrl, cancelUrl, siteId } = req.body || {};
    const sanitizedSiteId = typeof siteId === 'string' && /^[a-z0-9-]{1,60}$/i.test(siteId) ? siteId : null;

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Le panier est vide.' });
      return;
    }

    const catalog = await loadCatalog();
    const productsById = new Map((catalog.products || []).map((p) => [p.id, p]));
    const currency = (catalog.currency || 'eur').toLowerCase();
    const taxBehavior = catalog.taxBehavior === 'inclusive' ? 'inclusive' : 'exclusive';
    // Taux manuels prioritaires sur Stripe Tax automatique : necessaire pour des cas comme
    // l'exemption de TVQ sur les livres au Quebec, que Stripe Tax n'applique pas correctement
    // avec un code fiscal generique (verifie empiriquement).
    const gstRateId = process.env.STRIPE_TAX_RATE_GST;
    const qstRateId = process.env.STRIPE_TAX_RATE_QST;
    const manualTaxRatesEnabled = Boolean(gstRateId && qstRateId);
    const automaticTaxEnabled = !manualTaxRatesEnabled && process.env.ENABLE_AUTOMATIC_TAX === 'true';
    const stockTrackingEnabled = Boolean(process.env.KV_REST_API_URL);

    const normalizedItems = [];
    const line_items = [];
    for (const rawItem of items) {
      const product = productsById.get(rawItem && rawItem.id);
      if (!product || product.active === false) {
        res.status(400).json({ error: `Produit invalide ou indisponible : ${rawItem?.id}` });
        return;
      }
      const quantity = Math.min(Math.max(parseInt(rawItem.quantity, 10) || 1, 1), 99);
      normalizedItems.push({ id: product.id, quantity });

      line_items.push({
        quantity,
        tax_rates: manualTaxRatesEnabled
          ? (product.qstExempt ? [gstRateId] : [gstRateId, qstRateId])
          : undefined,
        price_data: {
          currency,
          unit_amount: product.price,
          tax_behavior: automaticTaxEnabled ? taxBehavior : undefined,
          product_data: {
            name: product.name,
            description: product.description ? String(product.description).slice(0, 500) : undefined,
            images: product.image && /^https?:\/\//.test(product.image) ? [product.image] : undefined,
            tax_code: automaticTaxEnabled ? product.taxCode || 'txcd_99999999' : undefined,
            metadata: { productId: product.id },
          },
        },
      });
    }

    if (stockTrackingEnabled) {
      const reservation = await reserveStock(normalizedItems, productsById);
      if (!reservation.ok) {
        const product = productsById.get(reservation.productId);
        res.status(409).json({ error: `Stock insuffisant pour : ${product ? product.name : reservation.productId}` });
        return;
      }
      reservedItems = reservation.items;
    }

    const allowedOrigins = getAllowedOrigins();
    const finalSuccessUrl = isUrlAllowed(successUrl, allowedOrigins)
      ? successUrl
      : process.env.DEFAULT_SUCCESS_URL;
    const finalCancelUrl = isUrlAllowed(cancelUrl, allowedOrigins)
      ? cancelUrl
      : process.env.DEFAULT_CANCEL_URL;

    if (!finalSuccessUrl || !finalCancelUrl) {
      await releaseReservations(reservedItems);
      res.status(400).json({ error: 'URL de retour invalide et aucune URL par defaut configuree.' });
      return;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      allow_promotion_codes: true,
      metadata: sanitizedSiteId ? { siteId: sanitizedSiteId } : undefined,
      expires_at: reservedItems.length > 0 ? Math.floor(Date.now() / 1000) + RESERVATION_WINDOW_SECONDS : undefined,
      shipping_address_collection: process.env.SHIP_TO_COUNTRIES
        ? { allowed_countries: process.env.SHIP_TO_COUNTRIES.split(',').map((c) => c.trim()) }
        : undefined,
      automatic_tax: automaticTaxEnabled ? { enabled: true } : undefined,
      billing_address_collection: automaticTaxEnabled ? 'required' : undefined,
    });

    if (reservedItems.length > 0) {
      await saveReservation(session.id, reservedItems);
    }

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    await releaseReservations(reservedItems);
    res.status(500).json({ error: 'Erreur lors de la creation du paiement.' });
  }
}
