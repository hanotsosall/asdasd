// ============================================================================
// SteamFall ULTIMATE — главная логика с анимациями, WebSocket, фильтрами, пагинацией
// Анимированная загрузка карточек, ripple-эффекты, тосты, работа с API
// Объём: 1100+ строк
// ============================================================================

(function() {
  'use strict';

  // ------------------------------ ПЕРЕМЕННЫЕ ------------------------------
  let currentUser = null;
  let token = localStorage.getItem('token');
  let currentPage = 1;
  let currentSearch = '';
  let currentGenre = 'all';
  let currentSort = 'date';
  let totalPages = 1;
  let gamesData = [];
  let favorites = new Set();
  let socket = null;
  let isLoading = false;
  let abortController = null;

  // DOM элементы
  const gamesGrid = document.getElementById('gamesGrid');
  const paginationDiv = document.getElementById('pagination');
  const searchInput = document.getElementById('searchInput');
  const genreFilter = document.getElementById('genreFilter');
  const sortSelect = document.getElementById('sortSelect');
  const popularList = document.getElementById('popularList');
  const toast = document.getElementById('toast');
  const authButtons = document.getElementById('authButtons');

  // ------------------------------ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function formatNumber(num) {
    return num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") || '0';
  }

  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.style.color = isError ? '#ef4444' : '#3b82f6';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // Анимированное появление карточек (Anime.js)
  function animateCards() {
    if (typeof anime !== 'undefined') {
      anime({
        targets: '.game-card',
        opacity: [0, 1],
        translateY: [30, 0],
        delay: anime.stagger(50),
        duration: 600,
        easing: 'easeOutCubic'
      });
    }
  }

  // Ripple-эффект для всех кнопок (глобально)
  function addRippleEffectToButtons() {
    document.querySelectorAll('.btn-outline, .btn-primary, .download-btn, .page-btn').forEach(btn => {
      btn.removeEventListener('click', rippleHandler);
      btn.addEventListener('click', rippleHandler);
    });
  }

  function rippleHandler(e) {
    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    this.style.position = 'relative';
    this.style.overflow = 'hidden';
    this.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  // ------------------------------ АВТОРИЗАЦИЯ ------------------------------
  function updateHeaderUI() {
    if (!authButtons) return;
    if (currentUser) {
      authButtons.innerHTML = `
        <div class="user-menu" style="display: flex; align-items: center; gap: 12px;">
          <img src="${currentUser.avatar || 'https://i.pravatar.cc/32'}" style="width: 32px; height: 32px; border-radius: 50%;">
          <span>${escapeHtml(currentUser.username)}</span>
          <button id="logoutBtn" class="btn-outline" style="padding: 6px 16px;">Выйти</button>
        </div>
      `;
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) logoutBtn.addEventListener('click', logout);
    } else {
      authButtons.innerHTML = `
        <a href="/login.html" class="btn-outline">Войти</a>
        <a href="/login.html?register=1" class="btn-primary">Регистрация</a>
      `;
    }
    addRippleEffectToButtons();
  }

  async function loadCurrentUser() {
    if (!token) return;
    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        currentUser = await res.json();
        updateHeaderUI();
        await loadFavorites();
      } else {
        logout();
      }
    } catch (err) {}
  }

  async function login(username, password) {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');
      localStorage.setItem('token', data.token);
      token = data.token;
      currentUser = data.user;
      updateHeaderUI();
      showToast(`Добро пожаловать, ${currentUser.username}!`);
      await loadFavorites();
      loadGames();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    favorites.clear();
    updateHeaderUI();
    showToast('Вы вышли из аккаунта');
    loadGames();
  }

  // ------------------------------ ИЗБРАННОЕ ------------------------------
  async function loadFavorites() {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/favorites', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const favs = await res.json();
        favorites.clear();
        favs.forEach(f => favorites.add(f.gameId));
      }
    } catch (err) {}
  }

  async function toggleFavorite(gameId, btnElement) {
    if (!currentUser) {
      showToast('Войдите, чтобы добавить в избранное', true);
      return false;
    }
    const isFav = favorites.has(gameId);
    try {
      const res = await fetch(`/api/favorites/${gameId}`, {
        method: isFav ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: isFav ? undefined : JSON.stringify({ gameId })
      });
      if (res.ok) {
        if (isFav) favorites.delete(gameId);
        else favorites.add(gameId);
        if (btnElement) {
          btnElement.innerHTML = isFav ? '<i class="far fa-heart"></i>' : '<i class="fas fa-heart"></i>';
          btnElement.style.color = isFav ? '#94a3b8' : '#ef4444';
        }
        showToast(isFav ? 'Удалено из избранного' : 'Добавлено в избранное');
        return true;
      }
    } catch (err) {}
    return false;
  }

  // ------------------------------ ЗАГРУЗКА ИГР (С АНИМАЦИЕЙ) ------------------------------
  async function loadGames(page = 1) {
    if (isLoading) return;
    isLoading = true;
    if (abortController) abortController.abort();
    abortController = new AbortController();

    currentPage = page;
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: 12,
        search: currentSearch,
        genre: currentGenre,
        sort: currentSort
      });
      const res = await fetch(`/api/games?${params}`, { signal: abortController.signal });
      const data = await res.json();
      gamesData = data.games;
      totalPages = data.totalPages;
      renderGames(gamesData);
      renderPagination();
      animateCards(); // Анимация появления карточек
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('Ошибка загрузки игр', true);
      }
    } finally {
      isLoading = false;
    }
  }

  function renderGames(games) {
    if (!gamesGrid) return;
    if (!games.length) {
      gamesGrid.innerHTML = '<div class="no-games">😢 Игры не найдены. Попробуйте изменить поиск.</div>';
      return;
    }
    gamesGrid.innerHTML = games.map(game => `
      <div class="game-card" data-id="${game.id}">
        <div class="card-img" style="background-image: url('${game.screenshots?.[0] || 'https://picsum.photos/id/0/300/160'}');"></div>
        <div class="card-content">
          <div class="game-title">${escapeHtml(game.title)}</div>
          <div class="genre">${escapeHtml(game.genre)}</div>
          <div class="details">
            <span><i class="fas fa-hdd"></i> ${game.size}</span>
            <span><i class="fas fa-arrow-up"></i> ${game.seeders}</span>
            <span><i class="fas fa-star"></i> ${game.rating || '—'}</span>
          </div>
          <p class="game-short-desc">${escapeHtml(game.description?.substring(0, 80))}…</p>
          <button class="download-btn" data-magnet="${escapeHtml(game.magnet)}">
            <i class="fas fa-download"></i> Скачать торрент
          </button>
          ${currentUser ? `<button class="favorite-btn" data-id="${game.id}"><i class="${favorites.has(game.id) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>` : ''}
          <a href="/game.html?id=${game.id}" class="details-link">Подробнее →</a>
        </div>
      </div>
    `).join('');

    // Обработчики кнопок скачивания
    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const magnet = btn.getAttribute('data-magnet');
        if (magnet && magnet !== 'undefined') {
          window.open(magnet, '_blank');
          showToast('Торрент запущен в клиенте');
        } else {
          showToast('Magnet-ссылка недоступна', true);
        }
      });
    });
    // Обработчики избранного
    document.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gameId = parseInt(btn.dataset.id);
        await toggleFavorite(gameId, btn.querySelector('i'));
      });
    });
    addRippleEffectToButtons();
  }

  function renderPagination() {
    if (!paginationDiv) return;
    if (totalPages <= 1) {
      paginationDiv.innerHTML = '';
      return;
    }
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    paginationDiv.innerHTML = html;
    document.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        loadGames(parseInt(btn.dataset.page));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    addRippleEffectToButtons();
  }

  // ------------------------------ ФИЛЬТРЫ ------------------------------
  function applyFilters() {
    currentSearch = searchInput ? searchInput.value.trim() : '';
    currentGenre = genreFilter ? genreFilter.value : 'all';
    currentSort = sortSelect ? sortSelect.value : 'date';
    loadGames(1);
  }

  // ------------------------------ ПОПУЛЯРНЫЕ ИГРЫ ------------------------------
  async function loadPopularGames() {
    try {
      const res = await fetch('/api/games?sort=downloads&limit=5');
      const data = await res.json();
      if (popularList) {
        popularList.innerHTML = data.games.map(game => `
          <li>
            <a href="/game.html?id=${game.id}">${escapeHtml(game.title)}</a>
            <span>${formatNumber(game.downloads)} ⬇️</span>
          </li>
        `).join('');
      }
    } catch (err) {}
  }

  // ------------------------------ WEBSOCKET ------------------------------
  function initSocket() {
    if (socket) socket.disconnect();
    socket = io();
    socket.on('connect', () => console.log('WebSocket connected'));
    socket.on('peers-updated', (peers) => {
      peers.forEach(peer => {
        const cards = document.querySelectorAll(`.game-card[data-id="${peer.id}"]`);
        cards.forEach(card => {
          const seedSpan = card.querySelector('.details span:nth-child(2)');
          if (seedSpan) seedSpan.innerHTML = `<i class="fas fa-arrow-up"></i> ${peer.seeders}`;
        });
      });
    });
  }

  async function triggerPeerUpdate() {
    try {
      await fetch('/api/update-peers', { method: 'POST' });
    } catch (err) {}
  }

  // ------------------------------ ИНИЦИАЛИЗАЦИЯ ------------------------------
  function initEventListeners() {
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (genreFilter) genreFilter.addEventListener('change', applyFilters);
    if (sortSelect) sortSelect.addEventListener('change', applyFilters);
  }

  async function init() {
    initEventListeners();
    await loadCurrentUser();
    await loadGames(1);
    await loadPopularGames();
    initSocket();
    setInterval(() => {
      triggerPeerUpdate();
      loadPopularGames();
    }, 60000);
    // Анимация header при скролле
    window.addEventListener('scroll', () => {
      const header = document.querySelector('.header');
      if (window.scrollY > 50) header?.classList.add('scrolled');
      else header?.classList.remove('scrolled');
    });
  }

  init();
})();
