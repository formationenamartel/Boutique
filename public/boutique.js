(function () {
  'use strict';

  function initBoutique(root) {
    const productsUrl = root.dataset.productsUrl;
    const apiUrl = root.dataset.apiUrl;
    const stockUrl = root.dataset.stockUrl;
    if (!productsUrl || !apiUrl) {
      root.innerHTML = '<p class="boutique-empty">Configuration manquante : data-products-url et data-api-url sont requis.</p>';
      return;
    }

    const cartKey = 'boutique_cart_' + btoa(productsUrl).slice(0, 12);
    let catalog = null;
    let cart = loadCart();
    let activeCategory = 'all';
    let stockLevels = {}; // { productId: number remaining | null (illimite) }, absent = inconnu

    function availableStock(productId) {
      const level = stockLevels[productId];
      return level === undefined ? null : level; // pas de data = pas de limite connue
    }

    root.classList.add('boutique');
    root.innerHTML = '<div class="boutique-categories" data-el="categories"></div><div class="boutique-grid" data-el="grid"></div>';

    const fab = document.createElement('button');
    fab.className = 'boutique boutique-cart-fab';
    fab.innerHTML = 'Panier <span class="boutique-cart-count" data-el="cart-count">0</span>';
    fab.addEventListener('click', openCart);
    document.body.appendChild(fab);

    function loadCart() {
      try {
        return JSON.parse(localStorage.getItem(cartKey)) || [];
      } catch {
        return [];
      }
    }

    function saveCart() {
      localStorage.setItem(cartKey, JSON.stringify(cart));
      updateCartCount();
    }

    function updateCartCount() {
      const count = cart.reduce((sum, i) => sum + i.quantity, 0);
      fab.querySelector('[data-el="cart-count"]').textContent = String(count);
    }

    function formatPrice(cents) {
      const currency = (catalog && catalog.currency) || 'eur';
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
    }

    function addToCart(productId) {
      const stock = availableStock(productId);
      const existing = cart.find((i) => i.id === productId);
      const nextQuantity = (existing ? existing.quantity : 0) + 1;
      if (stock !== null && nextQuantity > stock) return;
      if (existing) existing.quantity = nextQuantity;
      else cart.push({ id: productId, quantity: 1 });
      saveCart();
    }

    function setQuantity(productId, quantity) {
      const stock = availableStock(productId);
      if (stock !== null && quantity > stock) quantity = stock;
      if (quantity <= 0) {
        cart = cart.filter((i) => i.id !== productId);
      } else {
        const item = cart.find((i) => i.id === productId);
        if (item) item.quantity = quantity;
      }
      saveCart();
      renderCartPanel();
    }

    function renderCategories() {
      const el = root.querySelector('[data-el="categories"]');
      const categories = catalog.categories || [];
      const buttons = [{ id: 'all', name: 'Tout' }].concat(categories);
      el.innerHTML = '';
      buttons.forEach((cat) => {
        const btn = document.createElement('button');
        btn.className = 'boutique-category-btn' + (activeCategory === cat.id ? ' active' : '');
        btn.textContent = cat.name;
        btn.addEventListener('click', () => {
          activeCategory = cat.id;
          renderCategories();
          renderGrid();
        });
        el.appendChild(btn);
      });
    }

    function renderGrid() {
      const el = root.querySelector('[data-el="grid"]');
      const products = (catalog.products || []).filter(
        (p) => p.active !== false && (activeCategory === 'all' || p.category === activeCategory)
      );
      if (products.length === 0) {
        el.innerHTML = '<p class="boutique-empty">Aucun produit dans cette categorie.</p>';
        return;
      }
      el.innerHTML = '';
      products.forEach((p) => {
        const stock = availableStock(p.id);
        const outOfStock = stock !== null && stock <= 0;
        const card = document.createElement('div');
        card.className = 'boutique-card';
        card.innerHTML =
          '<img class="boutique-card-image" src="' + escapeAttr(p.image || '') + '" alt="' + escapeAttr(p.name) + '" loading="lazy">' +
          '<div class="boutique-card-body">' +
          '<h3 class="boutique-card-title">' + escapeHtml(p.name) + '</h3>' +
          '<p class="boutique-card-desc">' + escapeHtml(p.description || '') + '</p>' +
          '<p class="boutique-card-price">' + formatPrice(p.price) + '</p>' +
          '<button class="boutique-btn" type="button"' + (outOfStock ? ' disabled' : '') + '>' +
          (outOfStock ? 'Rupture de stock' : 'Ajouter au panier') +
          '</button>' +
          '</div>';
        if (!outOfStock) card.querySelector('button').addEventListener('click', () => addToCart(p.id));
        el.appendChild(card);
      });
    }

    function openCart() {
      renderCartPanel();
    }

    function renderCartPanel() {
      const existing = document.querySelector('.boutique-cart-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'boutique-cart-overlay';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });

      const panel = document.createElement('div');
      panel.className = 'boutique-cart-panel boutique';

      const productsById = new Map((catalog.products || []).map((p) => [p.id, p]));
      const items = cart
        .map((i) => ({ ...i, product: productsById.get(i.id) }))
        .filter((i) => i.product);
      const total = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

      let itemsHtml = '<p class="boutique-empty">Votre panier est vide.</p>';
      if (items.length > 0) {
        itemsHtml = items
          .map(
            (i) =>
              '<div class="boutique-cart-item" data-id="' + escapeAttr(i.id) + '">' +
              '<img src="' + escapeAttr(i.product.image || '') + '" alt="">' +
              '<div class="boutique-cart-item-info">' +
              '<p class="boutique-cart-item-name">' + escapeHtml(i.product.name) + '</p>' +
              '<p class="boutique-cart-item-price">' + formatPrice(i.product.price) + '</p>' +
              '<div class="boutique-qty">' +
              '<button data-action="dec">-</button>' +
              '<span>' + i.quantity + '</span>' +
              '<button data-action="inc">+</button>' +
              '<button class="boutique-remove" data-action="remove">Retirer</button>' +
              '</div>' +
              '</div>' +
              '</div>'
          )
          .join('');
      }

      panel.innerHTML =
        '<div class="boutique-cart-header"><h3>Votre panier</h3><button class="boutique-cart-close" type="button">&times;</button></div>' +
        '<div class="boutique-cart-items">' + itemsHtml + '</div>' +
        '<div class="boutique-cart-footer">' +
        '<div class="boutique-cart-total"><span>Total</span><span>' + formatPrice(total) + '</span></div>' +
        '<div class="boutique-cart-error" data-el="cart-error" style="display:none"></div>' +
        '<button class="boutique-btn" type="button" data-action="checkout"' + (items.length === 0 ? ' disabled' : '') + '>Passer la commande</button>' +
        '</div>';

      panel.querySelector('.boutique-cart-close').addEventListener('click', () => overlay.remove());

      panel.querySelectorAll('.boutique-cart-item').forEach((row) => {
        const id = row.dataset.id;
        const item = items.find((i) => i.id === id);
        row.querySelector('[data-action="inc"]').addEventListener('click', () => setQuantity(id, item.quantity + 1));
        row.querySelector('[data-action="dec"]').addEventListener('click', () => setQuantity(id, item.quantity - 1));
        row.querySelector('[data-action="remove"]').addEventListener('click', () => setQuantity(id, 0));
      });

      const checkoutBtn = panel.querySelector('[data-action="checkout"]');
      if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => startCheckout(checkoutBtn));
      }

      overlay.appendChild(panel);
      document.body.appendChild(overlay);
    }

    async function startCheckout(button) {
      const errorEl = document.querySelector('[data-el="cart-error"]');
      button.disabled = true;
      button.textContent = 'Redirection...';
      errorEl.style.display = 'none';
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
            successUrl: window.location.origin + window.location.pathname + '?paiement=succes',
            cancelUrl: window.location.origin + window.location.pathname + '?paiement=annule',
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || 'Erreur inconnue');
        window.location.href = data.url;
      } catch (err) {
        errorEl.textContent = 'Impossible de lancer le paiement : ' + err.message;
        errorEl.style.display = 'block';
        button.disabled = false;
        button.textContent = 'Passer la commande';
      }
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function escapeAttr(str) {
      return escapeHtml(str);
    }

    fetch(productsUrl, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((data) => {
        catalog = data;
        renderCategories();
        renderGrid();
        updateCartCount();
        if (stockUrl) loadStockLevels();
      })
      .catch((err) => {
        root.querySelector('[data-el="grid"]').innerHTML =
          '<p class="boutique-empty">Impossible de charger le catalogue (' + err.message + ')</p>';
      });

    function loadStockLevels() {
      const ids = (catalog.products || []).map((p) => p.id).join(',');
      fetch(stockUrl + '?ids=' + encodeURIComponent(ids), { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : {}))
        .then((data) => {
          stockLevels = data || {};
          renderGrid();
        })
        .catch(() => {}); // affichage sans limite de stock si l'appel echoue
    }
  }

  function init() {
    document.querySelectorAll('[data-boutique-root]').forEach(initBoutique);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
