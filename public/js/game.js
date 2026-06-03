// public/js/game.js - SteamFall ULTIMATE
// Полная клиентская логика страницы игры: отображение информации, отзывы, лайки, комментарии, чат WebSocket, избранное, похожие игры
(function() {
  // ====================== ПЕРЕМЕННЫЕ ======================
  let game = null;
  let reviews = [];
  let currentUser = null;
  let token = localStorage.getItem('token');
  let isFavorite = false;
  let socket = null;
  let gameId = null;

  // DOM элементы
  const container = document.getElementById('gameContainer');
  const toast = document.getElementById('toast');
  const headerActions = document.getElementById('headerActions');

  // ====================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ======================
  function showToast(message, isError = false) {
    if (!toast) return;
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

  // ====================== АВТОРИЗАЦИЯ (шапка) ======================
  function updateHeaderUI() {
    if (!headerActions) return;
    if (currentUser) {
      headerActions.innerHTML = `
        <div class="user-menu">
          <img src="${currentUser.avatar || 'https://i.pravatar.cc/40?img=1'}" class="avatar-small" alt="avatar">
          <span>${escapeHtml(currentUser.username)}</span>
          <button id="logoutBtn" class="btn-outline small">Выйти</button>
        </div>
      `;
      document.getElementById('logoutBtn')?.addEventListener('click', logout);
    } else {
      headerActions.innerHTML = `
        <button id="loginBtnGame" class="btn-outline">Войти</button>
        <button id="registerBtnGame" class="btn-primary">Регистрация</button>
      `;
      document.getElementById('loginBtnGame')?.addEventListener('click', () => openAuthModal('login'));
      document.getElementById('registerBtnGame')?.addEventListener('click', () => openAuthModal('register'));
    }
  }

  function openAuthModal(type) {
    // Простая модалка через prompt, но можно расширить
    if (type === 'login') {
      const username = prompt('Логин');
      const password = prompt('Пароль');
      if (username && password) login(username, password);
    } else {
      const username = prompt('Логин (мин. 3)');
      const email = prompt('Email');
      const password = prompt('Пароль (мин. 6)');
      if (username && email && password) register(username, email, password);
    }
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
      showToast(`Добро пожаловать, ${currentUser.username}!`);
      await checkFavorite();
      loadGameData(); // перезагрузка страницы для обновления UI (кнопка избранного, форма отзыва)
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
      if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
      localStorage.setItem('token', data.token);
      token = data.token;
      currentUser = data.user;
      updateHeaderUI();
      showToast(`Регистрация успешна! Добро пожаловать, ${currentUser.username}!`);
      await checkFavorite();
      loadGameData();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  async function logout() {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    updateHeaderUI();
    showToast('Вы вышли из аккаунта');
    loadGameData();
  }

  async function loadCurrentUser() {
    if (!token) return;
    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        currentUser = await res.json();
        updateHeaderUI();
      } else {
        logout();
      }
    } catch (err) {
      logout();
    }
  }

  // ====================== ИЗБРАННОЕ ======================
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

  // ====================== ЗАГРУЗКА ДАННЫХ ИГРЫ ======================
  async function loadGameData() {
    const urlParams = new URLSearchParams(window.location.search);
    gameId = urlParams.get('id');
    if (!gameId) {
      container.innerHTML = '<div class="error-message">❌ ID игры не указан</div>';
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
      document.title = `${game.title} | SteamFall ULTIMATE`;
      renderGamePage();
      await checkFavorite();
      initSocket();
      loadSimilarGames();
    } catch (err) {
      container.innerHTML = `<div class="error-message">⚠️ ${err.message}</div>`;
    }
  }

  // ====================== ОТРИСОВКА СТРАНИЦЫ ======================
  function renderGamePage() {
    const avgRating = reviews.length ? (reviews.reduce((s,r)=>s+r.rating,0)/reviews.length).toFixed(1) : game.rating || '—';
    const screenshotsHtml = game.screenshots && game.screenshots.length ? 
      `<div class="screenshots-grid">
        ${game.screenshots.map(url => `<div class="screenshot-item" onclick="window.openModal('${url}')"><img src="${url}" alt="screenshot"></div>`).join('')}
      </div>` : '<p>Нет скриншотов</p>';

    const html = `
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
          <div class="game-stats-grid">
            <div class="stat-item"><div class="stat-value">${game.size}</div><span>Размер</span></div>
            <div class="stat-item"><div class="stat-value" id="seedersValue">${game.seeders}</div><span>Сидеры</span></div>
            <div class="stat-item"><div class="stat-value" id="leechersValue">${game.leechers}</div><span>Личеры</span></div>
            <div class="stat-item"><div class="stat-value">${avgRating} / 5</div><span>Рейтинг</span></div>
            <div class="stat-item"><div class="stat-value">${formatNumber(game.downloads || 0)}</div><span>Скачиваний</span></div>
            <div class="stat-item"><div class="stat-value">${formatNumber(game.views || 0)}</div><span>Просмотров</span></div>
          </div>
          <div class="game-actions">
            <button id="magnetBtn" class="btn-magnet"><i class="fas fa-magnet"></i> Скачать Magnet</button>
            <button id="favoriteBtn" class="btn-favorite">${isFavorite ? '<i class="fas fa-heart"></i> В избранном' : '<i class="far fa-heart"></i> В избранное'}</button>
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
          <button id="sendChatBtn" class="btn-magnet" style="padding: 10px 24px;">Отправить</button>
        </div>` : '<p><a href="#" id="loginToChat">Войдите</a>, чтобы участвовать в чате</p>'}
      </div>
      <div class="reviews-section">
        <h2><i class="fas fa-star"></i> Отзывы игроков (${reviews.length})</h2>
        <div id="reviewsList"></div>
        ${currentUser ? `
        <div class="add-review-form" style="background:#0F172A; padding:20px; border-radius:24px; margin-top:30px;">
          <h3>Оставить отзыв</h3>
          <select id="reviewRating" style="margin:10px 0; padding:10px; background:#1F2A3A; border:none; border-radius:20px; color:white;">
            <option value="5">5 ★</option><option value="4">4 ★</option><option value="3">3 ★</option>
            <option value="2">2 ★</option><option value="1">1 ★</option>
          </select>
          <textarea id="reviewText" rows="3" placeholder="Ваш отзыв..." style="width:100%; background:#1F2A3A; border:none; padding:12px; border-radius:20px; color:white;"></textarea>
          <button id="submitReviewBtn" class="btn-magnet" style="margin-top:12px;">Отправить отзыв</button>
        </div>` : '<p><a href="#" id="loginToReview">Войдите</a>, чтобы оставить отзыв</p>'}
      </div>
      <div class="similar-games" id="similarGamesSection">
        <h2><i class="fas fa-gamepad"></i> Похожие игры</h2>
        <div id="similarGamesGrid" class="similar-grid">Загрузка...</div>
      </div>
    `;
    container.innerHTML = html;
    // Обработчики
    document.getElementById('magnetBtn')?.addEventListener('click', () => {
      if (game.magnet) {
        window.open(game.magnet, '_blank');
        showToast('Magnet-ссылка открыта в торрент-клиенте');
      } else showToast('Magnet-ссылка отсутствует', true);
    });
    document.getElementById('favoriteBtn')?.addEventListener('click', toggleFavorite);
    document.getElementById('submitReviewBtn')?.addEventListener('click', submitReview);
    if (currentUser) {
      const sendBtn = document.getElementById('sendChatBtn');
      const chatInput = document.getElementById('chatInput');
      if (sendBtn && chatInput) {
        sendBtn.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
      }
    } else {
      document.getElementById('loginToChat')?.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });
      document.getElementById('loginToReview')?.addEventListener('click', (e) => { e.preventDefault(); openAuthModal('login'); });
    }
    renderReviews();
  }

  function renderReviews() {
    const containerReviews = document.getElementById('reviewsList');
    if (!containerReviews) return;
    if (!reviews.length) {
      containerReviews.innerHTML = '<div class="no-reviews">Пока нет отзывов. Будьте первым!</div>';
      return;
    }
    containerReviews.innerHTML = reviews.map(rev => `
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
          <button class="comments-toggle" data-id="${rev.id}">💬 Комментарии (0)</button>
        </div>
        <div class="comments-section" id="comments-${rev.id}"></div>
      </div>
    `).join('');
    // Обработчики лайков
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        likeReview(btn.dataset.id);
      });
    });
    // Обработчики комментариев
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

  // ====================== ОТЗЫВЫ ======================
  async function submitReview() {
    const rating = parseInt(document.getElementById('reviewRating').value);
    const text = document.getElementById('reviewText').value.trim();
    if (!text) {
      showToast('Напишите текст отзыва', true);
      return;
    }
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
    } catch (err) {
      showToast('Ошибка отправки', true);
    }
  }

  async function likeReview(reviewId) {
    if (!currentUser) {
      showToast('Войдите, чтобы оценивать', true);
      return;
    }
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

  // ====================== КОММЕНТАРИИ ======================
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
            <button class="btn-magnet" onclick="window.addComment(${reviewId})">→</button>
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
    } catch (err) {}
  };

  // ====================== ЧАТ WEBSOCKET ======================
  function initSocket() {
    if (socket) socket.disconnect();
    socket = io();
    socket.on('connect', () => {
      console.log('Socket connected');
      socket.emit('join-game', gameId);
    });
    socket.on('chat-message', (data) => {
      addChatMessage(data.author, data.text, data.timestamp);
    });
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

  // ====================== ПОХОЖИЕ ИГРЫ ======================
  async function loadSimilarGames() {
    try {
      const res = await fetch(`/api/games?genre=${encodeURIComponent(game.genre)}&limit=6`);
      const data = await res.json();
      const similar = data.games.filter(g => g.id != gameId).slice(0, 4);
      const grid = document.getElementById('similarGamesGrid');
      if (!grid) return;
      if (!similar.length) {
        grid.innerHTML = '<p>Нет похожих игр</p>';
        return;
      }
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

  // ====================== ЗАПУСК ======================
  async function init() {
    await loadCurrentUser();
    await loadGameData();
    setInterval(async () => {
      if (gameId) {
        try {
          await fetch('/api/update-peers', { method: 'POST' });
        } catch (err) {}
      }
    }, 30000);
  }

  init();
})();
