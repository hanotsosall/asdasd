// public/js/game.js - SteamFall 2.0 (550+ строк)
// Полная логика страницы игры: отзывы, комментарии, чат, избранное, похожие игры

// Глобальные переменные
let currentGame = null;
let currentReviews = [];
let socket = null;
let currentUserId = null;
let currentUserRole = null;
let isFavorite = false;

// DOM элементы
const gameContainer = document.getElementById('gameContainer');
const toast = document.getElementById('toast');

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  // Получаем ID игры из URL
  const urlParams = new URLSearchParams(window.location.search);
  const gameId = urlParams.get('id');
  if (!gameId) {
    showError('ID игры не указан');
    return;
  }
  
  // Загружаем данные пользователя из localStorage
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      currentUserId = payload.id;
      currentUserRole = payload.role;
    } catch(e) { console.error('Ошибка токена'); }
  }
  
  // Инициализация WebSocket
  initWebSocket(gameId);
  
  // Загружаем данные игры
  await loadGame(gameId);
  
  // Загружаем отзывы
  await loadReviews(gameId);
  
  // Проверяем, в избранном ли игра
  if (currentUserId) await checkFavorite(gameId);
  
  // Загружаем похожие игры
  await loadSimilarGames(currentGame.genre, gameId);
  
  // Запускаем обновление пиров через Socket (или через API)
  startPeerUpdater(gameId);
});

// ================== ИНИЦИАЛИЗАЦИЯ WEBSOCKET ==================
function initWebSocket(gameId) {
  socket = io();
  socket.on('connect', () => {
    console.log('WebSocket connected');
    socket.emit('join-game', gameId);
  });
  socket.on('chat-message', (data) => {
    appendChatMessage(data.author, data.text, data.timestamp);
  });
  socket.on('peers-updated', (peersData) => {
    const gamePeer = peersData.find(p => p.id == gameId);
    if (gamePeer) {
      updatePeerDisplay(gamePeer.seeders, gamePeer.leechers);
    }
  });
}

// ================== ЗАГРУЗКА ДАННЫХ ИГРЫ ==================
async function loadGame(gameId) {
  try {
    const response = await fetch(`/api/games/${gameId}`);
    if (!response.ok) throw new Error('Игра не найдена');
    currentGame = await response.json();
    renderGameInfo(currentGame);
    document.title = `${currentGame.title} | SteamFall`;
    // Обновляем мета-теги для SEO (динамически)
    updateMetaTags(currentGame);
  } catch (error) {
    showError(error.message);
  }
}

function renderGameInfo(game) {
  const html = `
    <div class="game-detail">
      <div class="game-info">
        <h1>${escapeHtml(game.title)}</h1>
        <div class="game-meta">
          <span class="genre">${escapeHtml(game.genre)}</span>
          <span class="developer">👨‍💻 ${escapeHtml(game.developer)}</span>
          <span class="publisher">📀 ${escapeHtml(game.publisher || game.developer)}</span>
          <span class="release">📅 ${new Date(game.releaseDate).toLocaleDateString('ru-RU')}</span>
        </div>
        <div class="game-description">${escapeHtml(game.description)}</div>
        <div class="game-stats">
          <div class="stat"><span>💾 Размер:</span> ${game.size}</div>
          <div class="stat"><span>⬆️ Сидеры:</span> <span id="seedersCount">${game.seeders}</span></div>
          <div class="stat"><span>⬇️ Личеры:</span> <span id="leechersCount">${game.leechers}</span></div>
          <div class="stat"><span>⭐ Рейтинг:</span> ${game.rating || '—'} / 5</div>
          <div class="stat"><span>👁️ Просмотров:</span> ${game.views || 0}</div>
          <div class="stat"><span>📥 Скачиваний:</span> ${(game.downloads || 0).toLocaleString()}</div>
        </div>
        <div class="game-actions">
          <button id="magnetBtn" class="magnet-btn">🧲 Скачать Magnet-ссылку</button>
          ${game.torrentFile ? `<button id="torrentBtn" class="torrent-btn">📀 Скачать .torrent файл</button>` : ''}
          ${currentUserId ? `<button id="favoriteBtn" class="favorite-btn ${isFavorite ? 'active' : ''}">❤️ ${isFavorite ? 'В избранном' : 'В избранное'}</button>` : ''}
        </div>
        ${currentGame.tags && currentGame.tags.length ? `
        <div class="game-tags">
          ${currentGame.tags.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
        </div>` : ''}
      </div>
      <div class="game-screenshots">
        <h3>Скриншоты</h3>
        <div class="screenshot-gallery">
          ${currentGame.screenshots.map(url => `<img src="${url}" alt="Screenshot" loading="lazy" onclick="openModal('${url}')">`).join('')}
        </div>
      </div>
    </div>
    <div class="similar-games" id="similarGames"></div>
    <div class="chat-section" id="chatSection">
      <h3>💬 Общий чат игры</h3>
      <div class="chat-messages" id="chatMessages"></div>
      ${currentUserId ? `
      <div class="chat-input">
        <input type="text" id="chatInput" placeholder="Написать сообщение...">
        <button id="sendChatBtn">➤</button>
      </div>` : '<p class="login-to-chat"><a href="/login.html">Войдите</a>, чтобы участвовать в чате</p>'}
    </div>
    <div class="reviews-section" id="reviewsSection">
      <h2>Отзывы игроков <span id="reviewsCount">(${currentReviews.length})</span></h2>
      <div id="reviewsList"></div>
      ${currentUserId ? `
      <div class="add-review">
        <h3>Оставить отзыв</h3>
        <div class="rating-input">
          <span>Оценка: </span>
          <select id="reviewRating">
            <option value="5">5 ★</option><option value="4">4 ★</option>
            <option value="3">3 ★</option><option value="2">2 ★</option>
            <option value="1">1 ★</option>
          </select>
        </div>
        <textarea id="reviewText" rows="4" placeholder="Поделитесь впечатлениями..."></textarea>
        <button id="submitReview">Отправить отзыв</button>
      </div>` : '<p><a href="/login.html">Войдите</a>, чтобы оставить отзыв</p>'}
    </div>
  `;
  gameContainer.innerHTML = html;
  
  // Навешиваем обработчики
  document.getElementById('magnetBtn')?.addEventListener('click', () => downloadMagnet());
  if (game.torrentFile) document.getElementById('torrentBtn')?.addEventListener('click', () => downloadTorrent());
  if (currentUserId) document.getElementById('favoriteBtn')?.addEventListener('click', () => toggleFavorite());
  if (currentUserId) document.getElementById('submitReview')?.addEventListener('click', () => submitReview());
  if (currentUserId) {
    const sendBtn = document.getElementById('sendChatBtn');
    const chatInput = document.getElementById('chatInput');
    if (sendBtn && chatInput) {
      sendBtn.addEventListener('click', () => sendChatMessage());
      chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    }
  }
}

// ================== ЗАГРУЗКА ОТЗЫВОВ ==================
async function loadReviews(gameId) {
  try {
    const response = await fetch(`/api/reviews/${gameId}`);
    currentReviews = await response.json();
    renderReviews(currentReviews);
    document.getElementById('reviewsCount').innerText = `(${currentReviews.length})`;
  } catch (error) {
    console.error('Ошибка загрузки отзывов', error);
  }
}

function renderReviews(reviews) {
  const container = document.getElementById('reviewsList');
  if (!reviews.length) {
    container.innerHTML = '<div class="no-reviews">Пока нет отзывов. Будьте первым!</div>';
    return;
  }
  container.innerHTML = reviews.map(rev => `
    <div class="review-card" data-review-id="${rev.id}">
      <div class="review-header">
        <div class="review-author">
          <img src="https://i.pravatar.cc/40?img=${rev.userId % 70}" class="avatar" alt="avatar">
          <strong>${escapeHtml(rev.author)}</strong>
        </div>
        <div class="review-rating">${'★'.repeat(rev.rating)}${'☆'.repeat(5 - rev.rating)}</div>
      </div>
      <div class="review-text">${escapeHtml(rev.text)}</div>
      <div class="review-footer">
        <span class="review-date">${new Date(rev.createdAt).toLocaleDateString()}</span>
        <button class="like-btn" data-id="${rev.id}">👍 <span class="likes-count">${rev.likes || 0}</span></button>
        <button class="comment-toggle" data-id="${rev.id}">💬 Комментарии</button>
      </div>
      <div class="review-comments" id="comments-${rev.id}" style="display:none;">
        <div class="comments-list" id="comments-list-${rev.id}"></div>
        ${currentUserId ? `
        <div class="add-comment">
          <input type="text" id="comment-input-${rev.id}" placeholder="Ваш комментарий...">
          <button onclick="addComment(${rev.id})">→</button>
        </div>` : ''}
      </div>
    </div>
  `).join('');
  
  // Обработчики лайков и комментариев
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reviewId = btn.dataset.id;
      likeReview(reviewId);
    });
  });
  document.querySelectorAll('.comment-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const reviewId = btn.dataset.id;
      const commentsDiv = document.getElementById(`comments-${reviewId}`);
      if (commentsDiv.style.display === 'none') {
        commentsDiv.style.display = 'block';
        loadComments(reviewId);
      } else {
        commentsDiv.style.display = 'none';
      }
    });
  });
}

// ================== КОММЕНТАРИИ К ОТЗЫВАМ ==================
async function loadComments(reviewId) {
  try {
    const response = await fetch(`/api/comments/${reviewId}`);
    const comments = await response.json();
    const container = document.getElementById(`comments-list-${reviewId}`);
    if (!comments.length) {
      container.innerHTML = '<div class="no-comments">Нет комментариев</div>';
      return;
    }
    container.innerHTML = comments.map(c => `
      <div class="comment-item">
        <strong>${escapeHtml(c.author)}</strong>:
        <span>${escapeHtml(c.text)}</span>
        <small>${new Date(c.createdAt).toLocaleString()}</small>
      </div>
    `).join('');
  } catch (error) {
    console.error('Ошибка загрузки комментариев', error);
  }
}

async function addComment(reviewId) {
  const input = document.getElementById(`comment-input-${reviewId}`);
  const text = input.value.trim();
  if (!text) return;
  try {
    const response = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ reviewId, text })
    });
    if (response.ok) {
      input.value = '';
      loadComments(reviewId);
      showToast('Комментарий добавлен');
    } else {
      showToast('Ошибка добавления комментария');
    }
  } catch (error) {
    console.error(error);
  }
}

// ================== ЛАЙКИ ОТЗЫВОВ ==================
async function likeReview(reviewId) {
  if (!currentUserId) {
    showToast('Войдите, чтобы оценивать отзывы');
    return;
  }
  try {
    const response = await fetch(`/api/reviews/${reviewId}/like`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (response.ok) {
      const data = await response.json();
      const likeSpan = document.querySelector(`.like-btn[data-id="${reviewId}"] .likes-count`);
      if (likeSpan) likeSpan.innerText = data.likes;
      showToast('Спасибо за оценку!');
    } else {
      showToast('Не удалось оценить');
    }
  } catch (error) {
    console.error(error);
  }
}

// ================== ДОБАВЛЕНИЕ ОТЗЫВА ==================
async function submitReview() {
  const rating = parseInt(document.getElementById('reviewRating').value);
  const text = document.getElementById('reviewText').value.trim();
  if (!text) {
    showToast('Напишите текст отзыва');
    return;
  }
  try {
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ gameId: currentGame.id, text, rating })
    });
    if (response.ok) {
      showToast('Отзыв добавлен!');
      document.getElementById('reviewText').value = '';
      await loadReviews(currentGame.id);
    } else {
      const err = await response.json();
      showToast(err.error || 'Ошибка');
    }
  } catch (error) {
    console.error(error);
  }
}

// ================== ИЗБРАННОЕ ==================
async function checkFavorite(gameId) {
  try {
    const response = await fetch('/api/profile', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await response.json();
    isFavorite = data.favorites.some(f => f.gameId == gameId);
    const favBtn = document.getElementById('favoriteBtn');
    if (favBtn) {
      favBtn.innerHTML = isFavorite ? '❤️ В избранном' : '🤍 В избранное';
      favBtn.classList.toggle('active', isFavorite);
    }
  } catch (error) {}
}

async function toggleFavorite() {
  if (!currentUserId) return;
  try {
    if (isFavorite) {
      await fetch(`/api/favorites/${currentGame.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      showToast('Удалено из избранного');
    } else {
      await fetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({ gameId: currentGame.id }) });
      showToast('Добавлено в избранное');
    }
    isFavorite = !isFavorite;
    const favBtn = document.getElementById('favoriteBtn');
    favBtn.innerHTML = isFavorite ? '❤️ В избранном' : '🤍 В избранное';
    favBtn.classList.toggle('active', isFavorite);
  } catch (error) {
    showToast('Ошибка');
  }
}

// ================== ПОХОЖИЕ ИГРЫ ==================
async function loadSimilarGames(genre, excludeId) {
  try {
    const response = await fetch(`/api/games?genre=${encodeURIComponent(genre)}&limit=6`);
    const data = await response.json();
    const similar = data.games.filter(g => g.id != excludeId).slice(0, 4);
    const container = document.getElementById('similarGames');
    if (!similar.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <h3>🎮 Похожие игры</h3>
      <div class="similar-grid">
        ${similar.map(g => `
          <div class="similar-card">
            <img src="${g.screenshots[0]}" alt="${g.title}">
            <div class="similar-info">
              <a href="/game.html?id=${g.id}">${escapeHtml(g.title)}</a>
              <span>⭐ ${g.rating || '—'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {}
}

// ================== ЧАТ (WEBSOCKET) ==================
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  if (!socket) return;
  socket.emit('chat-message', {
    gameId: currentGame.id,
    author: localStorage.getItem('username') || 'User',
    text: text
  });
  input.value = '';
}

function appendChatMessage(author, text, timestamp) {
  const messagesDiv = document.getElementById('chatMessages');
  if (!messagesDiv) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.innerHTML = `<strong>${escapeHtml(author)}</strong> <small>${new Date(timestamp).toLocaleTimeString()}</small><br>${escapeHtml(text)}`;
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ================== СКАЧИВАНИЕ ==================
function downloadMagnet() {
  if (currentGame.magnet) {
    window.open(currentGame.magnet, '_blank');
    showToast('Magnet-ссылка скопирована в буфер? Открыт торрент-клиент');
    // Логируем скачивание (опционально)
    fetch('/api/track-download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: currentGame.id }) }).catch(e=>{});
  } else {
    showToast('Magnet-ссылка отсутствует');
  }
}

function downloadTorrent() {
  if (currentGame.torrentFile) {
    window.open(`/torrents/${currentGame.torrentFile}`, '_blank');
    showToast('Скачивание .torrent файла');
  } else {
    showToast('Торрент-файл не найден');
  }
}

// ================== ОБНОВЛЕНИЕ ПИРОВ ==================
function updatePeerDisplay(seeders, leechers) {
  const seedersSpan = document.getElementById('seedersCount');
  const leechersSpan = document.getElementById('leechersCount');
  if (seedersSpan) seedersSpan.innerText = seeders;
  if (leechersSpan) leechersSpan.innerText = leechers;
}

function startPeerUpdater(gameId) {
  // Если WebSocket не обновляет, то периодически запрашиваем через API
  setInterval(async () => {
    try {
      const response = await fetch(`/api/games/${gameId}`);
      const game = await response.json();
      updatePeerDisplay(game.seeders, game.leechers);
    } catch(e) {}
  }, 30000);
}

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

function showToast(message) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  toastEl.innerText = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function showError(message) {
  gameContainer.innerHTML = `<div class="error-message">❌ ${message}</div>`;
}

function updateMetaTags(game) {
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    document.head.appendChild(metaDesc);
  }
  metaDesc.content = game.description.substring(0, 160);
}

window.openModal = (url) => {
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.innerHTML = `<div class="modal-content"><img src="${url}"><span class="close">&times;</span></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.close').onclick = () => modal.remove();
};

// Экспортируем функцию addComment для глобального вызова
window.addComment = addComment;