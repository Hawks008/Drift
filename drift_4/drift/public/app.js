(function () {
  'use strict';

  let products = [];
  let config = { storeName: 'drift', whatsappNumber: '', currency: '$' };
  const cart = new Map(); // id -> qty

  const grid = document.getElementById('productGrid');
  const emptyState = document.getElementById('emptyState');
  const shopCount = document.getElementById('shopCount');
  const cartCount = document.getElementById('cartCount');
  const cartItems = document.getElementById('cartItems');
  const cartEmptyMsg = document.getElementById('cartEmptyMsg');
  const cartTotal = document.getElementById('cartTotal');
  const cartDrawer = document.getElementById('cartDrawer');
  const scrim = document.getElementById('scrim');
  const sendOrderBtn = document.getElementById('sendOrder');

  function money(n) {
    return `${config.currency}${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  }

  async function init() {
    try {
      const [p, c] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/config').then(r => r.json())
      ]);
      products = p;
      config = c;
      document.title = config.storeName;
      const wm = document.querySelectorAll('.wordmark');
      wm.forEach(el => { el.textContent = config.storeName; });
    } catch (e) {
      console.error('Could not load the shop', e);
    }
    renderGrid();
    bindGlobalEvents();
  }

  function renderGrid() {
    grid.innerHTML = '';
    if (!products.length) {
      emptyState.hidden = false;
      shopCount.textContent = '';
      return;
    }
    emptyState.hidden = true;
    shopCount.textContent = `${products.length} item${products.length === 1 ? '' : 's'}`;

    products.forEach(product => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-media">
          <img src="${escapeAttr(product.image || '')}" alt="${escapeAttr(product.name)}" loading="lazy">
          ${product.category ? `<span class="card-tag">${escapeHTML(product.category)}</span>` : ''}
          ${product.inStock === false ? `<div class="card-sold">sold out</div>` : ''}
        </div>
        <div class="card-body">
          <p class="card-name">${escapeHTML(product.name)}</p>
          <p class="card-desc">${escapeHTML(product.description || '')}</p>
          <div class="card-row">
            <span class="card-price">${money(product.price)}</span>
            <button class="add-btn" data-id="${product.id}" ${product.inStock === false ? 'disabled' : ''}>
              ${product.inStock === false ? 'unavailable' : 'add to bag'}
            </button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    grid.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', () => addToCart(btn.dataset.id, btn));
    });
  }

  function addToCart(id, btn) {
    cart.set(id, (cart.get(id) || 0) + 1);
    renderCart();
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'added ✓';
      btn.classList.add('added');
      setTimeout(() => {
        btn.textContent = original.trim() === 'added ✓' ? 'add to bag' : original;
        btn.classList.remove('added');
      }, 900);
    }
    openCart();
  }

  function renderCart() {
    const entries = [...cart.entries()].filter(([, qty]) => qty > 0);
    const totalQty = entries.reduce((sum, [, qty]) => sum + qty, 0);
    cartCount.textContent = totalQty;

    if (!entries.length) {
      cartEmptyMsg.hidden = false;
      cartItems.innerHTML = '';
      cartTotal.textContent = money(0);
      sendOrderBtn.disabled = true;
      return;
    }

    cartEmptyMsg.hidden = true;
    sendOrderBtn.disabled = false;

    let total = 0;
    cartItems.innerHTML = entries.map(([id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return '';
      total += product.price * qty;
      return `
        <div class="cart-item" data-id="${id}">
          <img src="${escapeAttr(product.image || '')}" alt="">
          <div class="cart-item-info">
            <p class="cart-item-name">${escapeHTML(product.name)}</p>
            <p class="cart-item-price">${money(product.price)}</p>
            <div class="qty-row">
              <button class="qty-btn" data-action="dec" data-id="${id}" aria-label="Decrease quantity">−</button>
              <span class="qty-value">${qty}</span>
              <button class="qty-btn" data-action="inc" data-id="${id}" aria-label="Increase quantity">+</button>
              <button class="remove-link" data-action="remove" data-id="${id}">remove</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    cartTotal.textContent = money(total);

    cartItems.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'inc') cart.set(id, (cart.get(id) || 0) + 1);
        if (action === 'dec') cart.set(id, Math.max(0, (cart.get(id) || 0) - 1));
        if (action === 'remove') cart.delete(id);
        renderCart();
      });
    });
  }

  function openCart() {
    cartDrawer.classList.add('open');
    scrim.classList.add('open');
  }

  function closeCart() {
    cartDrawer.classList.remove('open');
    scrim.classList.remove('open');
  }

  function buildWhatsAppMessage() {
    const name = document.getElementById('customerName').value.trim();
    const note = document.getElementById('customerNote').value.trim();
    const entries = [...cart.entries()].filter(([, qty]) => qty > 0);

    let total = 0;
    const lines = entries.map(([id, qty]) => {
      const product = products.find(p => p.id === id);
      if (!product) return null;
      const lineTotal = product.price * qty;
      total += lineTotal;
      return `• ${product.name} × ${qty} — ${money(lineTotal)}`;
    }).filter(Boolean);

    const parts = [
      `Hi! I'd like to order from ${config.storeName}:`,
      '',
      ...lines,
      '',
      `Subtotal: ${money(total)}`
    ];

    if (name) parts.push('', `Name: ${name}`);
    if (note) parts.push('', `Note: ${note}`);

    return parts.join('\n');
  }

  function sendOrder() {
    if (![...cart.values()].some(q => q > 0)) return;
    const message = buildWhatsAppMessage();
    const number = (config.whatsappNumber || '').replace(/[^\d]/g, '');
    const link = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    window.open(link, '_blank');
  }

  function bindGlobalEvents() {
    document.getElementById('cartToggle').addEventListener('click', openCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    scrim.addEventListener('click', closeCart);
    sendOrderBtn.addEventListener('click', sendOrder);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeCart();
    });
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHTML(str).replace(/"/g, '&quot;');
  }

  renderCart();
  init();
})();
