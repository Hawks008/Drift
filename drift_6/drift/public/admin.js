(function () {
  'use strict';

  let products = [];
  let pendingImages = []; // array of image URLs/base64 data URIs, in display order

  const loginScreen = document.getElementById('loginScreen');
  const adminApp = document.getElementById('adminApp');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');

  const itemTable = document.getElementById('itemTable');
  const itemsEmpty = document.getElementById('itemsEmpty');

  const modalScrim = document.getElementById('modalScrim');
  const itemModal = document.getElementById('itemModal');
  const itemForm = document.getElementById('itemForm');
  const modalTitle = document.getElementById('modalTitle');
  const itemError = document.getElementById('itemError');
  const deleteItemBtn = document.getElementById('deleteItemBtn');
  const imageList = document.getElementById('imageList');

  // ---------- auth ----------

  async function checkSession() {
    const res = await fetch('/api/session');
    const data = await res.json();
    if (data.loggedIn) {
      showApp();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    loginScreen.hidden = false;
    adminApp.hidden = true;
  }

  function showApp() {
    loginScreen.hidden = true;
    adminApp.hidden = false;
    loadProducts();
    loadSettings();
  }

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    loginError.hidden = true;
    const password = document.getElementById('loginPassword').value;
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      loginError.textContent = data.error || 'Something went wrong.';
      loginError.hidden = false;
      return;
    }
    showApp();
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    showLogin();
  });

  // ---------- tabs ----------

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => (p.hidden = true));
      document.getElementById(`tab-${btn.dataset.tab}`).hidden = false;
    });
  });

  // ---------- items ----------

  async function loadProducts() {
    const res = await fetch('/api/products');
    products = await res.json();
    renderTable();
  }

  function renderTable() {
    if (!products.length) {
      itemsEmpty.hidden = false;
      itemTable.innerHTML = '';
      return;
    }
    itemsEmpty.hidden = true;
    itemTable.innerHTML = products.map(p => `
      <div class="item-row" data-id="${p.id}">
        <img src="${escapeAttr((p.images && p.images[0]) || '')}" alt="">
        <div class="item-row-info">
          <p class="item-row-name">${escapeHTML(p.name)}</p>
          <p class="item-row-meta">
            <span class="price">${escapeHTML(String(p.price))}</span>
            ${p.category ? ` · ${escapeHTML(p.category)}` : ''}
            ${p.images && p.images.length > 1 ? ` · ${p.images.length} photos` : ''}
            <span class="pill ${p.inStock === false ? 'out' : ''}">${p.inStock === false ? 'sold out' : 'in stock'}</span>
          </p>
        </div>
        <button class="ghost-btn" data-action="edit" data-id="${p.id}">edit</button>
      </div>
    `).join('');

    itemTable.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => openModal(btn.dataset.id));
    });
  }

  document.getElementById('newItemBtn').addEventListener('click', () => openModal(null));

  function openModal(id) {
    itemError.hidden = true;
    document.getElementById('itemImageFile').value = '';
    document.getElementById('itemImageUrl').value = '';

    const product = id ? products.find(p => p.id === id) : null;

    modalTitle.textContent = product ? 'edit item' : 'add item';
    document.getElementById('itemId').value = product ? product.id : '';
    document.getElementById('itemName').value = product ? product.name : '';
    document.getElementById('itemPrice').value = product ? product.price : '';
    document.getElementById('itemCategory').value = product ? (product.category || '') : '';
    document.getElementById('itemDescription').value = product ? (product.description || '') : '';
    document.getElementById('itemColors').value = product && product.colors ? product.colors.join(', ') : '';
    document.getElementById('itemSizes').value = product && product.sizes ? product.sizes.join(', ') : '';
    document.getElementById('itemInStock').checked = product ? product.inStock !== false : true;
    deleteItemBtn.hidden = !product;

    pendingImages = product && Array.isArray(product.images) ? product.images.slice() : [];
    renderImageList();

    itemModal.hidden = false;
    modalScrim.classList.add('open');
  }

  function renderImageList() {
    imageList.innerHTML = pendingImages.map((src, i) => `
      <div class="image-thumb" data-index="${i}">
        <img src="${escapeAttr(src)}" alt="">
        ${i === 0 ? '<span class="thumb-cover">cover</span>' : ''}
        <button type="button" class="thumb-remove" data-index="${i}" aria-label="Remove photo">×</button>
      </div>
    `).join('');

    imageList.querySelectorAll('.thumb-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingImages.splice(Number(btn.dataset.index), 1);
        renderImageList();
      });
    });
  }

  function addPendingImage(src) {
    if (!src) return;
    if (pendingImages.length >= 6) {
      itemError.textContent = 'You can add up to 6 photos per item.';
      itemError.hidden = false;
      return;
    }
    pendingImages.push(src);
    renderImageList();
  }

  function closeModal() {
    itemModal.hidden = true;
    modalScrim.classList.remove('open');
  }

  document.getElementById('closeModal').addEventListener('click', closeModal);
  modalScrim.addEventListener('click', closeModal);

  document.getElementById('itemImageFile').addEventListener('change', e => {
    const files = [...e.target.files];
    if (!files.length) return;

    files.forEach(file => {
      if (file.size > 6 * 1024 * 1024) {
        itemError.textContent = `"${file.name}" is too large. Try a photo under 6MB.`;
        itemError.hidden = false;
        return;
      }
      const reader = new FileReader();
      reader.onload = () => addPendingImage(reader.result);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  });

  document.getElementById('addImageUrlBtn').addEventListener('click', () => {
    const input = document.getElementById('itemImageUrl');
    const url = input.value.trim();
    if (!url) return;
    addPendingImage(url);
    input.value = '';
  });

  itemForm.addEventListener('submit', async e => {
    e.preventDefault();
    itemError.hidden = true;

    const id = document.getElementById('itemId').value;
    const colors = document.getElementById('itemColors').value.split(',').map(s => s.trim()).filter(Boolean);
    const sizes = document.getElementById('itemSizes').value.split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
      name: document.getElementById('itemName').value.trim(),
      price: parseFloat(document.getElementById('itemPrice').value),
      category: document.getElementById('itemCategory').value.trim(),
      description: document.getElementById('itemDescription').value.trim(),
      images: pendingImages,
      colors,
      sizes,
      inStock: document.getElementById('itemInStock').checked
    };

    const res = await fetch(id ? `/api/products/${id}` : '/api/products', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      itemError.textContent = data.error || 'Could not save that item.';
      itemError.hidden = false;
      return;
    }

    closeModal();
    loadProducts();
  });

  deleteItemBtn.addEventListener('click', async () => {
    const id = document.getElementById('itemId').value;
    if (!id) return;
    if (!confirm('Remove this item from the shop? This can\'t be undone.')) return;
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      closeModal();
      loadProducts();
    }
  });

  // ---------- settings ----------

  async function loadSettings() {
    const res = await fetch('/api/admin/config');
    const config = await res.json();
    document.getElementById('storeName').value = config.storeName || '';
    document.getElementById('whatsappNumber').value = config.whatsappNumber || '';
    document.getElementById('currency').value = config.currency || '$';

    document.getElementById('paymentsEnabled').checked = Boolean(config.paymentsEnabled);
    document.getElementById('paystackPublicKey').value = config.paystackPublicKey || '';
    document.getElementById('paystackCurrency').value = config.paystackCurrency || 'GHS';
    document.getElementById('paystackSecretKey').value = '';
    document.getElementById('secretKeyStatus').textContent = config.hasSecretKey
      ? 'A secret key is already saved. Leave the field blank to keep it.'
      : 'No secret key saved yet.';
  }

  document.getElementById('settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const success = document.getElementById('settingsSuccess');
    success.hidden = true;

    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeName: document.getElementById('storeName').value.trim(),
        whatsappNumber: document.getElementById('whatsappNumber').value.trim(),
        currency: document.getElementById('currency').value.trim()
      })
    });
    const data = await res.json();
    if (res.ok) {
      success.hidden = false;
      setTimeout(() => (success.hidden = true), 2500);
    } else {
      alert(data.error || 'Could not save settings.');
    }
  });

  document.getElementById('paymentsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const success = document.getElementById('paymentsSuccess');
    const errorEl = document.getElementById('paymentsError');
    success.hidden = true;
    errorEl.hidden = true;

    const payload = {
      paymentsEnabled: document.getElementById('paymentsEnabled').checked,
      paystackPublicKey: document.getElementById('paystackPublicKey').value.trim(),
      paystackCurrency: document.getElementById('paystackCurrency').value
    };
    const secretKey = document.getElementById('paystackSecretKey').value.trim();
    if (secretKey) payload.paystackSecretKey = secretKey;

    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      success.hidden = false;
      setTimeout(() => (success.hidden = true), 2500);
      loadSettings();
    } else {
      errorEl.textContent = data.error || 'Could not save payment settings.';
      errorEl.hidden = false;
    }
  });

  document.getElementById('passwordForm').addEventListener('submit', async e => {
    e.preventDefault();
    const errorEl = document.getElementById('passwordError');
    const successEl = document.getElementById('passwordSuccess');
    errorEl.hidden = true;
    successEl.hidden = true;

    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: document.getElementById('currentPassword').value,
        newPassword: document.getElementById('newPassword').value
      })
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Could not update password.';
      errorEl.hidden = false;
      return;
    }
    successEl.hidden = false;
    e.target.reset();
  });

  // ---------- helpers ----------

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHTML(str).replace(/"/g, '&quot;');
  }

  checkSession();
})();
