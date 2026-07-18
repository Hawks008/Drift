(function () {
  'use strict';

  let products = [];
  let config = { storeName: 'drift', whatsappNumber: '', currency: '$', paymentsEnabled: false };
  const cart = new Map(); // id -> qty
  let payMode = 'delivery'; // 'delivery' or 'online'

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
  const sendHint = document.getElementById('sendHint');
  const payChoice = document.getElementById('payChoice');
  const payOnlineBtn = document.getElementById('payOnlineBtn');
  const payDeliveryBtn = document.getElementById('payDeliveryBtn');
  const emailInput = document.getElementById('customerEmail');
  const emailLabel = document.getElementById('emailLabel');
  const checkoutError = document.getElementById('checkoutError');
  const paymentBanner = document.getElementById('paymentBanner');

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

    if (config.paymentsEnabled) {
      payChoice.hidden = false;
      setPayMode('online');
    } else {
      payChoice.hidden = true;
      setPayMode('delivery');
    }

    renderGrid();
    bindGlobalEvents();
    await checkForPaymentReturn();
  }

  function setPayMode(mode) {
    payMode = mode;
    payOnlineBtn.classList.toggle('active', mode === 'online');
    payDeliveryBtn.classList.toggle('active', mode === 'delivery');
    const isOnline = mode === 'online';
    emailInput.hidden = !isOnline;
    emailLabel.hidden = !isOnline;
    sendOrderBtn.textContent = isOnline ? 'pay now →' : 'send order via whatsapp →';
    sendHint.textContent = isOnline
      ? "You'll be taken to Paystack's secure checkout to pay by card, mobile money, or bank transfer."
      : 'Opens WhatsApp with your order pre-written. Nothing sends until you tap send there.';
    checkoutError.hidden = true;
  }

  async function checkForPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference) return;

    // Clean the URL so a page refresh doesn't try to re-verify.
    window.history.replaceState({}, '', window.location.pathname);

    try {
      const res = await fetch(`/api/payments/verify/${encodeURIComponent(reference)}`);
      const data = await res.json();
      if (!data.verified) {
        showBanner('That payment could not be confirmed. If you were charged, please contact us.', 'error');
        return;
      }
      showBanner("Payment received — thank you! We're sending your order details now.", 'success');
      sendPaidOrderToWhatsApp(data);
    } catch (e) {
      console.error(e);
      showBanner('Could not confirm the payment. If you were charged, please contact us.', 'error');
    }
  }

  function showBanner(text, kind) {
    paymentBanner.textContent = text;
    paymentBanner.className = `payment-banner ${kind}`;
    paymentBanner.hidden = false;
  }

  function sendPaidOrderToWhatsApp(paymentData) {
    const meta = paymentData.metadata || {};
    const lines = (meta.orderLines || []).map(line =>
      `• ${line.name} × ${line.qty} — ${money(line.price * line.qty)}`
    );
    const total = (meta.orderLines || []).reduce((sum, l) => sum + l.price * l.qty, 0);

    const parts = [
      `Hi! I just paid online for an order from ${config.storeName} ✅`,
      '',
      ...lines,
      '',
      `Total paid: ${money(total)}`,
      `Payment reference: ${paymentData.reference}`
    ];
    if (meta.customerName) parts.push('', `Name: ${meta.customerName}`);
    if (meta.customerNote) parts.push('', `Note: ${meta.customerNote}`);

    const message = parts.join('\n');
    const number = (config.whatsappNumber || '').replace(/[^\d]/g, '');
    const link = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    window.open(link, '_blank');

    cart.clear();
    renderCart();
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

  function sendDeliveryOrder() {
    const message = buildWhatsAppMessage();
    const number = (config.whatsappNumber || '').replace(/[^\d]/g, '');
    const link = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    window.open(link, '_blank');
  }

  async function payOnline() {
    checkoutError.hidden = true;
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
      checkoutError.textContent = 'Enter a valid email address to continue.';
      checkoutError.hidden = false;
      emailInput.focus();
      return;
    }

    const items = [...cart.entries()]
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id, qty }));

    sendOrderBtn.disabled = true;
    sendOrderBtn.textContent = 'starting checkout…';

    try {
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          items,
          customerName: document.getElementById('customerName').value.trim(),
          customerNote: document.getElementById('customerNote').value.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        checkoutError.textContent = data.error || 'Could not start the payment.';
        checkoutError.hidden = false;
        sendOrderBtn.disabled = false;
        sendOrderBtn.textContent = 'pay now →';
        return;
      }
      window.location.href = data.authorization_url;
    } catch (e) {
      console.error(e);
      checkoutError.textContent = 'Could not reach the payment service. Check your connection and try again.';
      checkoutError.hidden = false;
      sendOrderBtn.disabled = false;
      sendOrderBtn.textContent = 'pay now →';
    }
  }

  function sendOrder() {
    if (![...cart.values()].some(q => q > 0)) return;
    if (payMode === 'online') {
      payOnline();
    } else {
      sendDeliveryOrder();
    }
  }

  function bindGlobalEvents() {
    document.getElementById('cartToggle').addEventListener('click', openCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    scrim.addEventListener('click', closeCart);
    sendOrderBtn.addEventListener('click', sendOrder);
    payOnlineBtn.addEventListener('click', () => setPayMode('online'));
    payDeliveryBtn.addEventListener('click', () => setPayMode('delivery'));
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
