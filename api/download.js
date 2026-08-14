import { consumeDownloadToken } from './_digital.js';

// Visite directement depuis un lien d'email (navigation, pas d'appel JS cross-origin) : pas besoin de CORS.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Methode non autorisee.');
    return;
  }

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(400).send('Lien de telechargement invalide.');
    return;
  }

  if (!process.env.KV_REST_API_URL) {
    res.status(500).send('Le suivi de stock/telechargement (Vercel KV) n\'est pas configure.');
    return;
  }

  try {
    const url = await consumeDownloadToken(token);
    if (!url) {
      res.status(410).send('Ce lien de telechargement a expire ou a deja ete utilise trop de fois. Contactez le vendeur si besoin.');
      return;
    }
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la recuperation du fichier.');
  }
}
