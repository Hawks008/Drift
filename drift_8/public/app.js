(function () {
  'use strict';

  let products = [];
  let config = { storeName: 'drift', whatsappNumber: '', currency: '$', paymentsEnabled: false };
  const cart = new Map(); // cartKey -> { id, color, size, qty }
  let payMode = 'delivery'; // 'delivery' or 'online'

  // product modal working state
  let activeProduct = null;
  let activeColor = '';
  let activeSize = '';
  let activeQty = 1;
  let activeSlide = 0;

  const grid = document.getElementById('productGrid');
  const emptyState = document.getElementById('emptyState');
  const shopCount = document.getElementById('shopCount');
  const mainSection = document.getElementById('mainSection');
  const thriftedSection = document.getElementById('thriftedSection');
  const thriftedGrid = document.getElementById('thriftedGrid');
  const thriftedCount = document.getElementById('thriftedCount');
  const thriftedNavLink = document.getElementById('thriftedNavLink');
  const searchSection = document.getElementById('searchSection');
  const searchGrid = document.getElementById('searchGrid');
  const searchCount = document.getElementById('searchCount');
  const searchEmptyState = document.getElementById('searchEmptyState');
  const searchToggle = document.getElementById('searchToggle');
  const searchBar = document.getElementById('searchBar');
  const searchInput = document.getElementById('searchInput');
  const searchClose = document.getElementById('searchClose');
  const themeToggle = document.getElementById('themeToggle');
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

  // product modal elements
  const productModal = document.getElementById('productModal');
  const productScrim = document.getElementById('productScrim');
  const pmSlides = document.getElementById('pmSlides');
  const pmDots = document.getElementById('pmDots');
  const pmPrev = document.getElementById('pmPrev');
  const pmNext = document.getElementById('pmNext');
  const pmCategory = document.getElementById('pmCategory');
  const pmName = document.getElementById('pmName');
  const pmPrice = document.getElementById('pmPrice');
  const pmDesc = document.getElementById('pmDesc');
  const pmColorGroup = document.getElementById('pmColorGroup');
  const pmColorPills = document.getElementById('pmColorPills');
  const pmSizeGroup = document.getElementById('pmSizeGroup');
  const pmSizePills = document.getElementById('pmSizePills');
  const pmQtyValue = document.getElementById('pmQtyValue');
  const pmQtyDec = document.getElementById('pmQtyDec');
  const pmQtyInc = document.getElementById('pmQtyInc');
  const pmError = document.getElementById('pmError');
  const pmAddBtn = document.getElementById('pmAddBtn');

  function money(n) {
    return `${config.currency}${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  }

  function cartKey(id, color, size) {
    return `${id}::${color || ''}::${size || ''}`;
  }

  // ---------- boot ----------

  async function init() {
    try {
      const [p, c] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/config').then(r => r.json())
      ]);
      products = p;
      config = c;
      document.title = config.storeName;
      document.querySelectorAll('.wordmark').forEach(el => { el.textContent = config.storeName; });
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

    renderShop();
    bindGlobalEvents();
    syncThemeToggleLabel();
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

  // ---------- payment return handling ----------

  async function checkForPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference) return;

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

  function describeVariant(color, size) {
    const bits = [color, size].filter(Boolean);
    return bits.length ? ` (${bits.join(', ')})` : '';
  }

  function sendPaidOrderToWhatsApp(paymentData) {
    const meta = paymentData.metadata || {};
    const lines = (meta.orderLines || []).map(line =>
      `• ${line.name}${describeVariant(line.color, line.size)} × ${line.qty} — ${money(line.price * line.qty)}`
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

  // ---------- product grid ----------

  function buildCardHTML(product) {
    const images = product.images || [];
    const hasOptions = (product.colors || []).length > 0 || (product.sizes || []).length > 0;
    return `
      <article class="card card-clickable" data-id="${product.id}">
        <div class="card-media">
          ${images[0] ? `<img src="${escapeAttr(images[0])}" alt="${escapeAttr(product.name)}" loading="lazy">` : ''}
          ${product.category ? `<span class="card-tag">${escapeHTML(product.category)}</span>` : ''}
          ${images.length > 1 ? `<span class="card-photo-count">1/${images.length}</span>` : ''}
          ${product.inStock === false ? `<div class="card-sold">sold out</div>` : ''}
        </div>
        <div class="card-body">
          <p class="card-name">${escapeHTML(product.name)}</p>
          <p class="card-desc">${escapeHTML(product.description || '')}</p>
          <div class="card-row">
            <span class="card-price">${money(product.price)}</span>
            <button class="add-btn" data-id="${product.id}" ${product.inStock === false ? 'disabled' : ''}>
              ${product.inStock === false ? 'unavailable' : hasOptions ? 'choose options' : 'add to bag'}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function attachCardEvents(container) {
    container.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => openProductModal(card.dataset.id));
    });
    container.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const product = products.find(p => p.id === btn.dataset.id);
        if (!product) return;
        const hasOptions = (product.colors || []).length > 0 || (product.sizes || []).length > 0;
        if (hasOptions) {
          openProductModal(product.id);
        } else {
          addToCart(product.id, '', '', 1);
          flashAdded(btn);
        }
      });
    });
  }

  function fillGrid(container, list) {
    container.innerHTML = list.map(buildCardHTML).join('');
    attachCardEvents(container);
  }

  function flashAdded(btn) {
    const original = btn.dataset.originalLabel || btn.textContent;
    btn.dataset.originalLabel = original;
    btn.textContent = 'added ✓';
    btn.classList.add('added');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('added');
    }, 900);
  }

  function matchesSearch(product, query) {
    const haystack = [product.name, product.description, product.category].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function renderShop() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const thriftedItems = products.filter(p => p.isThrifted);

    thriftedNavLink.hidden = thriftedItems.length === 0;

    if (query) {
      mainSection.hidden = true;
      thriftedSection.hidden = true;
      searchSection.hidden = false;

      const matches = products.filter(p => matchesSearch(p, query));
      searchCount.textContent = `${matches.length} item${matches.length === 1 ? '' : 's'}`;
      searchEmptyState.hidden = matches.length > 0;
      fillGrid(searchGrid, matches);
      return;
    }

    searchSection.hidden = true;
    mainSection.hidden = false;

    const mainItems = products.filter(p => !p.isThrifted);
    if (!products.length) {
      emptyState.hidden = false;
      shopCount.textContent = '';
      grid.innerHTML = '';
    } else {
      emptyState.hidden = true;
      shopCount.textContent = `${mainItems.length} item${mainItems.length === 1 ? '' : 's'}`;
      fillGrid(grid, mainItems);
    }

    if (thriftedItems.length) {
      thriftedSection.hidden = false;
      thriftedCount.textContent = `${thriftedItems.length} item${thriftedItems.length === 1 ? '' : 's'}`;
      fillGrid(thriftedGrid, thriftedItems);
    } else {
      thriftedSection.hidden = true;
    }
  }

  // ---------- product detail modal ----------

  function openProductModal(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;

    activeProduct = product;
    activeColor = (product.colors && product.colors[0]) || '';
    activeSize = (product.sizes && product.sizes[0]) || '';
    activeQty = 1;
    activeSlide = 0;
    pmError.hidden = true;

    pmCategory.textContent = product.category || '';
    pmName.textContent = product.name;
    pmPrice.textContent = money(product.price);
    pmDesc.textContent = product.description || '';

    renderGallery(product.images || []);
    renderOptionGroup(pmColorGroup, pmColorPills, product.colors || [], activeColor, val => { activeColor = val; });
    renderOptionGroup(pmSizeGroup, pmSizePills, product.sizes || [], activeSize, val => { activeSize = val; });
    pmQtyValue.textContent = activeQty;

    pmAddBtn.disabled = product.inStock === false;
    pmAddBtn.textContent = product.inStock === false ? 'unavailable' : 'add to bag';

    productModal.hidden = false;
    productScrim.classList.add('open');
  }

  function closeProductModal() {
    productModal.hidden = true;
    productScrim.classList.remove('open');
    activeProduct = null;
  }

  function renderGallery(images) {
    if (!images.length) {
      pmSlides.innerHTML = '';
      pmDots.innerHTML = '';
      pmPrev.hidden = true;
      pmNext.hidden = true;
      return;
    }
    pmSlides.innerHTML = images.map(src => `<img src="${escapeAttr(src)}" alt="">`).join('');
    pmDots.innerHTML = images.map((_, i) =>
      `<button class="pm-dot ${i === 0 ? 'active' : ''}" data-slide="${i}" aria-label="Photo ${i + 1}"></button>`
    ).join('');
    pmPrev.hidden = images.length < 2;
    pmNext.hidden = images.length < 2;

    pmDots.querySelectorAll('.pm-dot').forEach(dot => {
      dot.addEventListener('click', () => goToSlide(Number(dot.dataset.slide)));
    });

    pmSlides.scrollLeft = 0;
  }

  function goToSlide(index) {
    const slides = pmSlides.children;
    if (!slides.length) return;
    activeSlide = Math.max(0, Math.min(slides.length - 1, index));
    pmSlides.scrollTo({ left: pmSlides.clientWidth * activeSlide, behavior: 'smooth' });
    updateDots();
  }

  function updateDots() {
    pmDots.querySelectorAll('.pm-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === activeSlide);
    });
  }

  function renderOptionGroup(groupEl, pillsEl, options, selected, onSelect) {
    if (!options.length) {
      groupEl.hidden = true;
      pillsEl.innerHTML = '';
      return;
    }
    groupEl.hidden = false;
    pillsEl.innerHTML = options.map(opt =>
      `<button type="button" class="pm-pill ${opt === selected ? 'selected' : ''}" data-value="${escapeAttr(opt)}">${escapeHTML(opt)}</button>`
    ).join('');

    pillsEl.querySelectorAll('.pm-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        onSelect(pill.dataset.value);
        pillsEl.querySelectorAll('.pm-pill').forEach(p => p.classList.toggle('selected', p === pill));
      });
    });
  }

  function bindProductModalEvents() {
    document.getElementById('closeProductModal').addEventListener('click', closeProductModal);
    productScrim.addEventListener('click', closeProductModal);
    pmPrev.addEventListener('click', () => goToSlide(activeSlide - 1));
    pmNext.addEventListener('click', () => goToSlide(activeSlide + 1));

    let scrollTimer;
    pmSlides.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const width = pmSlides.clientWidth || 1;
        activeSlide = Math.round(pmSlides.scrollLeft / width);
        updateDots();
      }, 80);
    });

    pmQtyDec.addEventListener('click', () => {
      activeQty = Math.max(1, activeQty - 1);
      pmQtyValue.textContent = activeQty;
    });
    pmQtyInc.addEventListener('click', () => {
      activeQty = Math.min(99, activeQty + 1);
      pmQtyValue.textContent = activeQty;
    });

    pmAddBtn.addEventListener('click', () => {
      if (!activeProduct) return;
      addToCart(activeProduct.id, activeColor, activeSize, activeQty);
      closeProductModal();
      openCart();
    });
  }

  // ---------- cart ----------

  function addToCart(id, color, size, qty) {
    const key = cartKey(id, color, size);
    const existing = cart.get(key);
    if (existing) {
      existing.qty = Math.min(99, existing.qty + qty);
    } else {
      cart.set(key, { id, color, size, qty });
    }
    renderCart();
  }

  function renderCart() {
    const entries = [...cart.entries()].filter(([, entry]) => entry.qty > 0);
    const totalQty = entries.reduce((sum, [, entry]) => sum + entry.qty, 0);
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
    cartItems.innerHTML = entries.map(([key, entry]) => {
      const product = products.find(p => p.id === entry.id);
      if (!product) return '';
      const lineTotal = product.price * entry.qty;
      total += lineTotal;
      const variant = describeVariant(entry.color, entry.size);
      const thumb = (product.images && product.images[0]) || '';
      return `
        <div class="cart-item" data-key="${escapeAttr(key)}">
          <img src="${escapeAttr(thumb)}" alt="">
          <div class="cart-item-info">
            <p class="cart-item-name">${escapeHTML(product.name)}${variant ? `<br><span style="font-weight:400;color:var(--ink-soft);font-size:0.8rem;">${escapeHTML(variant.trim())}</span>` : ''}</p>
            <p class="cart-item-price">${money(product.price)}</p>
            <div class="qty-row">
              <button class="qty-btn" data-action="dec" data-key="${escapeAttr(key)}" aria-label="Decrease quantity">−</button>
              <span class="qty-value">${entry.qty}</span>
              <button class="qty-btn" data-action="inc" data-key="${escapeAttr(key)}" aria-label="Increase quantity">+</button>
              <button class="remove-link" data-action="remove" data-key="${escapeAttr(key)}">remove</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    cartTotal.textContent = money(total);

    cartItems.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const action = btn.dataset.action;
        const entry = cart.get(key);
        if (!entry) return;
        if (action === 'inc') entry.qty += 1;
        if (action === 'dec') entry.qty = Math.max(0, entry.qty - 1);
        if (action === 'remove') cart.delete(key);
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

  // ---------- checkout ----------

  function buildWhatsAppMessage() {
    const name = document.getElementById('customerName').value.trim();
    const note = document.getElementById('customerNote').value.trim();
    const entries = [...cart.values()].filter(entry => entry.qty > 0);

    let total = 0;
    const lines = entries.map(entry => {
      const product = products.find(p => p.id === entry.id);
      if (!product) return null;
      const lineTotal = product.price * entry.qty;
      total += lineTotal;
      return `• ${product.name}${describeVariant(entry.color, entry.size)} × ${entry.qty} — ${money(lineTotal)}`;
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

    const items = [...cart.values()]
      .filter(entry => entry.qty > 0)
      .map(entry => ({ id: entry.id, qty: entry.qty, color: entry.color, size: entry.size }));

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
    if (![...cart.values()].some(entry => entry.qty > 0)) return;
    if (payMode === 'online') {
      payOnline();
    } else {
      sendDeliveryOrder();
    }
  }

  function syncThemeToggleLabel() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.textContent = isDark ? '◑' : '◐';
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    try { localStorage.setItem('drift-theme', isDark ? 'light' : 'dark'); } catch (e) {}
    syncThemeToggleLabel();
  }

  function openSearch() {
    searchBar.hidden = false;
    searchInput.focus();
  }

  function closeSearch() {
    searchBar.hidden = true;
    searchInput.value = '';
    renderShop();
  }

  function bindGlobalEvents() {
    document.getElementById('cartToggle').addEventListener('click', openCart);
    document.getElementById('closeCart').addEventListener('click', closeCart);
    scrim.addEventListener('click', closeCart);
    sendOrderBtn.addEventListener('click', sendOrder);
    payOnlineBtn.addEventListener('click', () => setPayMode('online'));
    payDeliveryBtn.addEventListener('click', () => setPayMode('delivery'));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeCart();
        closeProductModal();
      }
    });
    bindProductModalEvents();

    themeToggle.addEventListener('click', toggleTheme);
    searchToggle.addEventListener('click', () => {
      if (searchBar.hidden) openSearch(); else closeSearch();
    });
    searchClose.addEventListener('click', closeSearch);
    let searchDebounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(renderShop, 150);
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
