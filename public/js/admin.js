// public/js/admin.js - SteamFall ULTIMATE Админ-панель
(function() {
  let token = localStorage.getItem('token');
  let currentUser = null;
  let currentGamesPage = 1;
  let totalGamesPages = 1;
  let gamesData = [];
  let statsChart = null;

  // DOM элементы
  const tabs = document.querySelectorAll('.tab-btn');
  const panes = document.querySelectorAll('.tab-pane');
  const gamesTableBody = document.getElementById('gamesTableBody');
  const usersTableBody = document.getElementById('usersTableBody');
  const adminGameSearch = document.getElementById('adminGameSearch');
  const gamesPagination = document.getElementById('gamesPagination');
  const statsGrid = document.getElementById('statsGrid');
  const adminTopGamesList = document.getElementById('adminTopGamesList');
  const logsContent = document.getElementById('logsContent');
  const toast = document.getElementById('toast');

  // ====================== ВСПОМОГАТЕЛЬНЫЕ ======================

const token = localStorage.getItem('token');
if (!token) {
  const pwd = prompt('Пароль администратора:');
  if (pwd === 'admin123') {
    // Имитация токена – в реальном проекте получи с бэка
    localStorage.setItem('token', 'fake_admin_token');
  } else location.href = '/';
}
  
  function showToast(msg, isError = false) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.color = isError ? '#FF6B6B' : '#00E5FF';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
  }

  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  // ====================== АВТОРИЗАЦИЯ (проверка админа) ======================
  async function checkAdmin() {
    if (!token) {
      const pwd = prompt('Введите пароль администратора:');
      if (pwd === 'admin123') {
        // эмуляция токена для админа (в реальности получили бы с бэка)
        localStorage.setItem('token', 'fake_admin_token');
        token = 'fake_admin_token';
        currentUser = { username: 'admin', role: 'admin' };
      } else {
        alert('Доступ запрещён');
        window.location.href = '/';
        return false;
      }
    } else {
      try {
        const res = await fetch('/api/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          currentUser = await res.json();
          if (currentUser.role !== 'admin') {
            alert('Недостаточно прав');
            window.location.href = '/';
            return false;
          }
        } else {
          throw new Error();
        }
      } catch (err) {
        localStorage.removeItem('token');
        token = null;
        window.location.href = '/';
        return false;
      }
    }
    return true;
  }

  // ====================== ТАБЫ ======================
  function initTabs() {
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        tabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panes.forEach(pane => pane.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
      });
    });
  }

  // ====================== СТАТИСТИКА И ГРАФИКИ ======================
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      const stats = await res.json();
      document.getElementById('statGames').innerText = stats.totalGames;
      document.getElementById('statUsers').innerText = stats.totalUsers;
      document.getElementById('statDownloads').innerText = formatNumber(stats.totalDownloads);
      document.getElementById('statSeeders').innerText = formatNumber(stats.totalSeeders);
      if (adminTopGamesList) {
        adminTopGamesList.innerHTML = stats.topGames.map(g => `
          <li><strong>${escapeHtml(g.title)}</strong> — ${formatNumber(g.downloads)} скачиваний, рейтинг ${g.rating}</li>
        `).join('');
      }
      // график
      const ctx = document.getElementById('adminChart')?.getContext('2d');
      if (ctx && stats.topGames.length) {
        if (statsChart) statsChart.destroy();
        statsChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: stats.topGames.map(g => g.title.length > 15 ? g.title.slice(0,12)+'…' : g.title),
            datasets: [{
              label: 'Скачивания',
              data: stats.topGames.map(g => g.downloads),
              backgroundColor: '#00E5FF',
              borderRadius: 10
            }]
          },
          options: { responsive: true, maintainAspectRatio: true }
        });
      }
    } catch (err) {
      console.error('Ошибка загрузки статистики', err);
    }
  }

  // ====================== УПРАВЛЕНИЕ ИГРАМИ ======================
  async function loadGames(page = 1) {
    const search = adminGameSearch?.value || '';
    try {
      const res = await fetch(`/api/games?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      gamesData = data.games;
      totalGamesPages = data.totalPages;
      currentGamesPage = page;
      renderGamesTable();
      renderGamesPagination();
    } catch (err) {
      showToast('Ошибка загрузки игр', true);
    }
  }

  function renderGamesTable() {
    if (!gamesTableBody) return;
    gamesTableBody.innerHTML = gamesData.map(game => `
      <tr>
        <td>${game.id}</td>
        <td>${escapeHtml(game.title)}</td>
        <td>${escapeHtml(game.genre)}</td>
        <td>${game.size}</td>
        <td>⭐ ${game.rating || '—'}</td>
        <td>
          <button class="edit-game" data-id="${game.id}"><i class="fas fa-edit"></i> Edit</button>
          <button class="delete-game" data-id="${game.id}"><i class="fas fa-trash"></i> Del</button>
        </td>
      </tr>
    `).join('');
    document.querySelectorAll('.edit-game').forEach(btn => {
      btn.addEventListener('click', () => editGame(btn.dataset.id));
    });
    document.querySelectorAll('.delete-game').forEach(btn => {
      btn.addEventListener('click', () => deleteGame(btn.dataset.id));
    });
  }

  function renderGamesPagination() {
    if (!gamesPagination) return;
    if (totalGamesPages <= 1) {
      gamesPagination.innerHTML = '';
      return;
    }
    let html = '';
    for (let i = 1; i <= totalGamesPages; i++) {
      html += `<button class="page-btn ${i === currentGamesPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    gamesPagination.innerHTML = html;
    document.querySelectorAll('#gamesPagination .page-btn').forEach(btn => {
      btn.addEventListener('click', () => loadGames(parseInt(btn.dataset.page)));
    });
  }

  async function editGame(id) {
    const game = gamesData.find(g => g.id == id);
    if (!game) return;
    const newTitle = prompt('Новое название', game.title);
    if (!newTitle) return;
    const newGenre = prompt('Новый жанр', game.genre);
    try {
      const updated = { ...game, title: newTitle, genre: newGenre };
      const res = await fetch(`/api/games/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        showToast('Игра обновлена');
        loadGames(currentGamesPage);
      } else {
        showToast('Ошибка обновления', true);
      }
    } catch (err) {}
  }

  async function deleteGame(id) {
    if (!confirm('Удалить игру навсегда?')) return;
    try {
      const res = await fetch(`/api/games/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Игра удалена');
        loadGames(currentGamesPage);
      } else {
        showToast('Ошибка удаления', true);
      }
    } catch (err) {}
  }

  // Добавление игры
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
      showToast('Название и жанр обязательны', true);
      return;
    }
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(game)
      });
      if (res.ok) {
        showToast('Игра добавлена');
        loadGames(1);
        document.getElementById('addGameForm')?.reset();
      } else {
        showToast('Ошибка добавления', true);
      }
    } catch (err) {}
  });

  // Импорт
  document.getElementById('importBtn')?.addEventListener('click', async () => {
    const url = document.getElementById('importUrl').value;
    if (!url) {
      showToast('Введите URL', true);
      return;
    }
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        const imported = await res.json();
        document.getElementById('gameTitle').value = imported.title;
        document.getElementById('gameGenre').value = imported.genre;
        document.getElementById('gameDesc').value = imported.description;
        document.getElementById('gameSize').value = imported.size;
        document.getElementById('gameMagnet').value = imported.magnet;
        document.getElementById('gameDeveloper').value = imported.developer;
        document.getElementById('gameReleaseDate').value = imported.releaseDate;
        document.getElementById('gameScreenshots').value = imported.screenshots.join(',');
        document.getElementById('gameTags').value = imported.tags.join(',');
        showToast('Данные импортированы, проверьте и нажмите "Добавить"');
      } else {
        showToast('Ошибка импорта', true);
      }
    } catch (err) {}
  });

  // Загрузка торрент-файла
  document.getElementById('uploadTorrent')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('torrent', file);
    try {
      const res = await fetch('/api/upload-torrent', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`Файл загружен: ${data.filename}`);
      } else {
        showToast('Ошибка загрузки', true);
      }
    } catch (err) {}
  });

  // ====================== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ======================
  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const users = await res.json();
      renderUsersTable(users);
    } catch (err) {
      showToast('Ошибка загрузки пользователей', true);
    }
  }

  function renderUsersTable(users) {
    if (!usersTableBody) return;
    usersTableBody.innerHTML = users.map(user => `
      <tr>
        <td>${user.id}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${user.role}</td>
        <td><span class="badge ${user.banned ? 'badge-banned' : 'badge-active'}">${user.banned ? 'Забанен' : 'Активен'}</span></td>
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
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        showToast('Пользователь забанен');
        loadUsers();
      } else {
        showToast('Ошибка', true);
      }
    } catch (err) {}
  }

  async function unbanUser(userId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/unban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Пользователь разбанен');
        loadUsers();
      } else {
        showToast('Ошибка', true);
      }
    } catch (err) {}
  }

  // ====================== МОДЕРАЦИЯ ОТЗЫВОВ ======================
  async function loadReviewsModeration() {
    try {
      const res = await fetch('/api/games?limit=100');
      const data = await res.json();
      let allReviews = [];
      for (let game of data.games) {
        const revRes = await fetch(`/api/reviews/${game.id}`);
        const reviews = await revRes.json();
        allReviews.push(...reviews.map(r => ({ ...r, gameTitle: game.title })));
      }
      const container = document.getElementById('reviewsModerationList');
      if (!container) return;
      container.innerHTML = allReviews.map(rev => `
        <div class="review-item" style="background:#0F172A; padding:16px; border-radius:20px; margin-bottom:16px;">
          <strong>${escapeHtml(rev.author)}</strong> на <em>${escapeHtml(rev.gameTitle)}</em><br>
          Оценка: ${'★'.repeat(rev.rating)} (${rev.rating})<br>
          "${escapeHtml(rev.text)}"<br>
          <small>👍 ${rev.likes || 0} | ${new Date(rev.createdAt).toLocaleString()}</small><br>
          <button class="delete-review" data-id="${rev.id}">🗑️ Удалить отзыв</button>
        </div>
      `).join('');
      document.querySelectorAll('.delete-review').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Удалить отзыв?')) {
            // нужен эндпоинт DELETE /api/reviews/:id
            showToast('Функция удаления отзыва требует доработки бэкенда');
          }
        });
      });
    } catch (err) {}
  }

  // ====================== РЕКЛАМА ======================
  async function loadAds() {
    try {
      const res = await fetch('/api/ads');
      const ads = await res.json();
      const editor = document.getElementById('adsEditor');
      if (!editor) return;
      editor.innerHTML = ads.map(ad => `
        <div class="ad-block">
          <h4>${ad.position}</h4>
          <textarea class="ad-code" data-id="${ad.id}" rows="3" style="width:100%; background:#1F2A3A; border:none; padding:12px; border-radius:16px; color:white;">${escapeHtml(ad.code)}</textarea>
          <label><input type="checkbox" class="ad-active" data-id="${ad.id}" ${ad.active ? 'checked' : ''}> Активен</label>
        </div>
      `).join('');
    } catch (err) {}
  }

  document.getElementById('saveAdsBtn')?.addEventListener('click', async () => {
    const ads = [];
    document.querySelectorAll('.ad-block').forEach(block => {
      const textarea = block.querySelector('.ad-code');
      const checkbox = block.querySelector('.ad-active');
      const id = parseInt(textarea.dataset.id);
      const code = textarea.value;
      const active = checkbox.checked;
      const position = block.querySelector('h4').innerText;
      ads.push({ id, position, code, active });
    });
    try {
      const res = await fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(ads)
      });
      if (res.ok) {
        showToast('Реклама сохранена');
      } else {
        showToast('Ошибка сохранения', true);
      }
    } catch (err) {}
  });

  // ====================== ЛОГИ ======================
  async function loadLogs() {
    try {
      const res = await fetch('/api/logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (logsContent) logsContent.innerText = data.logs.join('\n');
      } else {
        logsContent.innerText = 'Нет доступа к логам или они не настроены';
      }
    } catch (err) {
      logsContent.innerText = 'Ошибка загрузки логов';
    }
  }

  document.getElementById('refreshLogsBtn')?.addEventListener('click', loadLogs);

  // ====================== ПОИСК ИГР В АДМИНКЕ ======================
  adminGameSearch?.addEventListener('input', () => loadGames(1));

  // ====================== ЗАПУСК ======================
  async function init() {
    const isAdmin = await checkAdmin();
    if (!isAdmin) return;
    initTabs();
    await loadStats();
    await loadGames(1);
    await loadUsers();
    await loadReviewsModeration();
    await loadAds();
    await loadLogs();
    setInterval(loadStats, 60000);
  }

  init();
})();
