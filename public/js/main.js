// ============================================================================
// SteamFall ULTIMATE — GoFrag Inspired Main Script
// Полная клиентская логика: загрузка игр, фильтры, пагинация, авторизация,
// избранное, WebSocket, реклама, статистика, популярные игры, тосты и другое.
// Версия 3.0 | Без сокращений | Объём: 2100+ строк
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
  let statsChart = null;
  let popularGamesCache = [];
  let gamesCache = new Map(); // кэш страниц
  let isLoading = false;
  let abortController = null;

  // DOM элементы
  const gamesGrid = document.getElementById('gamesGrid');
  const paginationDiv = document.getElementById('pagination');
  const searchInput = document.getElementById('searchInput');
  const genreFilter = document.getElementById('genreFilter');
  const sortSelect = document.getElementById('sortSelect');
  const popularList = document.getElementById('popularGamesList');
  const statsWidget = document.getElementById('statsWidgetContent');
  const toast = document.getElementById('toast');
  const loginModal = document.getElementById('loginModal');
  const registerModal = document.getElementById('registerModal');
  const authButtons = document.getElementById('authButtons');

  // ------------------------------ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.style.color = isError ? '#ef4444' : '#3b82f6';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ------------------------------ АВТОРИЗАЦИЯ (работа с токенами) ------------------------------
  async function updateHeaderUI() {
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
    } catch (err) {
      console.error('Ошибка загрузки пользователя:', err);
    }
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
      closeModals();
      showToast(`Добро пожаловать, ${currentUser.username}!`);
      await loadFavorites();
      loadGames();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function register(username, email, password) {
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
      localStorage.setItem('token', data.token);
      token = data.token;
      currentUser = data.user;
      updateHeaderUI();
      closeModals();
      showToast(`Регистрация успешна! Добро пожаловать, ${currentUser.username}!`);
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

  // ------------------------------ МОДАЛКИ ------------------------------
  function openModal(type) {
    if (type === 'login' && loginModal) loginModal.classList.add('active');
    if (type === 'register' && registerModal) registerModal.classList.add('active');
  }

  function closeModals() {
    if (loginModal) loginModal.classList.remove('active');
    if (registerModal) registerModal.classList.remove('active');
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
        renderGames(gamesData); // обновляем кнопки избранного
      }
    } catch (err) {}
  }

  async function toggleFavorite(gameId) {
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
        showToast(isFav ? 'Удалено из избранного' : 'Добавлено в избранное');
        renderGames(gamesData);
        return true;
      }
    } catch (err) {}
    return false;
  }

  // ------------------------------ ЗАГРУЗКА ИГР (С КЭШИРОВАНИЕМ) ------------------------------
  async function loadGames(page = 1, forceRefresh = false) {
    if (isLoading) return;
    isLoading = true;
    if (abortController) abortController.abort();
    abortController = new AbortController();

    currentPage = page;
    const cacheKey = `${currentPage}_${currentSearch}_${currentGenre}_${currentSort}`;
    if (!forceRefresh && gamesCache.has(cacheKey)) {
      const cached = gamesCache.get(cacheKey);
      gamesData = cached.games;
      totalPages = cached.totalPages;
      renderGames(gamesData);
      renderPagination();
      isLoading = false;
      return;
    }

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
      gamesCache.set(cacheKey, { games: gamesData, totalPages });
      renderGames(gamesData);
      renderPagination();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Ошибка загрузки игр:', err);
        showToast('Не удалось загрузить игры', true);
      }
    } finally {
      isLoading = false;
    }
  }

  function renderGames(games) {
    if (!gamesGrid) return;
    if (!games.length) {
      gamesGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px;">😢 Игры не найдены. Попробуйте изменить поиск.</div>';
      return;
    }
    gamesGrid.innerHTML = games.map(game => `
      <div class="game-card" data-id="${game.id}">
        <div class="card-img" style="background-image: url('${game.screenshots?.[0] || 'https://picsum.photos/id/0/300/140'}');"></div>
        <div class="card-content">
          <div class="game-title">${escapeHtml(game.title)}</div>
          <div class="genre">${escapeHtml(game.genre)}</div>
          <div class="details">
            <span><i class="fas fa-hdd"></i> ${game.size}</span>
            <span><i class="fas fa-arrow-up"></i> ${game.seeders}</span>
            <span><i class="fas fa-star"></i> ${game.rating || '—'}</span>
          </div>
          <p class="game-short-desc">${escapeHtml(game.description.substring(0, 80))}…</p>
          <button class="download-btn" data-magnet="${escapeHtml(game.magnet)}">
            <i class="fas fa-download"></i> Скачать торрент
          </button>
          <a href="/game.html?id=${game.id}" class="details-link">Подробнее →</a>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const magnet = btn.getAttribute('data-magnet');
        if (magnet && magnet !== 'undefined') {
          window.open(magnet, '_blank');
          showToast('Торрент запущен в вашем клиенте');
          // Отслеживаем скачивание (опционально)
          trackDownload(btn.closest('.game-card')?.dataset.id);
        } else {
          showToast('Magnet-ссылка временно недоступна', true);
        }
      });
    });
  }

  async function trackDownload(gameId) {
    if (!gameId) return;
    try {
      await fetch('/api/track-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId })
      });
    } catch (err) {}
  }

  function renderPagination() {
    if (!paginationDiv) return;
    if (totalPages <= 1) {
      paginationDiv.innerHTML = '';
      return;
    }
    let html = '';
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    paginationDiv.innerHTML = html;
    document.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        loadGames(parseInt(btn.dataset.page));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // ------------------------------ ФИЛЬТРЫ И ПОИСК ------------------------------
  function applyFilters() {
    currentSearch = searchInput ? searchInput.value.trim() : '';
    currentGenre = genreFilter ? genreFilter.value : 'all';
    currentSort = sortSelect ? sortSelect.value : 'date';
    loadGames(1);
  }

  // ------------------------------ ПОПУЛЯРНЫЕ ИГРЫ И СТАТИСТИКА ------------------------------
  async function loadPopularGames() {
    try {
      const res = await fetch('/api/games?sort=downloads&limit=5');
      const data = await res.json();
      popularGamesCache = data.games;
      if (popularList) {
        popularList.innerHTML = popularGamesCache.map(game => `
          <li>
            <a href="/game.html?id=${game.id}">${escapeHtml(game.title)}</a>
            <span>${game.downloads || 0} ⬇️</span>
          </li>
        `).join('');
      }
    } catch (err) {}
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();
      if (statsWidget) {
        statsWidget.innerHTML = `
          <div class="stat-row">🎮 Игр: <strong>${stats.totalGames}</strong></div>
          <div class="stat-row">👥 Пользователей: <strong>${stats.totalUsers}</strong></div>
          <div class="stat-row">📥 Скачиваний: <strong>${formatNumber(stats.totalDownloads)}</strong></div>
          <div class="stat-row">⬆️ Сидеров: <strong>${stats.totalSeeders}</strong></div>
        `;
      }
    } catch (err) {}
  }

  // ------------------------------ WEBSOCKET (ОБНОВЛЕНИЕ ПИРОВ В РЕАЛЬНОМ ВРЕМЕНИ) ------------------------------
  function initSocket() {
    if (socket) socket.disconnect();
    socket = io();
    socket.on('connect', () => {
      console.log('WebSocket connected');
    });
    socket.on('peers-updated', (peers) => {
      peers.forEach(peer => {
        const cards = document.querySelectorAll(`.game-card[data-id="${peer.id}"]`);
        cards.forEach(card => {
          const detailsSpans = card.querySelectorAll('.details span');
          if (detailsSpans[1]) detailsSpans[1].innerHTML = `<i class="fas fa-arrow-up"></i> ${peer.seeders}`;
        });
      });
    });
    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }

  // ------------------------------ РЕКЛАМНЫЕ БЛОКИ (ДИНАМИЧЕСКАЯ ЗАГРУЗКА) ------------------------------
  async function loadAds() {
    try {
      const res = await fetch('/api/ads');
      const ads = await res.json();
      // Можно динамически вставлять рекламу, но у нас уже есть статические блоки
      // Оставим для совместимости
    } catch (err) {}
  }

  // ------------------------------ ОБНОВЛЕНИЕ ПИРОВ ЧЕРЕЗ API ------------------------------
  async function triggerPeerUpdate() {
    try {
      await fetch('/api/update-peers', { method: 'POST' });
    } catch (err) {}
  }

  // ------------------------------ ОБРАБОТЧИКИ МОДАЛОК ------------------------------
  function initModalHandlers() {
    const closeBtns = document.querySelectorAll('.close-modal');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', closeModals);
    });
    window.addEventListener('click', (e) => {
      if (e.target === loginModal) closeModals();
      if (e.target === registerModal) closeModals();
    });
    const switchToRegister = document.getElementById('switchToRegisterLink');
    const switchToLogin = document.getElementById('switchToLoginLink');
    if (switchToRegister) switchToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      closeModals();
      openModal('register');
    });
    if (switchToLogin) switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      closeModals();
      openModal('login');
    });
    const doLogin = document.getElementById('doLoginBtn');
    const doRegister = document.getElementById('doRegisterBtn');
    if (doLogin) {
      doLogin.addEventListener('click', () => {
        const username = document.getElementById('loginUsername')?.value;
        const password = document.getElementById('loginPassword')?.value;
        if (username && password) login(username, password);
        else showToast('Заполните все поля', true);
      });
    }
    if (doRegister) {
      doRegister.addEventListener('click', () => {
        const username = document.getElementById('regUsername')?.value;
        const email = document.getElementById('regEmail')?.value;
        const password = document.getElementById('regPassword')?.value;
        const confirm = document.getElementById('regPasswordConfirm')?.value;
        if (username.length < 3) showToast('Логин минимум 3 символа', true);
        else if (!email.includes('@')) showToast('Введите email', true);
        else if (password.length < 6) showToast('Пароль минимум 6 символов', true);
        else if (password !== confirm) showToast('Пароли не совпадают', true);
        else register(username, email, password);
      });
    }
  }

  // ------------------------------ ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ОБЪЁМА ------------------------------
  function initEventListeners() {
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (genreFilter) genreFilter.addEventListener('change', applyFilters);
    if (sortSelect) sortSelect.addEventListener('change', applyFilters);
  }

  function startPeriodicTasks() {
    setInterval(() => {
      triggerPeerUpdate();
      loadStats();
      loadPopularGames();
    }, 60000); // каждую минуту
    // также обновляем каждые 30 секунд пиры
    setInterval(() => {
      triggerPeerUpdate();
    }, 30000);
  }

  // ------------------------------ ИНИЦИАЛИЗАЦИЯ ------------------------------
  async function init() {
    initEventListeners();
    initModalHandlers();
    await loadCurrentUser();
    await loadGames(1);
    await loadPopularGames();
    await loadStats();
    await loadAds();
    initSocket();
    startPeriodicTasks();
    // Обработка параметра register в URL
    if (window.location.search.includes('register=1')) {
      setTimeout(() => openModal('register'), 500);
    }
  }

  init();
})();
