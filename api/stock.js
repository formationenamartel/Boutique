import { loadCatalog } from './_shared.js';
import { getStockLevels } from './_stock.js';

// Lecture seule et peu sensible (juste des quantites restantes) : ouverte a toute origine,
// contrairement au paiement, pour etre appelable depuis le widget comme depuis l'admin local (file://).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Methode non autorisee.' });
    return;
  }

  if (!process.env.KV_REST_API_URL) {
    res.status(200).json({});
    return;
  }

  try {
    const catalog = await loadCatalog();
    const levels = await getStockLevels(catalog.products || []);
    res.status(200).json(levels);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la lecture du stock.' });
  }
}
