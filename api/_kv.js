import { Redis } from '@upstash/redis';

// @vercel/kv est deprecie par Vercel ; ceci utilise directement le SDK Upstash (meme base de
// donnees, memes variables d'environnement KV_REST_API_URL / KV_REST_API_TOKEN deja configurees).
export const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
