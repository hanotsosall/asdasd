// ============================================================
// SteamFall PRO — главная логика (совместима со стеклянным дизайном)
// Загрузка игр, фильтры, пагинация, авторизация, избранное, WebSocket
// ============================================================

(function() {
  'use strict';

  // -------------------- ПЕРЕМЕННЫЕ --------------------
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
  const popularList = document.getElementById('popularGamesList');
  const toast = document.getElementById('toast');
  const authButtons = document.getElementById('authButtons');

  // -------------------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ --------------------
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
    if (!num && num !== 0) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.style.color = isError ? '#ef4444' : '#a78bfa';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // -------------------- АВТОРИЗАЦИЯ (UI) --------------------
  function updateHeaderUI() {
    if (!authButtons) return;
    if (currentUser) {
      authButtons.innerHTML = `
        <div class="user-menu" style="display: flex; align-items: center; gap: 12px;">
          <img src="${currentUser.avatar || 'https://i.pravatar.cc/32'}" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid #a78bfa;">
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
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        currentUser = await res.json();
        updateHeaderUI();
        await loadFavorites();
      } else {
        logout();
      }
    } catch (err) {
      console.error('Ошибка загрузки пользователя');
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

  // -------------------- ИЗБРАННОЕ --------------------
  async function loadFavorites() {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/favorites', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const favs = await res.json();
        favorites.clear();
        favs.forEach(f => favorites.add(f.gameId));
        renderGames(gamesData);
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
          Authorization: `Bearer ${token}`
        },
        body: isFav ? undefined : JSON.stringify({ gameId })
      });
      if (res.ok) {
        if (isFav) favorites.delete(gameId);
        else favorites.add(gameId);
        if (btnElement) {
          btnElement.innerHTML = isFav ? '<i class="far fa-heart"></i>' : '<i class="fas fa-heart"></i>';
          btnElement.style.color = isFav ? '#94a3b8' : '#f472b6';
        }
        showToast(isFav ? 'Удалено из избранного' : 'Добавлено в избранное');
        return true;
      }
    } catch (err) {}
    return false;
  }

  // -------------------- ЗАГРУЗКА ИГР --------------------
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
      gamesGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px;">😢 Игры не найдены. Попробуйте изменить поиск.</div>';
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
          <p class="game-short-desc">${escapeHtml(game.description?.substring(0, 80) || '')}…</p>
          <button class="download-btn" data-magnet="${escapeHtml(game.magnet)}">
            <i class="fas fa-download"></i> Скачать торрент
          </button>
          ${currentUser ? `<button class="favorite-btn" data-id="${game.id}"><i class="${favorites.has(game.id) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>` : ''}
          <a href="/game.html?id=${game.id}" class="details-link">Подробнее →</a>
        </div>
      </div>
    `).join('');

    // Обработчики скачивания
    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const magnet = btn.getAttribute('data-magnet');
        if (magnet && magnet !== 'undefined') {
          window.open(magnet, '_blank');
          showToast('Торрент запущен в клиенте');
        } else {
          showToast('Ссылка временно недоступна', true);
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

  // -------------------- ФИЛЬТРЫ --------------------
  function applyFilters() {
    currentSearch = searchInput ? searchInput.value.trim() : '';
    currentGenre = genreFilter ? genreFilter.value : 'all';
    currentSort = sortSelect ? sortSelect.value : 'date';
    loadGames(1);
  }

  // -------------------- ПОПУЛЯРНЫЕ ИГРЫ --------------------
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

  // -------------------- WEBSOCKET --------------------
  function initSocket() {
    if (socket) socket.disconnect();
    socket = io();
    socket.on('connect', () => console.log('WebSocket готов'));
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

  // -------------------- ИНИЦИАЛИЗАЦИЯ --------------------
  function init() {
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (genreFilter) genreFilter.addEventListener('change', applyFilters);
    if (sortSelect) sortSelect.addEventListener('change', applyFilters);
    loadCurrentUser();
    loadGames(1);
    loadPopularGames();
    initSocket();
    setInterval(() => {
      triggerPeerUpdate();
      loadPopularGames();
    }, 60000);
  }

  init();
})();
