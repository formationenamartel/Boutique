import { adjustStock } from './_stock.js';

// Protege par jeton (Authorization: Bearer ...) plutot que par origine : c'est ce jeton,
// pas le CORS, qui controle l'acces. Ouvert a toute origine pour fonctionner depuis l'admin
// local (file://) comme depuis un hebergement.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
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

  if (!process.env.KV_REST_API_URL) {
    res.status(400).json({ error: 'Le suivi de stock (Vercel KV) n\'est pas configure.' });
    return;
  }

  try {
    const { id, delta } = req.body || {};
    const parsedDelta = parseInt(delta, 10);
    if (!id || Number.isNaN(parsedDelta)) {
      res.status(400).json({ error: 'Parametres invalides : id et delta (entier) sont requis.' });
      return;
    }

    const newValue = await adjustStock(id, parsedDelta);
    res.status(200).json({ id, stock: newValue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'ajustement du stock.' });
  }
}
