import Stripe from 'stripe';
import { releaseReservationBySessionId } from './_stock.js';

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
    // checkout.session.completed : rien a faire, le stock a deja ete decompte lors de la reservation.
    res.status(200).json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors du traitement du webhook.' });
  }
}
