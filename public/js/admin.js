(function() {
    let token = localStorage.getItem('token');
    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
    async function authCheck() {
        if (!token) {
            const pwd = prompt('Пароль администратора:');
            if (pwd === 'admin123') {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: 'admin', password: 'admin123' })
                });
                const data = await res.json();
                if (res.ok) {
                    token = data.token;
                    localStorage.setItem('token', token);
                    showToast('Добро пожаловать в админку');
                    init();
                } else { alert('Неверный пароль'); location.href = '/'; }
            } else { location.href = '/'; }
        } else { init(); }
    }
    async function init() {
        loadStats();
        loadGames();
        loadUsers();
        loadAds();
        loadLogs();
        document.getElementById('addGameBtn')?.addEventListener('click', addGame);
        document.getElementById('importBtn')?.addEventListener('click', importGame);
        document.getElementById('saveAdsBtn')?.addEventListener('click', saveAds);
        document.getElementById('refreshLogsBtn')?.addEventListener('click', loadLogs);
        document.getElementById('gameSearch')?.addEventListener('input', loadGames);
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                document.getElementById(btn.dataset.tab).classList.add('active');
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
    async function loadStats() {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        document.getElementById('statGames').innerText = stats.totalGames;
        document.getElementById('statUsers').innerText = stats.totalUsers;
        document.getElementById('statDownloads').innerText = stats.totalDownloads?.toLocaleString() || '0';
    }
    async function loadGames() {
        const search = document.getElementById('gameSearch')?.value || '';
        const res = await fetch(`/api/games?limit=50&search=${encodeURIComponent(search)}`);
        const data = await res.json();
        const tbody = document.getElementById('gamesTableBody');
        tbody.innerHTML = data.games.map(game => `
            <tr><td>${game.id}</td><td>${escapeHtml(game.title)}</td><td>${game.genre}</td><td>${game.size}</td>
            <td><button class="delete-game" data-id="${game.id}">Удалить</button></td></tr>
        `).join('');
        document.querySelectorAll('.delete-game').forEach(btn => btn.addEventListener('click', () => deleteGame(btn.dataset.id)));
    }
    async function deleteGame(id) {
        if (!confirm('Удалить?')) return;
        const res = await fetch(`/api/games/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) { showToast('Игра удалена'); loadGames(); loadStats(); }
        else showToast('Ошибка');
    }
    async function addGame() {
        const game = {
            title: document.getElementById('gameTitle').value,
            genre: document.getElementById('gameGenre').value,
            description: document.getElementById('gameDesc').value,
            size: document.getElementById('gameSize').value,
            magnet: document.getElementById('gameMagnet').value,
            developer: document.getElementById('gameDeveloper').value,
            releaseDate: document.getElementById('gameReleaseDate').value,
            screenshots: document.getElementById('gameScreenshots').value.split(',').map(s=>s.trim()),
            tags: []
        };
        if (!game.title || !game.genre) return showToast('Заполните название и жанр');
        const res = await fetch('/api/games', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(game) });
        if (res.ok) { showToast('Игра добавлена'); loadGames(); loadStats(); }
        else showToast('Ошибка');
    }
    async function importGame() {
        const url = document.getElementById('importUrl').value;
        if (!url) return;
        const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ url }) });
        if (res.ok) {
            const data = await res.json();
            document.getElementById('gameTitle').value = data.title;
            document.getElementById('gameGenre').value = data.genre;
            document.getElementById('gameDesc').value = data.description;
            document.getElementById('gameSize').value = data.size;
            document.getElementById('gameMagnet').value = data.magnet;
            document.getElementById('gameDeveloper').value = data.developer;
            document.getElementById('gameReleaseDate').value = data.releaseDate;
            document.getElementById('gameScreenshots').value = data.screenshots.join(',');
            showToast('Данные импортированы');
        } else showToast('Ошибка импорта');
    }
    async function loadUsers() {
        const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } });
        const users = await res.json();
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = users.map(u => `
            <tr><td>${u.id}</td><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.email)}</td><td>${u.role}</td>
            <td>${u.banned ? 'Забанен' : 'Активен'}</td>
            <td>${!u.banned ? `<button class="ban-user" data-id="${u.id}">Бан</button>` : `<button class="unban-user" data-id="${u.id}">Разбан</button>`}</td></tr>
        `).join('');
        document.querySelectorAll('.ban-user').forEach(btn => btn.addEventListener('click', () => banUser(btn.dataset.id)));
        document.querySelectorAll('.unban-user').forEach(btn => btn.addEventListener('click', () => unbanUser(btn.dataset.id)));
    }
    async function banUser(id) { await fetch(`/api/admin/users/${id}/ban`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); loadUsers(); }
    async function unbanUser(id) { await fetch(`/api/admin/users/${id}/unban`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); loadUsers(); }
    async function loadAds() {
        const res = await fetch('/api/ads');
        const ads = await res.json();
        const editor = document.getElementById('adsEditor');
        editor.innerHTML = ads.map(ad => `<div class="ad-block"><b>${ad.position}</b><textarea class="ad-code" data-id="${ad.id}" rows="3">${escapeHtml(ad.code)}</textarea><label><input type="checkbox" class="ad-active" data-id="${ad.id}" ${ad.active ? 'checked' : ''}> Активен</label></div>`).join('');
    }
    async function saveAds() {
        const ads = [];
        document.querySelectorAll('.ad-code').forEach(ta => {
            const id = parseInt(ta.dataset.id);
            const code = ta.value;
            const active = document.querySelector(`.ad-active[data-id="${id}"]`).checked;
            const position = ta.closest('.ad-block').querySelector('b').innerText;
            ads.push({ id, position, code, active });
        });
        const res = await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(ads) });
        if (res.ok) showToast('Реклама сохранена');
        else showToast('Ошибка');
    }
    async function loadLogs() {
        const res = await fetch('/api/logs', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        document.getElementById('logsContent').innerHTML = data.logs?.map(l => `<div>${escapeHtml(l)}</div>`).join('') || 'Нет логов';
    }
    function escapeHtml(str) { return String(str).replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }
    authCheck();
})();
