import { put } from '@vercel/blob';
import { getAllTrackedStock } from './_stock.js';

const BACKUP_PATH = 'backups/stock-backup-latest.json';

// Declenche soit par Vercel Cron (Authorization: Bearer $CRON_SECRET, ajoute automatiquement
// par Vercel quand CRON_SECRET est defini), soit manuellement depuis l'admin (ADMIN_STOCK_TOKEN).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Methode non autorisee.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const providedToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;
  const adminToken = process.env.ADMIN_STOCK_TOKEN;
  const authorized =
    (cronSecret && providedToken === cronSecret) || (adminToken && providedToken === adminToken);

  if (!authorized) {
    res.status(401).json({ error: 'Jeton invalide.' });
    return;
  }

  if (!process.env.KV_REST_API_URL) {
    res.status(400).json({ error: 'Le suivi de stock (Vercel KV) n\'est pas configure.' });
    return;
  }
  // Pas de verification stricte de BLOB_READ_WRITE_TOKEN : ce compte utilise l'authentification
  // OIDC de Vercel pour Blob (recommandee par Vercel), qui ne passe pas par cette variable.
  // Si Blob n'est pas connecte au projet, l'appel put() ci-dessous echouera avec un message clair.

  try {
    const stock = await getAllTrackedStock();
    const snapshot = {
      generatedAt: new Date().toISOString(),
      productCount: Object.keys(stock).length,
      stock,
    };

    const blob = await put(BACKUP_PATH, JSON.stringify(snapshot, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });

    res.status(200).json({ ok: true, url: blob.url, generatedAt: snapshot.generatedAt, productCount: snapshot.productCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde du stock.' });
  }
}
