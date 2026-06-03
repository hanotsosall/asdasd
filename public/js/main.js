// public/js/main.js - SteamFall ULTIMATE
// Полная клиентская логика: авторизация, загрузка игр, фильтры, пагинация, избранное, WebSocket, графики, статистика
(function() {
  // ====================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ======================
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
  let onlinePeersInterval = null;

  // DOM элементы
  const gamesGrid = document.getElementById('gamesGrid');
  const paginationDiv = document.getElementById('pagination');
  const searchInput = document.getElementById('searchInput');
  const genreFilter = document.getElementById('genreFilter');
  const sortSelect = document.getElementById('sortSelect');
  const headerActions = document.getElementById('headerActions');
  const loginModal = document.getElementById('loginModal');
  const registerModal = document.getElementById('registerModal');
  const toast = document.getElementById('toast');
  const statsContent = document.getElementById('statsContent');
  const onlinePeersSpan = document.getElementById('onlinePeers');
  const topGamesList = document.getElementById('topGamesList');
  const headerAd = document.getElementById('headerAd');
  const sidebarAd = document.getElementById('sidebarAd');
  const infeedAd = document.getElementById('infeedAd');

  // ====================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ======================
  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.style.color = isError ? '#FF6B6B' : '#00E5FF';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

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
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  // ====================== АВТОРИЗАЦИЯ ======================
  function updateHeaderUI() {
    if (currentUser) {
      headerActions.innerHTML = `
        <div class="user-menu">
          <img src="${currentUser.avatar || 'https://i.pravatar.cc/40?img=1'}" class="avatar-small" alt="avatar">
          <span class="username">${escapeHtml(currentUser.username)}</span>
          <button id="logoutBtn" class="btn-outline small">Выйти</button>
        </div>
      `;
      document.getElementById('logoutBtn')?.addEventListener('click', logout);
    } else {
      headerActions.innerHTML = `
        <button id="loginBtnHeader" class="btn-outline">Войти</button>
        <button id="registerBtnHeader" class="btn-primary">Регистрация</button>
      `;
      document.getElementById('loginBtnHeader')?.addEventListener('click', () => openModal('login'));
      document.getElementById('registerBtnHeader')?.addEventListener('click', () => openModal('register'));
    }
  }

  function openModal(type) {
    if (type === 'login') {
      loginModal.classList.add('active');
    } else {
      registerModal.classList.add('active');
    }
  }

  function closeModals() {
    loginModal.classList.remove('active');
    registerModal.classList.remove('active');
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
      if (!res.ok) {
        if (data.errors) throw new Error(data.errors[0].msg);
        throw new Error(data.error || 'Ошибка регистрации');
      }
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

  async function logout() {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    favorites.clear();
    updateHeaderUI();
    showToast('Вы вышли из аккаунта');
    loadGames();
  }

  async function loadUser() {
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
      logout();
    }
  }

  // ====================== ИЗБРАННОЕ ======================
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
        renderGames(gamesData); // перерисовка карточек
      }
    } catch (err) {}
  }

  async function toggleFavorite(gameId) {
    if (!currentUser) {
      showToast('Войдите, чтобы добавлять в избранное', true);
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

  // ====================== ЗАГРУЗКА ИГР ======================
  async function loadGames(page = 1) {
    currentPage = page;
    const params = new URLSearchParams({
      page: currentPage,
      limit: 12,
      search: currentSearch,
      genre: currentGenre,
      sort: currentSort
    });
    try {
      const res = await fetch(`/api/games?${params}`);
      const data = await res.json();
      gamesData = data.games;
      totalPages = data.totalPages;
      renderGames(gamesData);
      renderPagination();
    } catch (err) {
      showToast('Ошибка загрузки игр', true);
    }
  }

  function renderGames(games) {
    if (!gamesGrid) return;
    if (!games.length) {
      gamesGrid.innerHTML = '<div class="no-results">😢 Игры не найдены. Попробуйте изменить поиск.</div>';
      return;
    }
    gamesGrid.innerHTML = games.map(game => `
      <div class="game-card" data-id="${game.id}">
        <div class="card-img" style="background-image: url('${game.screenshots?.[0] || 'https://picsum.photos/id/0/300/200'}');"></div>
        <div class="card-content">
          <div class="game-title">${escapeHtml(game.title)}</div>
          <div class="genre">${escapeHtml(game.genre)}</div>
          <div class="details">
            <span><i class="fas fa-hdd"></i> ${game.size}</span>
            <span><i class="fas fa-arrow-up"></i> ${game.seeders}</span>
            <span><i class="fas fa-arrow-down"></i> ${game.leechers}</span>
            <span><i class="fas fa-star"></i> ${game.rating || '—'}</span>
          </div>
          <p class="game-short-desc">${escapeHtml(game.description.substring(0, 80))}...</p>
          <div class="card-buttons">
            <button class="magnet-btn" data-magnet="${escapeHtml(game.magnet)}"><i class="fas fa-magnet"></i> Magnet</button>
            <button class="favorite-card-btn ${favorites.has(game.id) ? 'active' : ''}" data-id="${game.id}">
              <i class="fas ${favorites.has(game.id) ? 'fa-heart' : 'fa-heart-broken'}"></i>
            </button>
          </div>
          <a href="/game.html?id=${game.id}" class="details-link">Подробнее →</a>
        </div>
      </div>
    `).join('');

    // Обработчики кнопок Magnet
    document.querySelectorAll('.magnet-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const magnet = btn.getAttribute('data-magnet');
        if (magnet && magnet !== 'undefined') {
          window.open(magnet, '_blank');
          showToast('🧲 Magnet-ссылка открыта в торрент-клиенте');
        } else {
          showToast('Magnet-ссылка временно недоступна', true);
        }
      });
    });
    // Обработчики избранного на карточках
    document.querySelectorAll('.favorite-card-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gameId = parseInt(btn.dataset.id);
        await toggleFavorite(gameId);
      });
    });
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
  }

  // ====================== ФИЛЬТРЫ ======================
  function applyFilters() {
    currentSearch = searchInput.value.trim();
    currentGenre = genreFilter.value;
    currentSort = sortSelect.value;
    loadGames(1);
  }

  // ====================== СТАТИСТИКА И ТОП ИГР ======================
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();
      if (statsContent) {
        statsContent.innerHTML = `
          <div class="stat-row"><span>🎮 Игр:</span> <strong>${stats.totalGames}</strong></div>
          <div class="stat-row"><span>👥 Пользователей:</span> <strong>${stats.totalUsers}</strong></div>
          <div class="stat-row"><span>📥 Скачиваний:</span> <strong>${formatNumber(stats.totalDownloads)}</strong></div>
          <div class="stat-row"><span>⬆️ Сидеров онлайн:</span> <strong>${stats.totalSeeders}</strong></div>
        `;
      }
      if (topGamesList) {
        topGamesList.innerHTML = stats.topGames.map(g => `
          <li><span class="top-title">${escapeHtml(g.title)}</span> <span class="top-downloads">${formatNumber(g.downloads)} ⬇️</span></li>
        `).join('');
      }
      // обновляем виджет "сейчас играют" (суммарные сидеры)
      if (onlinePeersSpan) onlinePeersSpan.innerHTML = `<i class="fas fa-users"></i> ${stats.totalSeeders} сидеров онлайн`;
    } catch (err) {}
  }

  // ====================== РЕКЛАМА ======================
  async function loadAds() {
    try {
      const res = await fetch('/api/ads');
      const ads = await res.json();
      const header = ads.find(a => a.position === 'header');
      const sidebar = ads.find(a => a.position === 'sidebar');
      const infeed = ads.find(a => a.position === 'infeed');
      if (header && headerAd) headerAd.innerHTML = header.code;
      if (sidebar && sidebarAd) sidebarAd.innerHTML = sidebar.code;
      if (infeed && infeedAd) infeedAd.innerHTML = infeed.code;
    } catch (err) {}
  }

  // ====================== WEBSOCKET (ОБНОВЛЕНИЕ ПИРОВ) ======================
  function initSocket() {
    socket = io();
    socket.on('connect', () => {
      console.log('WebSocket connected');
    });
    socket.on('peers-updated', (peers) => {
      // обновляем отображаемые сидеры/личеры в карточках, если они на экране
      peers.forEach(peer => {
        const cards = document.querySelectorAll(`.game-card[data-id="${peer.id}"]`);
        cards.forEach(card => {
          const seedSpan = card.querySelector('.details span:nth-child(2)');
          const leechSpan = card.querySelector('.details span:nth-child(3)');
          if (seedSpan) seedSpan.innerHTML = `<i class="fas fa-arrow-up"></i> ${peer.seeders}`;
          if (leechSpan) leechSpan.innerHTML = `<i class="fas fa-arrow-down"></i> ${peer.leechers}`;
        });
      });
    });
  }

  // ====================== ОБНОВЛЕНИЕ ПИРОВ ПО API ======================
  async function triggerPeerUpdate() {
    try {
      await fetch('/api/update-peers', { method: 'POST' });
    } catch (err) {}
  }

  // ====================== ИНИЦИАЛИЗАЦИЯ ======================
  function initEventListeners() {
    searchInput?.addEventListener('input', () => applyFilters());
    genreFilter?.addEventListener('change', () => applyFilters());
    sortSelect?.addEventListener('change', () => applyFilters());
    // Модалки
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', closeModals);
    });
    window.addEventListener('click', (e) => {
      if (e.target === loginModal) closeModals();
      if (e.target === registerModal) closeModals();
    });
    document.getElementById('showRegisterLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModals();
      openModal('register');
    });
    document.getElementById('showLoginLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModals();
      openModal('login');
    });
    document.getElementById('doLoginBtn')?.addEventListener('click', () => {
      const username = document.getElementById('loginUsername').value;
      const password = document.getElementById('loginPassword').value;
      if (username && password) login(username, password);
      else showToast('Заполните все поля', true);
    });
    document.getElementById('doRegisterBtn')?.addEventListener('click', () => {
      const username = document.getElementById('regUsername').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;
      if (username.length < 3) showToast('Логин минимум 3 символа', true);
      else if (password.length < 6) showToast('Пароль минимум 6 символов', true);
      else if (!email.includes('@')) showToast('Введите корректный email', true);
      else register(username, email, password);
    });
  }

  async function start() {
    initEventListeners();
    await loadUser();
    await loadGames(1);
    await loadStats();
    await loadAds();
    initSocket();
    setInterval(() => {
      triggerPeerUpdate();
      loadStats(); // обновляем статистику каждую минуту
    }, 60000);
    setInterval(() => {
      loadStats(); // статистика
    }, 30000);
  }

  start();
})();
