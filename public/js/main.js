// ============================================================================
// SteamFall ULTIMATE — главная логика
// Вкладки "Вышедшие новинки" / "Ожидаемые релизы"
// Полный каталог с пагинацией, фильтрами, поиском
// Трекинг скачиваний, избранное, популярные игры, статистика
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
  const releasedGrid = document.getElementById('releasedGamesGrid');
  const upcomingGrid = document.getElementById('upcomingGamesGrid');
  const allGamesGrid = document.getElementById('allGamesGrid');
  const paginationDiv = document.getElementById('pagination');
  const searchInput = document.getElementById('searchInput');
  const genreFilter = document.getElementById('genreFilter');
  const sortSelect = document.getElementById('sortSelect');
  const popularList = document.getElementById('popularGamesList');
  const statsBar = document.getElementById('statsBar');
  const authButtons = document.getElementById('authButtons');
  const toast = document.getElementById('toast');

  // ------------------------------ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
  }
  function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function showToast(msg, isError = false) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.color = isError ? '#ef4444' : '#a78bfa';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ------------------------------ АВТОРИЗАЦИЯ И ХЕДЕР ------------------------------
  function updateHeaderUI() {
    if (!authButtons) return;
    if (currentUser) {
      authButtons.innerHTML = `
        <div class="user-menu" style="display: flex; align-items: center; gap: 12px;">
          <img src="${currentUser.avatar || 'https://i.pravatar.cc/32'}" style="width: 32px; height: 32px; border-radius: 50%;">
          <span>${escapeHtml(currentUser.username)}</span>
          <a href="/profile.html" class="btn-outline" style="padding: 6px 16px;">Профиль</a>
          <button id="logoutBtn" class="btn-outline" style="padding: 6px 16px;">Выйти</button>
        </div>
      `;
      document.getElementById('logoutBtn')?.addEventListener('click', logout);
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
      const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        currentUser = await res.json();
        updateHeaderUI();
        await loadFavorites();
      } else {
        logout();
      }
    } catch (err) {}
  }

  async function login(username, password) { /* аналогично предыдущему, но для краткости оставлю заглушку — реально нужна? */ }
  function logout() {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    favorites.clear();
    updateHeaderUI();
    showToast('Вы вышли из аккаунта');
    location.reload();
  }

  // ------------------------------ ИЗБРАННОЕ ------------------------------
  async function loadFavorites() {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/favorites', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const favs = await res.json();
        favorites.clear();
        favs.forEach(f => favorites.add(f.gameId));
      }
    } catch (err) {}
  }
  async function toggleFavorite(gameId, btnElement) {
    if (!currentUser) { showToast('Войдите, чтобы добавить в избранное', true); return false; }
    const isFav = favorites.has(gameId);
    try {
      let res;
      if (isFav) {
        res = await fetch(`/api/favorites/${gameId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      } else {
        res = await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ gameId }) });
      }
      if (res.ok) {
        if (isFav) favorites.delete(gameId);
        else favorites.add(gameId);
        if (btnElement) {
          btnElement.innerHTML = isFav ? '<i class="far fa-heart"></i>' : '<i class="fas fa-heart"></i>';
          btnElement.style.color = isFav ? 'var(--color-text-muted)' : '#ef4444';
        }
        showToast(isFav ? 'Удалено из избранного' : 'Добавлено в избранное');
        return true;
      }
    } catch (err) {}
    return false;
  }

  // ------------------------------ ОТРИСОВКА КАРТОЧЕК (общая для всех списков) ------------------------------
  function renderGameCards(games, containerId, showFavoriteBtn = true) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!games.length) {
      container.innerHTML = '<div style="text-align:center; padding:40px;">Игры не найдены</div>';
      return;
    }
    container.innerHTML = games.map(game => `
      <div class="game-card" data-id="${game.id}">
        <div class="card-img" style="background-image: url('${game.screenshots?.[0] || 'https://picsum.photos/id/0/300/160'}');"></div>
        <div class="card-content">
          <div class="game-title">${escapeHtml(game.title)}</div>
          <div class="genre">${escapeHtml(game.genre)}</div>
          <div class="meta">
            <span><i class="fas fa-hdd"></i> ${game.size}</span>
            <span><i class="fas fa-calendar"></i> ${new Date(game.releaseDate).getFullYear()}</span>
            <span><i class="fas fa-sync-alt"></i> UPD ${game.updates_count || 0}</span>
            <span><i class="fas fa-eye"></i> ${formatNumber(game.views)}</span>
          </div>
          ${game.alternative_torrents && game.alternative_torrents.length ? `
            <div class="alternative-downloads">
              <select class="alt-select" data-id="${game.id}">
                ${game.alternative_torrents.map((alt, idx) => `<option value="${idx}">${alt.label} (${alt.size})</option>`).join('')}
              </select>
              <button class="download-alt" data-id="${game.id}">Скачать</button>
            </div>
          ` : `<button class="download-btn" data-magnet="${escapeHtml(game.magnet)}" data-id="${game.id}">Скачать торрент</button>`}
          ${showFavoriteBtn && currentUser ? `<button class="favorite-btn" data-id="${game.id}"><i class="${favorites.has(game.id) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>` : ''}
          <a href="/game.html?id=${game.id}" class="details-link">Подробнее →</a>
        </div>
      </div>
    `).join('');

    // Обработчики скачивания (обычные и альтернативные)
    document.querySelectorAll(`#${containerId} .download-btn`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const magnet = btn.getAttribute('data-magnet');
        const gameId = btn.dataset.id;
        if (magnet && magnet !== 'undefined') {
          window.open(magnet, '_blank');
          trackDownload(gameId);
          showToast('Торрент запущен в клиенте');
        } else {
          showToast('Magnet-ссылка недоступна', true);
        }
      });
    });
    document.querySelectorAll(`#${containerId} .download-alt`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gameId = btn.dataset.id;
        const select = document.querySelector(`#${containerId} .alt-select[data-id="${gameId}"]`);
        const selectedIdx = select.value;
        const game = games.find(g => g.id == gameId);
        if (game && game.alternative_torrents && game.alternative_torrents[selectedIdx]) {
          const magnet = game.alternative_torrents[selectedIdx].magnet;
          window.open(magnet, '_blank');
          trackDownload(gameId);
          showToast(`Скачивание: ${game.alternative_torrents[selectedIdx].label}`);
        } else {
          showToast('Ошибка выбора раздачи', true);
        }
      });
    });
    // Обработчики избранного
    document.querySelectorAll(`#${containerId} .favorite-btn`).forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gameId = parseInt(btn.dataset.id);
        await toggleFavorite(gameId, btn.querySelector('i'));
      });
    });
  }

  async function trackDownload(gameId) {
    try {
      await fetch('/api/track-download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId }) });
    } catch (err) {}
  }

  // ------------------------------ ЗАГРУЗКА НОВИНОК И ОЖИДАЕМЫХ ------------------------------
  async function loadReleasedGames() {
    try {
      const res = await fetch('/api/games/released');
      const games = await res.json();
      renderGameCards(games, 'releasedGamesGrid');
    } catch (err) { console.error(err); }
  }
  async function loadUpcomingGames() {
    try {
      const res = await fetch('/api/games/upcoming');
      const games = await res.json();
      renderGameCards(games, 'upcomingGamesGrid');
    } catch (err) { console.error(err); }
  }
  async function loadPopularSidebar() {
    try {
      const res = await fetch('/api/games/popular');
      const games = await res.json();
      if (popularList) {
        popularList.innerHTML = games.map(game => `<li><a href="/game.html?id=${game.id}">${escapeHtml(game.title)}</a><span>${formatNumber(game.downloads)} ⬇️</span></li>`).join('');
      }
    } catch (err) {}
  }
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();
      document.getElementById('statGames').innerText = stats.totalGames;
      document.getElementById('statUpdates').innerText = stats.updatesLastWeek || 0;
      document.getElementById('statUsers').innerText = stats.totalUsers;
      document.getElementById('statComments').innerText = stats.totalComments || 0;
    } catch (err) {}
  }

  // ------------------------------ ОСНОВНОЙ КАТАЛОГ (пагинация, фильтры) ------------------------------
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
      renderGameCards(gamesData, 'allGamesGrid');
      renderPagination();
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Ошибка загрузки игр', true);
    } finally {
      isLoading = false;
    }
  }
  function renderPagination() {
    if (!paginationDiv) return;
    if (totalPages <= 1) { paginationDiv.innerHTML = ''; return; }
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
  function applyFilters() {
    currentSearch = searchInput?.value.trim() || '';
    currentGenre = genreFilter?.value || 'all';
    currentSort = sortSelect?.value || 'date';
    loadGames(1);
  }

  // ------------------------------ ВКЛАДКИ ------------------------------
  function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panes.forEach(pane => pane.classList.remove('active'));
        if (tabId === 'released') document.getElementById('releasedTab').classList.add('active');
        if (tabId === 'upcoming') document.getElementById('upcomingTab').classList.add('active');
      });
    });
  }

  // ------------------------------ WEBSOCKET (обновление пиров) ------------------------------
  function initSocket() {
    if (socket) socket.disconnect();
    socket = io();
    socket.on('peers-updated', (peers) => {
      peers.forEach(peer => {
        const cards = document.querySelectorAll(`.game-card[data-id="${peer.id}"] .meta`);
        cards.forEach(meta => {
          // обновляем seeders (можно дополнить)
        });
      });
    });
  }
  async function triggerPeerUpdate() {
    try { await fetch('/api/update-peers', { method: 'POST' }); } catch(e) {}
  }

  // ------------------------------ ИНИЦИАЛИЗАЦИЯ ------------------------------
  async function init() {
    await loadCurrentUser();
    await loadReleasedGames();
    await loadUpcomingGames();
    await loadPopularSidebar();
    await loadStats();
    await loadGames(1);
    initTabs();
    initSocket();
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (genreFilter) genreFilter.addEventListener('change', applyFilters);
    if (sortSelect) sortSelect.addEventListener('change', applyFilters);
    setInterval(() => { triggerPeerUpdate(); loadStats(); loadPopularSidebar(); }, 60000);
  }
  init();
})();
