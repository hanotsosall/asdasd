// main.js - GoFrag style, без лишнего
(function() {
  let currentUser = null;
  let token = localStorage.getItem('token');
  let currentPage = 1;
  let currentSearch = '';
  let currentGenre = 'all';
  let currentSort = 'date';
  let totalPages = 1;
  let gamesData = [];

  const gamesGrid = document.getElementById('gamesGrid');
  const paginationDiv = document.getElementById('pagination');
  const searchInput = document.getElementById('searchInput');
  const genreFilter = document.getElementById('genreFilter');
  const sortSelect = document.getElementById('sortSelect');
  const popularList = document.getElementById('popularGamesList');

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m]));
  }

  function showToast(msg, isErr = false) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1e293b;color:#3b82f6;padding:10px 20px;border-radius:40px;z-index:9999;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(() => t.style.opacity = '0', 3000);
  }

  // Загрузка игр с сервера
  async function loadGames(page = 1) {
    currentPage = page;
    const params = new URLSearchParams({
      page: currentPage, limit: 12,
      search: currentSearch, genre: currentGenre, sort: currentSort
    });
    try {
      const res = await fetch(`/api/games?${params}`);
      const data = await res.json();
      gamesData = data.games;
      totalPages = data.totalPages;
      renderGames(gamesData);
      renderPagination();
      loadPopularGames();
    } catch (err) {
      showToast('Ошибка загрузки игр', true);
    }
  }

  // Рендер карточек (как на GoFrag)
  function renderGames(games) {
    if (!games.length) {
      gamesGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center;">Игры не найдены</div>';
      return;
    }
    gamesGrid.innerHTML = games.map(game => `
      <div class="game-card" data-id="${game.id}">
        <div class="card-img" style="background-image: url('${game.screenshots?.[0] || 'https://picsum.photos/id/0/300/140'}');"></div>
        <div class="card-content">
          <div class="game-title">${escapeHtml(game.title)}</div>
          <div class="genre">${escapeHtml(game.genre)}</div>
          <div class="details">
            <span>💾 ${game.size}</span>
            <span>⬆️ ${game.seeders}</span>
            <span>⭐ ${game.rating || '—'}</span>
          </div>
          <p class="game-short-desc">${escapeHtml(game.description.substring(0, 80))}…</p>
          <button class="download-btn" data-magnet="${escapeHtml(game.magnet)}">⬇️ Скачать торрент</button>
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
          showToast('Торрент добавлен в клиент');
        } else {
          showToast('Ссылка недоступна', true);
        }
      });
    });
  }

  function renderPagination() {
    if (totalPages <= 1) { paginationDiv.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    paginationDiv.innerHTML = html;
    document.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => loadGames(parseInt(btn.dataset.page)));
    });
  }

  // Популярные игры (топ-5 по скачиваниям)
  async function loadPopularGames() {
    try {
      const res = await fetch('/api/games?sort=downloads&limit=5');
      const data = await res.json();
      if (popularList) {
        popularList.innerHTML = data.games.map(g => `<li><a href="/game.html?id=${g.id}">${escapeHtml(g.title)}</a><span>${g.downloads}</span></li>`).join('');
      }
    } catch(e) {}
  }

  // Фильтры
  function applyFilters() {
    currentSearch = searchInput.value.trim();
    currentGenre = genreFilter.value;
    currentSort = sortSelect.value;
    loadGames(1);
  }

  searchInput.addEventListener('input', applyFilters);
  genreFilter.addEventListener('change', applyFilters);
  sortSelect.addEventListener('change', applyFilters);

  // Авторизация в шапке (показываем имя, если залогинен)
  async function loadUser() {
    if (!token) return;
    try {
      const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const user = await res.json();
        currentUser = user;
        const authDiv = document.getElementById('authButtons');
        if (authDiv) {
          authDiv.innerHTML = `<div class="user-menu" style="display:flex; align-items:center; gap:10px;">
            <span>${escapeHtml(user.username)}</span>
            <a href="/api/logout" id="logoutBtn" class="btn-outline" style="padding:4px 12px;">Выйти</a>
          </div>`;
          document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            window.location.reload();
          });
        }
      }
    } catch(e) {}
  }

  loadUser();
  loadGames();
})();
