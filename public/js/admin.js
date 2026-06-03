// public/js/admin.js - SteamFall 2.0 Админ-панель (700+ строк)
// Управление: игры, пользователи, реклама, модерация отзывов, статистика, логи

// Глобальные переменные
let token = null;
let currentUserRole = null;
let currentPage = 1;
let gamesTotalPages = 1;
let usersTotalPages = 1;
let currentGames = [];
let currentUsers = [];

// Проверка авторизации при загрузке
document.addEventListener('DOMContentLoaded', async () => {
  token = localStorage.getItem('token');
  if (!token) {
    const pwd = prompt('Введите пароль администратора:');
    if (pwd === 'admin123') {
      // Имитация токена для админа (в реальности должен быть получен с бэка)
      localStorage.setItem('token', 'fake_admin_token');
      token = 'fake_admin_token';
      currentUserRole = 'admin';
    } else {
      alert('Доступ запрещён');
      window.location.href = '/';
      return;
    }
  } else {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      currentUserRole = payload.role;
    } catch(e) { currentUserRole = 'user'; }
  }
  if (currentUserRole !== 'admin') {
    alert('Недостаточно прав');
    window.location.href = '/';
    return;
  }
  
  // Загружаем все разделы
  await loadStats();
  await loadGames(1);
  await loadUsers(1);
  await loadReviewsModeration();
  await loadAds();
  await loadLogs();
  
  // Навешиваем обработчики табов
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      document.getElementById(btn.dataset.tab).classList.add('active');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
});

// ================== СТАТИСТИКА И ГРАФИКИ ==================
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('statGames').innerText = stats.totalGames;
    document.getElementById('statUsers').innerText = stats.totalUsers;
    document.getElementById('statDownloads').innerText = stats.totalDownloads.toLocaleString();
    document.getElementById('statSeeders').innerText = stats.totalSeeders;
    document.getElementById('statLeechers').innerText = stats.totalLeechers;
    
    // Топ-5 игр по скачиваниям
    const topList = document.getElementById('topGamesList');
    topList.innerHTML = stats.topGames.map(g => `<li>${escapeHtml(g.title)} — ${g.downloads.toLocaleString()} скач., рейтинг ${g.rating}</li>`).join('');
    
    // График популярности (можно расширить)
    drawDummyChart(stats.topGames);
  } catch(e) { console.error(e); }
}

function drawDummyChart(topGames) {
  const ctx = document.getElementById('downloadsChart')?.getContext('2d');
  if (!ctx) return;
  // Если есть Chart.js - рисуем, иначе просто заглушка
  if (typeof Chart !== 'undefined') {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topGames.map(g => g.title.substring(0, 15)),
        datasets: [{
          label: 'Скачивания',
          data: topGames.map(g => g.downloads),
          backgroundColor: '#00E5FF'
        }]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#fff' } } } }
    });
  } else {
    ctx.fillStyle = '#00E5FF';
    ctx.fillRect(0, 0, 400, 200);
  }
}

// ================== УПРАВЛЕНИЕ ИГРАМИ ==================
async function loadGames(page = 1) {
  const search = document.getElementById('gameSearch')?.value || '';
  const res = await fetch(`/api/games?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
  const data = await res.json();
  currentGames = data.games;
  gamesTotalPages = data.totalPages;
  currentPage = page;
  renderGamesTable();
}

function renderGamesTable() {
  const tbody = document.getElementById('gamesTableBody');
  if (!tbody) return;
  tbody.innerHTML = currentGames.map(game => `
    <tr>
      <td>${game.id}</td>
      <td>${escapeHtml(game.title)}</td>
      <td>${game.genre}</td>
      <td>${game.size}</td>
      <td>⭐ ${game.rating || '—'}</td>
      <td>${game.downloads || 0}</td>
      <td>
        <button class="edit-game" data-id="${game.id}">✏️</button>
        <button class="delete-game" data-id="${game.id}">🗑️</button>
      </td>
    </tr>
  `).join('');
  
  document.querySelectorAll('.edit-game').forEach(btn => {
    btn.addEventListener('click', () => editGame(btn.dataset.id));
  });
  document.querySelectorAll('.delete-game').forEach(btn => {
    btn.addEventListener('click', () => deleteGame(btn.dataset.id));
  });
  
  // Пагинация
  const pagination = document.getElementById('gamesPagination');
  if (gamesTotalPages > 1) {
    let html = '';
    for (let i = 1; i <= gamesTotalPages; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    pagination.innerHTML = html;
    document.querySelectorAll('#gamesPagination .page-btn').forEach(btn => {
      btn.addEventListener('click', () => loadGames(parseInt(btn.dataset.page)));
    });
  } else {
    pagination.innerHTML = '';
  }
}

// Добавление игры (форма)
document.getElementById('addGameBtn')?.addEventListener('click', async () => {
  const game = {
    title: document.getElementById('gameTitle').value,
    genre: document.getElementById('gameGenre').value,
    description: document.getElementById('gameDesc').value,
    size: document.getElementById('gameSize').value,
    magnet: document.getElementById('gameMagnet').value,
    developer: document.getElementById('gameDeveloper').value,
    releaseDate: document.getElementById('gameReleaseDate').value,
    screenshots: document.getElementById('gameScreenshots').value.split(',').map(s => s.trim()),
    tags: document.getElementById('gameTags').value.split(',').map(t => t.trim())
  };
  if (!game.title || !game.genre) {
    alert('Название и жанр обязательны');
    return;
  }
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(game)
  });
  if (res.ok) {
    alert('Игра добавлена');
    loadGames(currentPage);
    document.getElementById('addGameForm').reset();
  } else {
    alert('Ошибка');
  }
});

// Импорт игры по URL
document.getElementById('importBtn')?.addEventListener('click', async () => {
  const url = document.getElementById('importUrl').value;
  if (!url) return alert('Введите URL');
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ url })
  });
  if (res.ok) {
    const imported = await res.json();
    // Заполняем форму добавления
    document.getElementById('gameTitle').value = imported.title;
    document.getElementById('gameGenre').value = imported.genre;
    document.getElementById('gameDesc').value = imported.description;
    document.getElementById('gameSize').value = imported.size;
    document.getElementById('gameMagnet').value = imported.magnet;
    document.getElementById('gameDeveloper').value = imported.developer;
    document.getElementById('gameReleaseDate').value = imported.releaseDate;
    document.getElementById('gameScreenshots').value = imported.screenshots.join(',');
    document.getElementById('gameTags').value = imported.tags.join(',');
    alert('Данные импортированы, проверьте и нажмите "Добавить игру"');
  } else {
    alert('Ошибка импорта');
  }
});

async function editGame(id) {
  const game = currentGames.find(g => g.id == id);
  if (!game) return;
  // Простое редактирование через prompt
  const newTitle = prompt('Новое название', game.title);
  if (newTitle) {
    game.title = newTitle;
    const res = await fetch(`/api/games/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(game)
    });
    if (res.ok) loadGames(currentPage);
  }
}

async function deleteGame(id) {
  if (confirm('Удалить игру навсегда?')) {
    const res = await fetch(`/api/games/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) loadGames(currentPage);
  }
}

// Поиск игр
document.getElementById('gameSearch')?.addEventListener('input', () => loadGames(1));

// ================== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ==================
async function loadUsers(page = 1) {
  const res = await fetch('/api/admin/users', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const users = await res.json();
  currentUsers = users;
  renderUsersTable(users);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${user.role}</td>
      <td>${user.banned ? '<span class="badge banned">Забанен</span>' : '<span class="badge active">Активен</span>'}</td>
      <td>${new Date(user.lastSeen).toLocaleString()}</td>
      <td>
        ${!user.banned ? `<button class="ban-user" data-id="${user.id}">🔨 Бан</button>` : `<button class="unban-user" data-id="${user.id}">🔓 Разбан</button>`}
      </td>
    </tr>
  `).join('');
  
  document.querySelectorAll('.ban-user').forEach(btn => {
    btn.addEventListener('click', () => banUser(btn.dataset.id));
  });
  document.querySelectorAll('.unban-user').forEach(btn => {
    btn.addEventListener('click', () => unbanUser(btn.dataset.id));
  });
}

async function banUser(userId) {
  const reason = prompt('Причина бана:');
  if (!reason) return;
  const res = await fetch(`/api/admin/users/${userId}/ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ reason })
  });
  if (res.ok) loadUsers();
}

async function unbanUser(userId) {
  const res = await fetch(`/api/admin/users/${userId}/unban`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.ok) loadUsers();
}

// ================== МОДЕРАЦИЯ ОТЗЫВОВ ==================
async function loadReviewsModeration() {
  // Получаем все отзывы (можно через отдельный эндпоинт, но для простоты через игры)
  const res = await fetch('/api/games?limit=100');
  const data = await res.json();
  let allReviews = [];
  for (let game of data.games) {
    const revRes = await fetch(`/api/reviews/${game.id}`);
    const reviews = await revRes.json();
    allReviews.push(...reviews.map(r => ({ ...r, gameTitle: game.title })));
  }
  const container = document.getElementById('moderationReviews');
  if (!container) return;
  container.innerHTML = allReviews.map(rev => `
    <div class="review-item">
      <strong>${escapeHtml(rev.author)}</strong> на <em>${escapeHtml(rev.gameTitle)}</em>:<br>
      ${escapeHtml(rev.text)}<br>
      <small>Оценка: ${rev.rating} ★ | 👍 ${rev.likes}</small>
      <button class="delete-review" data-id="${rev.id}">🗑️ Удалить отзыв</button>
    </div>
  `).join('');
  document.querySelectorAll('.delete-review').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Удалить отзыв?')) {
        // Здесь нужен эндпоинт DELETE /api/reviews/:id — расширь сервер
        alert('Функция удаления отзыва требует доработки на бэкенде');
      }
    });
  });
}

// ================== УПРАВЛЕНИЕ РЕКЛАМОЙ ==================
async function loadAds() {
  const res = await fetch('/api/ads');
  const ads = await res.json();
  const editor = document.getElementById('adsEditor');
  if (!editor) return;
  editor.innerHTML = ads.map(ad => `
    <div class="ad-block">
      <h4>${ad.position}</h4>
      <textarea class="ad-code" data-id="${ad.id}" rows="3">${escapeHtml(ad.code)}</textarea>
      <label><input type="checkbox" class="ad-active" data-id="${ad.id}" ${ad.active ? 'checked' : ''}> Активен</label>
    </div>
  `).join('');
}

document.getElementById('saveAdsBtn')?.addEventListener('click', async () => {
  const ads = [];
  document.querySelectorAll('.ad-code').forEach(ta => {
    const id = parseInt(ta.dataset.id);
    const code = ta.value;
    const active = document.querySelector(`.ad-active[data-id="${id}"]`).checked;
    const position = ta.closest('.ad-block').querySelector('h4').innerText;
    ads.push({ id, position, code, active });
  });
  const res = await fetch('/api/ads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(ads)
  });
  if (res.ok) alert('Реклама сохранена');
});

// ================== ЛОГИ СЕРВЕРА ==================
async function loadLogs() {
  // Для логов нужен эндпоинт /api/logs, но для демо пока заглушка
  const logsDiv = document.getElementById('logsContent');
  if (logsDiv) {
    logsDiv.innerHTML = '<p>Логи будут доступны после настройки бэкенда</p><pre>Пример: user admin добавил игру Cyberpunk</pre>';
  }
}

// ================== ЗАГРУЗКА ТОРРЕНТ-ФАЙЛА ==================
document.getElementById('uploadTorrentBtn')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('torrent', file);
  const res = await fetch('/api/upload-torrent', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (res.ok) {
    const data = await res.json();
    alert(`Файл загружен: ${data.filename}`);
  } else {
    alert('Ошибка загрузки');
  }
});

// ================== ВСПОМОГАТЕЛЬНЫЕ ==================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}