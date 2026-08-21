import { kv } from '@vercel/kv';

const RESERVATION_TTL_SECONDS = 2 * 60 * 60; // 2h : marge large par rapport a l'expiration de la session Stripe (30 min)

function stockKey(productId) {
  return `stock:${productId}`;
}

function reservationKey(sessionId) {
  return `reservation:${sessionId}`;
}

// Initialise la valeur en KV depuis le catalogue si elle n'existe pas encore.
// Une fois initialisee, le catalogue n'est plus consulte : le KV devient la source de verite,
// et les reapprovisionnements se font via /api/stock-adjust (pas en re-exportant products.json).
async function ensureInitialized(productId, seedStock) {
  if (seedStock === null || seedStock === undefined) return null; // stock illimite
  const exists = await kv.exists(stockKey(productId));
  if (!exists) {
    await kv.set(stockKey(productId), seedStock);
    return seedStock;
  }
  return kv.get(stockKey(productId));
}

export async function getStockLevels(products) {
  const result = {};
  await Promise.all(
    products.map(async (p) => {
      if (p.stock === null || p.stock === undefined) {
        result[p.id] = null;
        return;
      }
      result[p.id] = await ensureInitialized(p.id, p.stock);
    })
  );
  return result;
}

// Reserve le stock pour un panier de facon atomique par ligne, avec rollback complet
// si une ligne echoue (ex: stock devenu insuffisant entre deux clients).
export async function reserveStock(items, productsById) {
  const reserved = [];
  for (const item of items) {
    const product = productsById.get(item.id);
    if (product.stock === null || product.stock === undefined) continue; // illimite, rien a reserver

    await ensureInitialized(product.id, product.stock);
    const remaining = await kv.decrby(stockKey(product.id), item.quantity);

    if (remaining < 0) {
      await kv.incrby(stockKey(product.id), item.quantity); // annule cette ligne
      await releaseReservations(reserved); // annule les lignes precedentes de ce panier
      return { ok: false, productId: product.id };
    }
    reserved.push({ id: product.id, quantity: item.quantity });
  }
  return { ok: true, items: reserved };
}

export async function releaseReservations(items) {
  await Promise.all(items.map((i) => kv.incrby(stockKey(i.id), i.quantity)));
}

export async function saveReservation(sessionId, items) {
  if (items.length === 0) return;
  await kv.set(reservationKey(sessionId), JSON.stringify(items), { ex: RESERVATION_TTL_SECONDS });
}

export async function releaseReservationBySessionId(sessionId) {
  const key = reservationKey(sessionId);
  const raw = await kv.get(key);
  if (!raw) return;
  const items = typeof raw === 'string' ? JSON.parse(raw) : raw;
  await releaseReservations(items);
  await kv.del(key);
}

export async function adjustStock(productId, delta) {
  const exists = await kv.exists(stockKey(productId));
  if (!exists) await kv.set(stockKey(productId), 0);
  return kv.incrby(stockKey(productId), delta);
}

// Pour la sauvegarde : liste tous les stocks actuellement suivis en KV (hors reservations, transitoires).
export async function getAllTrackedStock() {
  const keys = await kv.keys('stock:*');
  if (keys.length === 0) return {};
  const values = await Promise.all(keys.map((k) => kv.get(k)));
  const result = {};
  keys.forEach((k, i) => {
    result[k.slice('stock:'.length)] = values[i];
  });
  return result;
}
