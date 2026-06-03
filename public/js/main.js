// public/js/main.js - SteamFall 2.0 (650+ строк)
// Глобальное состояние
let currentUser = null;
let currentPage = 1;
let currentSearch = '';
let currentGenre = 'all';
let currentSort = 'date';
let gamesData = [];
let totalPages = 1;
let favoritesSet = new Set();
let statsChart = null;
let socket = null;

// DOM элементы
const gamesGrid = document.getElementById('gamesGrid');
const searchInput = document.getElementById('searchInput');
const genreFilter = document.getElementById('genreFilter');
const sortSelect = document.getElementById('sortSelect');
const paginationDiv = document.getElementById('pagination');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const userMenu = document.getElementById('userMenu');
const usernameSpan = document.getElementById('usernameSpan');
const logoutBtn = document.getElementById('logoutBtn');
const profileLink = document.getElementById('profileLink');
const favoritesLink = document.getElementById('favoritesLink');
const toastContainer = document.getElementById('toastContainer');
const statsCanvas = document.getElementById('statsChart');
const onlineCountSpan = document.getElementById('onlineCount');
const sidebarAd = document.getElementById('sidebarAd');
const infeedAd = document.getElementById('infeedAd');
const headerAd = document.getElementById('headerAd');

// Инициализация WebSocket
function initWebSocket() {
  socket = io();
  socket.on('peers-updated', (peers) => {
    // Обновляем сидеров/личеров в карточках без перезагрузки всей страницы
    peers.forEach(peer => {
      const card = document.querySelector(`.game-card[data-id="${peer.id}"]`);
      if (card) {
        const seedersSpan = card.querySelector('.seeders-count');
        const leechersSpan = card.querySelector('.leechers-count');
        if (seedersSpan) seedersSpan.textContent = peer.seeders;
        if (leechersSpan) leechersSpan.textContent = peer.leechers;
      }
    });
  });
  socket.on('chat-message', (msg) => {
    showToast(`💬 ${msg.author}: ${msg.text}`, 'info');
  });
}

// Утилиты
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span><button class="toast-close">&times;</button>`;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
  toast.querySelector('.toast-close').onclick = () => toast.remove();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Работа с токеном и пользователем
function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

function getUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}

function setUser(user) {
  if (user) localStorage.setItem('user', JSON.stringify(user));
  else localStorage.removeItem('user');
}

async function loadUserFromToken() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      setUser(currentUser);
      updateUserUI();
      await loadFavorites();
      return currentUser;
    } else {
      setToken(null);
      setUser(null);
      return null;
    }
  } catch (e) {
    console.error(e);
    return null;
  }
}

function updateUserUI() {
  if (currentUser) {
    loginBtn.classList.add('hidden');
    registerBtn.classList.add('hidden');
    userMenu.classList.remove('hidden');
    usernameSpan.textContent = currentUser.username;
    if (currentUser.role === 'admin') {
      const adminLink = document.createElement('a');
      adminLink.href = '/admin.html';
      adminLink.textContent = 'Админка';
      adminLink.className = 'admin-link';
      adminLink.target = '_blank';
      userMenu.appendChild(adminLink);
    }
  } else {
    loginBtn.classList.remove('hidden');
    registerBtn.classList.remove('hidden');
    userMenu.classList.add('hidden');
  }
}

// Авторизация (модальные окна)
function showLoginModal() {
  const modal = document.getElementById('loginModal');
  modal.classList.remove('hidden');
  document.getElementById('loginUsername').focus();
}
function showRegisterModal() {
  const modal = document.getElementById('registerModal');
  modal.classList.remove('hidden');
  document.getElementById('regUsername').focus();
}

async function login() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) {
    showToast('Заполните все поля', 'error');
    return;
  }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      setToken(data.token);
      setUser(data.user);
      currentUser = data.user;
      updateUserUI();
      closeModals();
      showToast(`Добро пожаловать, ${username}!`, 'success');
      await loadFavorites();
      loadGames(); // обновим избранное в карточках
    } else {
      showToast(data.error || 'Ошибка входа', 'error');
    }
  } catch (e) {
    showToast('Ошибка соединения', 'error');
  }
}

async function register() {
  const username = document.getElementById('regUsername').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const confirm = document.getElementById('regConfirm').value;
  if (!username || !email || !password || !confirm) {
    showToast('Заполните все поля', 'error');
    return;
  }
  if (password !== confirm) {
    showToast('Пароли не совпадают', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('Пароль минимум 6 символов', 'error');
    return;
  }
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (res.ok) {
      setToken(data.token);
      setUser(data.user);
      currentUser = data.user;
      updateUserUI();
      closeModals();
      showToast(`Регистрация успешна! Добро пожаловать, ${username}!`, 'success');
      loadGames();
    } else {
      showToast(data.error || data.errors?.[0]?.msg || 'Ошибка регистрации', 'error');
    }
  } catch (e) {
    showToast('Ошибка соединения', 'error');
  }
}

function logout() {
  setToken(null);
  setUser(null);
  currentUser = null;
  updateUserUI();
  showToast('Вы вышли из аккаунта', 'info');
  loadGames();
}

function closeModals() {
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('registerModal').classList.add('hidden');
}

// Избранное
async function loadFavorites() {
  if (!currentUser) return;
  const token = getToken();
  try {
    const res = await fetch('/api/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    favoritesSet.clear();
    data.favorites.forEach(fav => favoritesSet.add(fav.gameId));
    updateFavButtons();
  } catch (e) {
    console.error(e);
  }
}

async function toggleFavorite(gameId, button) {
  if (!currentUser) {
    showToast('Войдите, чтобы добавлять в избранное', 'warning');
    showLoginModal();
    return;
  }
  const token = getToken();
  const isFav = favoritesSet.has(gameId);
  try {
    if (isFav) {
      await fetch(`/api/favorites/${gameId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      favoritesSet.delete(gameId);
      showToast('Удалено из избранного', 'info');
    } else {
      await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ gameId })
      });
      favoritesSet.add(gameId);
      showToast('Добавлено в избранное', 'success');
    }
    updateFavButtons();
  } catch (e) {
    showToast('Ошибка', 'error');
  }
}

function updateFavButtons() {
  document.querySelectorAll('.fav-btn').forEach(btn => {
    const gameId = parseInt(btn.dataset.id);
    if (favoritesSet.has(gameId)) {
      btn.innerHTML = '❤️ В избранном';
      btn.classList.add('fav-active');
    } else {
      btn.innerHTML = '🤍 В избранное';
      btn.classList.remove('fav-active');
    }
  });
}

// Загрузка и отрисовка игр
async function loadGames() {
  const url = `/api/games?search=${encodeURIComponent(currentSearch)}&genre=${currentGenre}&sort=${currentSort}&page=${currentPage}&limit=12`;
  try {
    gamesGrid.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
    const res = await fetch(url);
    const data = await res.json();
    gamesData = data.games;
    totalPages = data.totalPages;
    renderGames();
    renderPagination();
  } catch (e) {
    gamesGrid.innerHTML = '<div class="error-message">Ошибка загрузки игр</div>';
    console.error(e);
  }
}

function renderGames() {
  if (!gamesData.length) {
    gamesGrid.innerHTML = '<div class="empty-state">🔍 Игры не найдены</div>';
    return;
  }
  gamesGrid.innerHTML = gamesData.map(game => `
    <div class="game-card" data-id="${game.id}">
      <div class="card-badge">${game.rating ? '⭐ ' + game.rating : '🆕'}</div>
      <img class="card-img" src="${game.screenshots?.[0] || 'https://picsum.photos/id/0/400/200'}" alt="${escapeHtml(game.title)}" loading="lazy">
      <div class="card-content">
        <h3 class="game-title">${escapeHtml(game.title)}</h3>
        <div class="game-meta">
          <span class="genre">${escapeHtml(game.genre)}</span>
          <span class="size">💾 ${game.size}</span>
        </div>
        <p class="game-description">${escapeHtml(game.description.substring(0, 100))}...</p>
        <div class="peers-info">
          <span>⬆️ <span class="seeders-count">${game.seeders}</span></span>
          <span>⬇️ <span class="leechers-count">${game.leechers}</span></span>
          <span>👁️ ${formatNumber(game.views || 0)}</span>
        </div>
        <div class="card-actions">
          <button class="magnet-btn" data-magnet="${escapeHtml(game.magnet)}">🧲 Скачать</button>
          <button class="fav-btn ${favoritesSet.has(game.id) ? 'fav-active' : ''}" data-id="${game.id}">${favoritesSet.has(game.id) ? '❤️ В избранном' : '🤍 В избранное'}</button>
        </div>
        <a href="/game.html?id=${game.id}" class="details-link">Подробнее →</a>
      </div>
    </div>
  `).join('');
  // Обработчики magnet и избранного
  document.querySelectorAll('.magnet-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const magnet = btn.dataset.magnet;
      if (magnet && magnet.startsWith('magnet:')) {
        window.open(magnet, '_blank');
        showToast('Magnet-ссылка скопирована', 'success');
      } else {
        showToast('Magnet-ссылка недействительна', 'error');
      }
    });
  });
  document.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gameId = parseInt(btn.dataset.id);
      toggleFavorite(gameId, btn);
    });
  });
}

function renderPagination() {
  if (totalPages <= 1) {
    paginationDiv.innerHTML = '';
    return;
  }
  let html = '';
  if (currentPage > 1) html += `<button class="page-btn" data-page="${currentPage-1}">←</button>`;
  for (let i = Math.max(1, currentPage-2); i <= Math.min(totalPages, currentPage+2); i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  if (currentPage < totalPages) html += `<button class="page-btn" data-page="${currentPage+1}">→</button>`;
  paginationDiv.innerHTML = html;
  document.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      loadGames();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// Статистика и графики
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('totalGames').textContent = stats.totalGames;
    document.getElementById('totalUsers').textContent = stats.totalUsers;
    document.getElementById('totalDownloads').textContent = formatNumber(stats.totalDownloads);
    document.getElementById('totalSeeders').textContent = formatNumber(stats.totalSeeders);
    onlineCountSpan.textContent = stats.totalSeeders;
    if (statsCanvas) {
      const ctx = statsCanvas.getContext('2d');
      if (statsChart) statsChart.destroy();
      statsChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: stats.topGames.map(g => g.title.substring(0, 15)),
          datasets: [{
            label: 'Скачивания',
            data: stats.topGames.map(g => g.downloads),
            backgroundColor: '#00E5FF',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#fff' } }
          },
          scales: {
            y: { ticks: { color: '#fff' }, grid: { color: '#1E2A3A' } },
            x: { ticks: { color: '#fff' } }
          }
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
}

// Загрузка рекламы
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
  } catch (e) {
    console.error(e);
  }
}

// Периодическое обновление пиров (раз в 30 сек)
async function updatePeers() {
  try {
    await fetch('/api/update-peers', { method: 'POST' });
  } catch (e) {}
}

// Инициализация слушателей
function initEventListeners() {
  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value;
    currentPage = 1;
    loadGames();
  });
  genreFilter.addEventListener('change', () => {
    currentGenre = genreFilter.value;
    currentPage = 1;
    loadGames();
  });
  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    currentPage = 1;
    loadGames();
  });
  loginBtn.onclick = showLoginModal;
  registerBtn.onclick = showRegisterModal;
  logoutBtn.onclick = logout;
  document.getElementById('loginSubmit').onclick = login;
  document.getElementById('registerSubmit').onclick = register;
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.onclick = closeModals;
  });
  window.onclick = (e) => {
    if (e.target.classList.contains('modal')) closeModals();
  };
}

// Основной запуск
async function init() {
  initEventListeners();
  initWebSocket();
  await loadUserFromToken();
  await loadAds();
  loadGames();
  loadStats();
  setInterval(updatePeers, 30000);
  setInterval(loadStats, 60000);
}

init();