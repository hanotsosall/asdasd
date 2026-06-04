// ============================================================================
// SteamFall ULTIMATE — страница игры (анимации, отзывы, чат, избранное)
// Полная логика: загрузка игры, отзывы с лайками, комментарии, WebSocket чат,
// избранное, похожие игры, анимации при загрузке
// Объём: 850+ строк
// ============================================================================

(function() {
  'use strict';

  // ------------------------------ ПЕРЕМЕННЫЕ ------------------------------
  let game = null;
  let reviews = [];
  let currentUser = null;
  let token = localStorage.getItem('token');
  let isFavorite = false;
  let socket = null;
  let gameId = null;

  const container = document.getElementById('gameContainer');
  const toast = document.getElementById('toast');

  // ------------------------------ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ------------------------------
  function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.style.color = isError ? '#ef4444' : '#3b82f6';
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
    return num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") || '0';
  }

  // Анимация появления элементов
  function animatePageElements() {
    if (typeof anime !== 'undefined') {
      anime({
        targets: '.game-header, .screenshots-section, .chat-section, .reviews-section',
        opacity: [0, 1],
        translateY: [20, 0],
        delay: anime.stagger(100),
        duration: 600,
        easing: 'easeOutCubic'
      });
    }
  }

  // ------------------------------ АВТОРИЗАЦИЯ (для шапки) ------------------------------
  async function loadCurrentUser() {
    if (!token) return;
    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        currentUser = await res.json();
        updateHeaderUI();
        await checkFavorite();
      } else {
        token = null;
        localStorage.removeItem('token');
      }
    } catch (err) {}
  }

  function updateHeaderUI() {
    const headerActions = document.querySelector('.nav-links');
    if (!headerActions) return;
    if (currentUser) {
      // Добавляем ссылку на профиль и кнопку выхода
      const existing = document.querySelector('.user-menu-header');
      if (!existing) {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-menu-header';
        userDiv.style.display = 'flex';
        userDiv.style.alignItems = 'center';
        userDiv.style.gap = '12px';
        userDiv.style.marginLeft = '20px';
        userDiv.innerHTML = `
          <img src="${currentUser.avatar || 'https://i.pravatar.cc/32'}" style="width:32px; height:32px; border-radius:50%;">
          <span>${escapeHtml(currentUser.username)}</span>
          <button id="logoutBtnGame" class="btn-outline" style="padding:4px 12px;">Выйти</button>
        `;
        headerActions.appendChild(userDiv);
        document.getElementById('logoutBtnGame')?.addEventListener('click', logout);
      }
    } else {
      const existing = document.querySelector('.user-menu-header');
      if (existing) existing.remove();
    }
  }

  async function logout() {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    updateHeaderUI();
    showToast('Вы вышли из аккаунта');
    await loadGameData(); // перезагружаем страницу, чтобы убрать формы отзывов/чата
  }

  // ------------------------------ ИЗБРАННОЕ ------------------------------
  async function checkFavorite() {
    if (!currentUser || !gameId) return false;
    try {
      const res = await fetch('/api/favorites', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const favs = await res.json();
        isFavorite = favs.some(f => f.gameId == gameId);
        const favBtn = document.getElementById('favoriteBtn');
        if (favBtn) {
          favBtn.innerHTML = isFavorite ? '<i class="fas fa-heart"></i> В избранном' : '<i class="far fa-heart"></i> В избранное';
          favBtn.classList.toggle('active', isFavorite);
        }
        return isFavorite;
      }
    } catch (err) {}
    return false;
  }

  async function toggleFavorite() {
    if (!currentUser) {
      showToast('Войдите, чтобы добавить в избранное', true);
      return;
    }
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
    } catch (err) {
      showToast('Ошибка', true);
    }
  }

  // ------------------------------ ЗАГРУЗКА ДАННЫХ ИГРЫ ------------------------------
  async function loadGameData() {
    const urlParams = new URLSearchParams(window.location.search);
    gameId = urlParams.get('id');
    if (!gameId) {
      container.innerHTML = '<div class="error">❌ ID игры не указан</div>';
      return;
    }
    try {
      const [gameRes, reviewsRes] = await Promise.all([
        fetch(`/api/games/${gameId}`),
        fetch(`/api/reviews/${gameId}`)
      ]);
      if (!gameRes.ok) throw new Error('Игра не найдена');
      game = await gameRes.json();
      reviews = await reviewsRes.json();
      document.title = `${game.title} | SteamFall`;
      renderGamePage();
      await checkFavorite();
      initSocket();
      loadSimilarGames();
      animatePageElements();
    } catch (err) {
      container.innerHTML = `<div class="error">⚠️ ${err.message}</div>`;
    }
  }

  // ------------------------------ ОТРИСОВКА СТРАНИЦЫ ------------------------------
  function renderGamePage() {
    const avgRating = reviews.length ? (reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1) : game.rating || '—';
    const screenshotsHtml = game.screenshots && game.screenshots.length ?
      `<div class="screenshots-grid">
        ${game.screenshots.map(url => `<div class="screenshot-item" onclick="window.openModal('${url}')"><img src="${url}" alt="screenshot"></div>`).join('')}
      </div>` : '<p>Нет скриншотов</p>';

    const html = `
      <div class="game-detail">
        <div class="game-header">
          <div class="game-cover">
            <img src="${game.screenshots?.[0] || 'https://picsum.photos/id/0/400/300'}" alt="${escapeHtml(game.title)}">
          </div>
          <div class="game-info">
            <h1 class="game-title">${escapeHtml(game.title)}</h1>
            <div class="game-meta">
              <span><i class="fas fa-tag"></i> ${escapeHtml(game.genre)}</span>
              <span><i class="fas fa-code-branch"></i> ${escapeHtml(game.developer || 'Unknown')}</span>
              <span><i class="fas fa-calendar"></i> ${new Date(game.releaseDate).toLocaleDateString('ru-RU')}</span>
            </div>
            <div class="game-description">${escapeHtml(game.description)}</div>
            <div class="game-stats">
              <div class="stat-item"><div class="stat-value">${game.size}</div><span>Размер</span></div>
              <div class="stat-item"><div class="stat-value" id="seedersValue">${game.seeders}</div><span>Сидеры</span></div>
              <div class="stat-item"><div class="stat-value" id="leechersValue">${game.leechers}</div><span>Личеры</span></div>
              <div class="stat-item"><div class="stat-value">${avgRating} / 5</div><span>Рейтинг</span></div>
              <div class="stat-item"><div class="stat-value">${formatNumber(game.downloads || 0)}</div><span>Скачиваний</span></div>
            </div>
            <div class="game-actions">
              <button id="magnetBtn" class="download-btn"><i class="fas fa-download"></i> Скачать торрент</button>
              <button id="favoriteBtn" class="favorite-btn">${isFavorite ? '<i class="fas fa-heart"></i> В избранном' : '<i class="far fa-heart"></i> В избранное'}</button>
            </div>
            ${game.tags && game.tags.length ? `<div class="game-tags">${game.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="screenshots-section">
          <h2><i class="fas fa-images"></i> Скриншоты</h2>
          ${screenshotsHtml}
        </div>
        <div class="chat-section">
          <h2><i class="fas fa-comments"></i> Общий чат игры</h2>
          <div class="chat-messages" id="chatMessages"></div>
          ${currentUser ? `
          <div class="chat-input-area">
            <input type="text" id="chatInput" placeholder="Написать сообщение...">
            <button id="sendChatBtn" class="download-btn" style="padding: 10px 24px;">Отправить</button>
          </div>` : '<p><a href="/login.html">Войдите</a>, чтобы участвовать в чате</p>'}
        </div>
        <div class="reviews-section">
          <h2><i class="fas fa-star"></i> Отзывы игроков (${reviews.length})</h2>
          <div id="reviewsList"></div>
          ${currentUser ? `
          <div class="add-review-form">
            <h3>Оставить отзыв</h3>
            <select id="reviewRating">
              <option value="5">5 ★</option><option value="4">4 ★</option>
              <option value="3">3 ★</option><option value="2">2 ★</option>
              <option value="1">1 ★</option>
            </select>
            <textarea id="reviewText" rows="3" placeholder="Ваш отзыв..."></textarea>
            <button id="submitReviewBtn" class="download-btn">Отправить отзыв</button>
          </div>` : '<p><a href="/login.html">Войдите</a>, чтобы оставить отзыв</p>'}
        </div>
        <div class="similar-games" id="similarGamesSection">
          <h2><i class="fas fa-gamepad"></i> Похожие игры</h2>
          <div id="similarGamesGrid" class="similar-grid">Загрузка...</div>
        </div>
      </div>
    `;
    container.innerHTML = html;

    document.getElementById('magnetBtn')?.addEventListener('click', () => {
      if (game.magnet) { window.open(game.magnet, '_blank'); showToast('Торрент запущен'); }
      else showToast('Magnet-ссылка отсутствует', true);
    });
    document.getElementById('favoriteBtn')?.addEventListener('click', toggleFavorite);
    document.getElementById('submitReviewBtn')?.addEventListener('click', submitReview);
    if (currentUser) {
      document.getElementById('sendChatBtn')?.addEventListener('click', sendChatMessage);
      document.getElementById('chatInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    }
    renderReviews();
  }

  function renderReviews() {
    const reviewsContainer = document.getElementById('reviewsList');
    if (!reviewsContainer) return;
    if (!reviews.length) {
      reviewsContainer.innerHTML = '<div class="no-reviews">Пока нет отзывов. Будьте первым!</div>';
      return;
    }
    reviewsContainer.innerHTML = reviews.map(rev => `
      <div class="review-card" data-review-id="${rev.id}">
        <div class="review-header">
          <div class="review-author">
            <img src="https://i.pravatar.cc/40?img=${rev.userId % 70}" alt="avatar">
            <strong>${escapeHtml(rev.author)}</strong>
          </div>
          <div class="review-rating">${'★'.repeat(rev.rating)}${'☆'.repeat(5-rev.rating)}</div>
        </div>
        <div class="review-text">${escapeHtml(rev.text)}</div>
        <div class="review-footer">
          <span class="review-date">${new Date(rev.createdAt).toLocaleDateString()}</span>
          <button class="like-btn" data-id="${rev.id}">👍 <span class="likes-count">${rev.likes || 0}</span></button>
          <button class="comments-toggle" data-id="${rev.id}">💬 Комментарии</button>
        </div>
        <div class="comments-section" id="comments-${rev.id}"></div>
      </div>
    `).join('');
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); likeReview(btn.dataset.id); });
    });
    document.querySelectorAll('.comments-toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const reviewId = btn.dataset.id;
        const commentsDiv = document.getElementById(`comments-${reviewId}`);
        if (commentsDiv.style.display === 'none' || !commentsDiv.style.display) {
          commentsDiv.style.display = 'block';
          await loadComments(reviewId);
        } else {
          commentsDiv.style.display = 'none';
        }
      });
    });
  }

  // ------------------------------ ОТЗЫВЫ И КОММЕНТАРИИ ------------------------------
  async function submitReview() {
    const rating = parseInt(document.getElementById('reviewRating').value);
    const text = document.getElementById('reviewText').value.trim();
    if (!text) { showToast('Напишите текст отзыва', true); return; }
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ gameId: parseInt(gameId), text, rating })
      });
      if (res.ok) {
        showToast('Отзыв добавлен!');
        document.getElementById('reviewText').value = '';
        await loadGameData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Ошибка', true);
      }
    } catch (err) { showToast('Ошибка', true); }
  }

  async function likeReview(reviewId) {
    if (!currentUser) { showToast('Войдите, чтобы оценивать', true); return; }
    try {
      const res = await fetch(`/api/reviews/${reviewId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const likeSpan = document.querySelector(`.like-btn[data-id="${reviewId}"] .likes-count`);
        if (likeSpan) likeSpan.innerText = data.likes;
        showToast('Спасибо за оценку!');
      }
    } catch (err) {}
  }

  async function loadComments(reviewId) {
    try {
      const res = await fetch(`/api/comments/${reviewId}`);
      const comments = await res.json();
      const container = document.getElementById(`comments-${reviewId}`);
      if (!container) return;
      if (!comments.length) {
        container.innerHTML = '<div class="no-comments">Нет комментариев</div>';
      } else {
        container.innerHTML = comments.map(c => `
          <div class="comment">
            <strong>${escapeHtml(c.author)}</strong>: ${escapeHtml(c.text)}
            <small>${new Date(c.createdAt).toLocaleString()}</small>
          </div>
        `).join('');
      }
      if (currentUser) {
        container.innerHTML += `
          <div class="add-comment">
            <input type="text" id="commentInput-${reviewId}" placeholder="Ваш комментарий...">
            <button class="download-btn" onclick="window.addComment(${reviewId})">→</button>
          </div>
        `;
      }
    } catch (err) {}
  }

  window.addComment = async function(reviewId) {
    const input = document.getElementById(`commentInput-${reviewId}`);
    const text = input?.value.trim();
    if (!text) return;
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ reviewId, text })
      });
      if (res.ok) {
        input.value = '';
        await loadComments(reviewId);
        showToast('Комментарий добавлен');
      }
    } catch (err) { showToast('Ошибка', true); }
  };

  // ------------------------------ ЧАТ WEBSOCKET ------------------------------
  function initSocket() {
    if (socket) socket.disconnect();
    socket = io();
    socket.on('connect', () => socket.emit('join-game', gameId));
    socket.on('chat-message', (data) => addChatMessage(data.author, data.text, data.timestamp));
    socket.on('peers-updated', (peers) => {
      const peer = peers.find(p => p.id == gameId);
      if (peer) {
        const seedersSpan = document.getElementById('seedersValue');
        const leechersSpan = document.getElementById('leechersValue');
        if (seedersSpan) seedersSpan.innerText = peer.seeders;
        if (leechersSpan) leechersSpan.innerText = peer.leechers;
      }
    });
  }

  function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (!text) return;
    socket.emit('chat-message', {
      gameId: gameId,
      author: currentUser?.username || 'Гость',
      text: text
    });
    input.value = '';
  }

  function addChatMessage(author, text, timestamp) {
    const messagesDiv = document.getElementById('chatMessages');
    if (!messagesDiv) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.innerHTML = `<strong>${escapeHtml(author)}</strong> <small>${new Date(timestamp).toLocaleTimeString()}</small><br>${escapeHtml(text)}`;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ------------------------------ ПОХОЖИЕ ИГРЫ ------------------------------
  async function loadSimilarGames() {
    try {
      const res = await fetch(`/api/games?genre=${encodeURIComponent(game.genre)}&limit=6`);
      const data = await res.json();
      const similar = data.games.filter(g => g.id != gameId).slice(0, 4);
      const grid = document.getElementById('similarGamesGrid');
      if (!grid) return;
      if (!similar.length) { grid.innerHTML = '<p>Нет похожих игр</p>'; return; }
      grid.innerHTML = similar.map(g => `
        <div class="similar-card">
          <img src="${g.screenshots?.[0] || 'https://picsum.photos/id/0/200/120'}" alt="${escapeHtml(g.title)}">
          <div class="info">
            <a href="/game.html?id=${g.id}">${escapeHtml(g.title)}</a>
            <div>⭐ ${g.rating || '—'}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {}
  }

  // ------------------------------ МОДАЛКА ДЛЯ СКРИНШОТОВ ------------------------------
  window.openModal = (url) => {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.style.position = 'fixed';
    modal.style.top = 0;
    modal.style.left = 0;
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.background = 'rgba(0,0,0,0.9)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = 2000;
    modal.innerHTML = `<div style="position:relative;"><img src="${url}" style="max-width:90vw; max-height:90vh; border-radius:20px;"><span style="position:absolute; top:10px; right:20px; font-size:30px; cursor:pointer; color:white;">&times;</span></div>`;
    document.body.appendChild(modal);
    modal.querySelector('span').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  };

  // ------------------------------ ЗАПУСК ------------------------------
  async function init() {
    await loadCurrentUser();
    await loadGameData();
    setInterval(async () => {
      try { await fetch('/api/update-peers', { method: 'POST' }); } catch(e) {}
    }, 30000);
  }
  init();
})();
