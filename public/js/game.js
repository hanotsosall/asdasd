// public/js/game.js - SteamFall PRO
(function() {
  'use strict';

  let game = null;
  let reviews = [];
  let currentUser = null;
  let token = localStorage.getItem('token');
  let isFavorite = false;
  let socket = null;
  let gameId = null;

  const container = document.getElementById('gameContainer');
  const toast = document.getElementById('toast');

  function showToast(msg, isError = false) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.color = isError ? '#ef4444' : '#a78bfa';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
  }

  async function loadUser() {
    if (!token) return;
    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        currentUser = await res.json();
        updateAuthUI();
        await checkFavorite();
      } else {
        localStorage.removeItem('token');
        token = null;
        updateAuthUI();
      }
    } catch(e) {}
  }

  function updateAuthUI() {
    const authDiv = document.getElementById('authButtons');
    if (!authDiv) return;
    if (currentUser) {
      authDiv.innerHTML = `<div class="user-menu" style="display:flex; align-items:center; gap:12px;">
        <img src="${currentUser.avatar || 'https://i.pravatar.cc/32'}" style="width:32px; height:32px; border-radius:50%;">
        <span>${escapeHtml(currentUser.username)}</span>
        <button id="logoutBtnGame" class="btn-outline" style="padding:4px 12px;">Выйти</button>
      </div>`;
      document.getElementById('logoutBtnGame')?.addEventListener('click', () => {
        localStorage.removeItem('token');
        location.reload();
      });
    } else {
      authDiv.innerHTML = `<a href="/login.html" class="btn-outline">Войти</a><a href="/login.html?register=1" class="btn-primary">Регистрация</a>`;
    }
  }

  async function checkFavorite() {
    if (!currentUser || !gameId) return;
    try {
      const res = await fetch('/api/favorites', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const favs = await res.json();
        isFavorite = favs.some(f => f.gameId == gameId);
        const favBtn = document.getElementById('favoriteBtn');
        if (favBtn) {
          favBtn.innerHTML = isFavorite ? '<i class="fas fa-heart"></i> В избранном' : '<i class="far fa-heart"></i> В избранное';
          favBtn.classList.toggle('active', isFavorite);
        }
      }
    } catch(e) {}
  }

  async function toggleFavorite() {
    if (!currentUser) { showToast('Войдите, чтобы добавить в избранное', true); return; }
    try {
      const method = isFavorite ? 'DELETE' : 'POST';
      const res = await fetch(`/api/favorites/${gameId}`, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ gameId }) : undefined
      });
      if (res.ok) {
        isFavorite = !isFavorite;
        const favBtn = document.getElementById('favoriteBtn');
        if (favBtn) {
          favBtn.innerHTML = isFavorite ? '<i class="fas fa-heart"></i> В избранном' : '<i class="far fa-heart"></i> В избранное';
          favBtn.classList.toggle('active', isFavorite);
        }
        showToast(isFavorite ? 'Добавлено в избранное' : 'Удалено из избранного');
      }
    } catch(e) {}
  }

  async function loadGame() {
    const params = new URLSearchParams(window.location.search);
    gameId = params.get('id');
    if (!gameId) { container.innerHTML = '<div class="error">ID игры не указан</div>'; return; }
    try {
      const [gameRes, reviewsRes] = await Promise.all([
        fetch(`/api/games/${gameId}`),
        fetch(`/api/reviews/${gameId}`)
      ]);
      if (!gameRes.ok) throw new Error('Игра не найдена');
      game = await gameRes.json();
      reviews = await reviewsRes.json();
      renderGame();
      await checkFavorite();
      initSocket();
      loadSimilar();
    } catch(err) {
      container.innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  function renderGame() {
    const avgRating = reviews.length ? (reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1) : game.rating || '—';
    const screenshotsHtml = game.screenshots && game.screenshots.length ?
      `<div class="screenshots-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px,1fr)); gap:16px; margin:20px 0;">
        ${game.screenshots.map(url => `<div class="screenshot-item" style="border-radius:16px; overflow:hidden; cursor:pointer;"><img src="${url}" style="width:100%; height:140px; object-fit:cover;" onclick="window.openModal('${url}')"></div>`).join('')}
      </div>` : '<p>Нет скриншотов</p>';

    container.innerHTML = `
      <div class="game-detail" style="margin:40px 0;">
        <div style="display:flex; gap:40px; flex-wrap:wrap; background:var(--color-surface); backdrop-filter:var(--blur-glass); border-radius:var(--radius-xl); padding:30px; border:1px solid var(--color-border);">
          <div style="flex:1; min-width:200px;">
            <img src="${game.screenshots?.[0] || 'https://picsum.photos/id/0/400/300'}" style="width:100%; border-radius:20px;">
          </div>
          <div style="flex:2;">
            <h1 style="font-size:2rem; margin-bottom:16px;">${escapeHtml(game.title)}</h1>
            <div style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
              <span style="background:rgba(109,40,217,0.15); padding:4px 12px; border-radius:40px;">${escapeHtml(game.genre)}</span>
              <span style="background:rgba(109,40,217,0.15); padding:4px 12px; border-radius:40px;">${escapeHtml(game.developer || 'Unknown')}</span>
              <span style="background:rgba(109,40,217,0.15); padding:4px 12px; border-radius:40px;">${new Date(game.releaseDate).toLocaleDateString('ru-RU')}</span>
            </div>
            <div style="line-height:1.6; margin:20px 0;">${escapeHtml(game.description)}</div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:16px; background:rgba(0,0,0,0.2); padding:20px; border-radius:20px; margin:20px 0;">
              <div><strong>Размер</strong><br>${game.size}</div>
              <div><strong>Сидеры</strong><br><span id="seedersValue">${game.seeders}</span></div>
              <div><strong>Личеры</strong><br><span id="leechersValue">${game.leechers}</span></div>
              <div><strong>Рейтинг</strong><br>${avgRating} / 5</div>
              <div><strong>Скачиваний</strong><br>${(game.downloads||0).toLocaleString()}</div>
            </div>
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
              <button id="magnetBtn" class="btn-primary" style="padding:12px 28px;"><i class="fas fa-download"></i> Скачать торрент</button>
              <button id="favoriteBtn" class="btn-outline">${isFavorite ? '<i class="fas fa-heart"></i> В избранном' : '<i class="far fa-heart"></i> В избранное'}</button>
            </div>
          </div>
        </div>
        <div style="margin-top:40px;">
          <h2>Скриншоты</h2>
          ${screenshotsHtml}
        </div>
        <div style="margin-top:40px; background:var(--color-surface); backdrop-filter:var(--blur-glass); border-radius:var(--radius-xl); padding:24px;">
          <h2>Чат игры</h2>
          <div id="chatMessages" style="height:250px; overflow-y:auto; background:rgba(0,0,0,0.3); border-radius:16px; padding:16px; margin:16px 0;"></div>
          ${currentUser ? `<div style="display:flex; gap:12px;"><input type="text" id="chatInput" placeholder="Сообщение..." style="flex:1; padding:12px; background:rgba(0,0,0,0.4); border:1px solid var(--color-border); border-radius:40px; color:white;"><button id="sendChatBtn" class="btn-primary">Отправить</button></div>` : '<p>Войдите, чтобы участвовать в чате</p>'}
        </div>
        <div style="margin-top:40px;">
          <h2>Отзывы (${reviews.length})</h2>
          <div id="reviewsList"></div>
          ${currentUser ? `
          <div style="background:var(--color-surface); backdrop-filter:var(--blur-glass); border-radius:var(--radius-xl); padding:24px; margin-top:30px;">
            <h3>Оставить отзыв</h3>
            <select id="reviewRating" style="margin:10px 0; padding:8px; background:rgba(0,0,0,0.4); border-radius:40px; color:white;"><option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option></select>
            <textarea id="reviewText" rows="3" placeholder="Ваш отзыв..." style="width:100%; background:rgba(0,0,0,0.4); border:1px solid var(--color-border); border-radius:20px; padding:12px; color:white;"></textarea>
            <button id="submitReviewBtn" class="btn-primary" style="margin-top:12px;">Отправить</button>
          </div>` : '<p>Войдите, чтобы оставить отзыв</p>'}
        </div>
        <div style="margin-top:40px;">
          <h2>Похожие игры</h2>
          <div id="similarGamesGrid" class="games-grid" style="grid-template-columns:repeat(auto-fill, minmax(180px,1fr));"></div>
        </div>
      </div>
    `;
    document.getElementById('magnetBtn')?.addEventListener('click', () => { if(game.magnet) { window.open(game.magnet, '_blank'); showToast('Торрент запущен'); } else showToast('Ссылка отсутствует', true); });
    document.getElementById('favoriteBtn')?.addEventListener('click', toggleFavorite);
    document.getElementById('submitReviewBtn')?.addEventListener('click', submitReview);
    if(currentUser) {
      document.getElementById('sendChatBtn')?.addEventListener('click', sendChatMessage);
      document.getElementById('chatInput')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChatMessage(); });
    }
    renderReviews();
  }

  function renderReviews() {
    const revDiv = document.getElementById('reviewsList');
    if(!revDiv) return;
    if(!reviews.length) { revDiv.innerHTML = '<p>Пока нет отзывов. Будьте первым!</p>'; return; }
    revDiv.innerHTML = reviews.map(rev => `
      <div class="review-card" style="background:var(--color-surface); backdrop-filter:var(--blur-glass); border-radius:var(--radius-lg); padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; margin-bottom:8px;">
          <div><strong>${escapeHtml(rev.author)}</strong></div>
          <div>${'★'.repeat(rev.rating)}${'☆'.repeat(5-rev.rating)}</div>
        </div>
        <div>${escapeHtml(rev.text)}</div>
        <div style="margin-top:12px; display:flex; gap:16px;">
          <button class="like-btn" data-id="${rev.id}" style="background:none; border:none; color:var(--color-accent); cursor:pointer;">👍 ${rev.likes || 0}</button>
          <button class="comments-toggle" data-id="${rev.id}" style="background:none; border:none; color:var(--color-text-muted); cursor:pointer;">💬 Комментарии</button>
        </div>
        <div class="comments-section" id="comments-${rev.id}" style="margin-top:12px; padding-left:16px; border-left:2px solid var(--color-accent); display:none;"></div>
      </div>
    `).join('');
    document.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', () => likeReview(btn.dataset.id)));
    document.querySelectorAll('.comments-toggle').forEach(btn => btn.addEventListener('click', () => loadComments(btn.dataset.id)));
  }

  async function submitReview() {
    const rating = parseInt(document.getElementById('reviewRating').value);
    const text = document.getElementById('reviewText').value.trim();
    if(!text) { showToast('Введите текст', true); return; }
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ gameId: parseInt(gameId), text, rating })
      });
      if(res.ok) { showToast('Отзыв добавлен'); loadGame(); }
      else showToast('Ошибка', true);
    } catch(e) { showToast('Ошибка', true); }
  }

  async function likeReview(reviewId) {
    if(!currentUser) { showToast('Войдите', true); return; }
    try {
      const res = await fetch(`/api/reviews/${reviewId}/like`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if(res.ok) { const data = await res.json(); document.querySelector(`.like-btn[data-id="${reviewId}"]`).innerHTML = `👍 ${data.likes}`; }
    } catch(e) {}
  }

  async function loadComments(reviewId) {
    const div = document.getElementById(`comments-${reviewId}`);
    if(div.style.display === 'none' || !div.style.display) {
      div.style.display = 'block';
      const res = await fetch(`/api/comments/${reviewId}`);
      const comments = await res.json();
      div.innerHTML = comments.map(c => `<div style="margin:8px 0; padding:8px; background:rgba(0,0,0,0.3); border-radius:12px;"><strong>${escapeHtml(c.author)}</strong>: ${escapeHtml(c.text)}<br><small>${new Date(c.createdAt).toLocaleString()}</small></div>`).join('');
      if(currentUser) {
        div.innerHTML += `<div style="margin-top:12px;"><input type="text" id="newComment-${reviewId}" placeholder="Ваш комментарий" style="width:70%; padding:8px; background:rgba(0,0,0,0.4); border-radius:40px;"><button onclick="addComment(${reviewId})" class="btn-primary" style="padding:6px 16px;">→</button></div>`;
      }
    } else {
      div.style.display = 'none';
    }
  }
  window.addComment = async function(reviewId) {
    const input = document.getElementById(`newComment-${reviewId}`);
    const text = input?.value.trim();
    if(!text) return;
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ reviewId, text })
    });
    if(res.ok) { input.value = ''; loadComments(reviewId); showToast('Комментарий добавлен'); }
  };

  function initSocket() {
    if(socket) socket.disconnect();
    socket = io();
    socket.on('connect', () => socket.emit('join-game', gameId));
    socket.on('chat-message', (data) => addChatMessage(data.author, data.text, data.timestamp));
    socket.on('peers-updated', (peers) => {
      const peer = peers.find(p => p.id == gameId);
      if(peer) {
        document.getElementById('seedersValue').innerText = peer.seeders;
        document.getElementById('leechersValue').innerText = peer.leechers;
      }
    });
  }
  function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if(!text) return;
    socket.emit('chat-message', { gameId, author: currentUser?.username || 'Гость', text });
    input.value = '';
  }
  function addChatMessage(author, text, timestamp) {
    const msgs = document.getElementById('chatMessages');
    if(!msgs) return;
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<strong>${escapeHtml(author)}</strong> <small>${new Date(timestamp).toLocaleTimeString()}</small><br>${escapeHtml(text)}`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }
  async function loadSimilar() {
    const res = await fetch(`/api/games?genre=${encodeURIComponent(game.genre)}&limit=4`);
    const data = await res.json();
    const similar = data.games.filter(g => g.id != gameId);
    const grid = document.getElementById('similarGamesGrid');
    if(!grid) return;
    if(!similar.length) { grid.innerHTML = '<p>Нет похожих игр</p>'; return; }
    grid.innerHTML = similar.map(g => `
      <div style="background:var(--color-surface); border-radius:var(--radius-lg); overflow:hidden;">
        <img src="${g.screenshots?.[0] || 'https://picsum.photos/id/0/300/160'}" style="width:100%; height:120px; object-fit:cover;">
        <div style="padding:12px; text-align:center;"><a href="/game.html?id=${g.id}" style="color:var(--color-accent);">${escapeHtml(g.title)}</a><div>⭐ ${g.rating || '—'}</div></div>
      </div>
    `).join('');
  }
  window.openModal = (url) => { const modal = document.createElement('div'); modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:10000;cursor:pointer;'; modal.innerHTML = `<img src="${url}" style="max-width:90vw; max-height:90vh;">`; modal.onclick = () => modal.remove(); document.body.appendChild(modal); };

  loadUser().then(loadGame);
})();
