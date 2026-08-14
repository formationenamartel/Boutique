import Stripe from 'stripe';
import { releaseReservationBySessionId } from './_stock.js';
import { createDownloadToken } from './_digital.js';
import { loadCatalog } from './_shared.js';

// Necessaire pour verifier la signature Stripe sur le corps brut de la requete.
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function sendDownloadEmail(toEmail, items) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY n\'est pas configure, email de livraison non envoye.');
    return;
  }
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const linksHtml = items
    .map((i) => `<li><a href="${i.url}">${i.name}</a></li>`)
    .join('');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject: 'Vos telechargements sont prets',
      html: `<p>Merci pour votre achat ! Voici vos liens de telechargement (valides 7 jours, jusqu'a 5 utilisations) :</p><ul>${linksHtml}</ul>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('Echec envoi email Resend:', response.status, body);
  }
}

async function handleDigitalDelivery(session, host) {
  const customerEmail = session.customer_details?.email || session.customer_email;
  if (!customerEmail) return;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ['data.price.product'],
  });

  const catalog = await loadCatalog();
  const productsById = new Map((catalog.products || []).map((p) => [p.id, p]));

  const downloadItems = [];
  for (const item of lineItems.data) {
    const productId = item.price?.product?.metadata?.productId;
    const product = productId ? productsById.get(productId) : null;
    if (!product || !product.digitalFileUrl) continue;

    const token = await createDownloadToken(product.digitalFileUrl);
    downloadItems.push({ name: product.name, url: `https://${host}/api/download?token=${token}` });
  }

  if (downloadItems.length > 0) {
    await sendDownloadEmail(customerEmail, downloadItems);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET n\'est pas configure.');
    res.status(500).end();
    return;
  }

  let event;
  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    res.status(400).send(`Signature webhook invalide : ${err.message}`);
    return;
  }

  try {
    // La session n'a pas abouti a un paiement confirme : on restitue le stock reserve.
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      await releaseReservationBySessionId(event.data.object.id);
    }

    if (event.type === 'checkout.session.completed') {
      await handleDigitalDelivery(event.data.object, req.headers.host);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors du traitement du webhook.' });
  }
}
