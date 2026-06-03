const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const http = require('http');
const multer = require('multer');
const cheerio = require('cheerio');
const { body, validationResult } = require('express-validator');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'steamfall_super_secret_key_2025';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== ИНИЦИАЛИЗАЦИЯ ==========
const DATA_DIR = path.join(__dirname, 'data');
const TORRENTS_DIR = path.join(__dirname, 'torrents');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TORRENTS_DIR)) fs.mkdirSync(TORRENTS_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const ADS_FILE = path.join(DATA_DIR, 'ads.json');
const DOWNLOADS_FILE = path.join(DATA_DIR, 'downloads.json');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');

function initJSON(file, defaultData) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
}
initJSON(USERS_FILE, [{
  id: 1, username: 'admin', password: bcrypt.hashSync('admin123', 8),
  role: 'admin', email: 'admin@steamfall.com', avatar: 'https://i.pravatar.cc/150?img=1',
  createdAt: new Date().toISOString(), banned: false, lastSeen: new Date().toISOString()
}]);
initJSON(GAMES_FILE, [
  { id: 1, title: "Cyberpunk 2077", slug: "cyberpunk-2077", genre: "RPG", description: "Киберпанк будущего.", size: "68 GB", magnet: "magnet:?xt=urn:btih:DEMO1", seeders: 1245, leechers: 342, rating: 4.2, releaseDate: "2020-12-10", developer: "CD Projekt Red", screenshots: ["https://picsum.photos/id/1/800/450"], tags: ["киберпанк"], downloads: 15800, views: 45200, addedAt: new Date().toISOString() },
  { id: 2, title: "The Witcher 3", slug: "the-witcher-3", genre: "RPG", description: "Легендарная RPG.", size: "50 GB", magnet: "magnet:?xt=urn:btih:DEMO2", seeders: 2890, leechers: 567, rating: 4.9, releaseDate: "2015-05-19", developer: "CD Projekt Red", screenshots: ["https://picsum.photos/id/2/800/450"], tags: ["фэнтези"], downloads: 42000, views: 120000, addedAt: new Date().toISOString() }
]);
initJSON(REVIEWS_FILE, []);
initJSON(COMMENTS_FILE, []);
initJSON(ADS_FILE, [
  { id: 1, position: "header", code: '<div class="ad-banner">🔥 VIP-аккаунт</div>', active: true },
  { id: 2, position: "sidebar", code: '<div class="ad-banner">📢 Реклама</div>', active: true },
  { id: 3, position: "infeed", code: '<div class="ad-banner">⭐ Бустинг</div>', active: true }
]);
initJSON(DOWNLOADS_FILE, []);
initJSON(FAVORITES_FILE, []);

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ========== MIDDLEWARE ==========
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch(e) { res.status(401).json({ error: 'Неверный токен' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  next();
}

// ========== API ПОЛЬЗОВАТЕЛЕЙ ==========
app.post('/api/register', body('username').isLength({ min: 3 }), body('password').isLength({ min: 6 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { username, password, email } = req.body;
  const users = readJSON(USERS_FILE);
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Логин занят' });
  const hashed = bcrypt.hashSync(password, 8);
  const newUser = { id: Date.now(), username, password: hashed, email, role: 'user', avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random()*70)}`, createdAt: new Date().toISOString(), banned: false, lastSeen: new Date().toISOString() };
  users.push(newUser);
  writeJSON(USERS_FILE, users);
  const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, avatar: newUser.avatar } });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Неверные данные' });
  if (user.banned) return res.status(403).json({ error: 'Аккаунт заблокирован' });
  user.lastSeen = new Date().toISOString();
  writeJSON(USERS_FILE, users);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar } });
});

app.get('/api/profile', auth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  const downloads = readJSON(DOWNLOADS_FILE).filter(d => d.userId === user.id);
  const favorites = readJSON(FAVORITES_FILE).filter(f => f.userId === user.id);
  res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar }, downloads, favorites });
});

app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, banned: u.banned, lastSeen: u.lastSeen })));
});

app.post('/api/admin/users/:id/ban', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id == req.params.id);
  if (user) { user.banned = true; user.banReason = req.body.reason || 'Нарушение'; writeJSON(USERS_FILE, users); res.json({ success: true }); }
  else res.status(404).json({ error: 'Not found' });
});

app.post('/api/admin/users/:id/unban', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id == req.params.id);
  if (user) { user.banned = false; delete user.banReason; writeJSON(USERS_FILE, users); res.json({ success: true }); }
  else res.status(404).json({ error: 'Not found' });
});

// ========== API ИГР ==========
app.get('/api/games', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const { search, genre, sort, page = 1, limit = 12 } = req.query;
  if (search) games = games.filter(g => g.title.toLowerCase().includes(search.toLowerCase()));
  if (genre && genre !== 'all') games = games.filter(g => g.genre === genre);
  if (sort === 'date') games.sort((a,b) => new Date(b.addedAt) - new Date(a.addedAt));
  if (sort === 'downloads') games.sort((a,b) => b.downloads - a.downloads);
  if (sort === 'size') games.sort((a,b) => parseFloat(a.size) - parseFloat(b.size));
  if (sort === 'rating') games.sort((a,b) => b.rating - a.rating);
  const start = (page-1)*limit;
  const paginated = games.slice(start, start+limit);
  res.json({ games: paginated, total: games.length, page: +page, totalPages: Math.ceil(games.length/limit) });
});

app.get('/api/games/:id', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const game = games.find(g => g.id == req.params.id);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  game.views = (game.views || 0) + 1;
  writeJSON(GAMES_FILE, games);
  res.json(game);
});

app.post('/api/games', auth, adminOnly, (req, res) => {
  const games = readJSON(GAMES_FILE);
  const slug = req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const newGame = { id: Date.now(), slug, ...req.body, rating: 0, downloads: 0, views: 0, addedAt: new Date().toISOString(), seeders: 0, leechers: 0 };
  games.push(newGame);
  writeJSON(GAMES_FILE, games);
  res.json(newGame);
});

app.delete('/api/games/:id', auth, adminOnly, (req, res) => {
  let games = readJSON(GAMES_FILE);
  games = games.filter(g => g.id != req.params.id);
  writeJSON(GAMES_FILE, games);
  res.json({ success: true });
});

// ========== ОТЗЫВЫ И КОММЕНТАРИИ ==========
app.get('/api/reviews/:gameId', (req, res) => {
  const reviews = readJSON(REVIEWS_FILE);
  res.json(reviews.filter(r => r.gameId == req.params.gameId));
});
app.post('/api/reviews', auth, (req, res) => {
  const { gameId, text, rating } = req.body;
  if (!gameId || !text || !rating) return res.status(400).json({ error: 'Заполните поля' });
  const reviews = readJSON(REVIEWS_FILE);
  const newReview = { id: Date.now(), gameId: parseInt(gameId), userId: req.user.id, author: req.user.username, text, rating: parseInt(rating), likes: 0, createdAt: new Date().toISOString() };
  reviews.push(newReview);
  writeJSON(REVIEWS_FILE, reviews);
  // обновляем рейтинг игры
  const games = readJSON(GAMES_FILE);
  const gameIndex = games.findIndex(g => g.id == gameId);
  if (gameIndex !== -1) {
    const gameReviews = reviews.filter(r => r.gameId == gameId);
    const avg = gameReviews.reduce((s,r)=> s+r.rating,0)/gameReviews.length;
    games[gameIndex].rating = parseFloat(avg.toFixed(1));
    writeJSON(GAMES_FILE, games);
  }
  res.json(newReview);
});
app.post('/api/reviews/:id/like', auth, (req, res) => {
  let reviews = readJSON(REVIEWS_FILE);
  const rev = reviews.find(r => r.id == req.params.id);
  if (rev) { rev.likes += 1; writeJSON(REVIEWS_FILE, reviews); res.json({ likes: rev.likes }); }
  else res.status(404).json({ error: 'Not found' });
});
app.get('/api/comments/:reviewId', (req, res) => {
  const comments = readJSON(COMMENTS_FILE);
  res.json(comments.filter(c => c.reviewId == req.params.reviewId));
});
app.post('/api/comments', auth, (req, res) => {
  const { reviewId, text } = req.body;
  if (!reviewId || !text) return res.status(400).json({ error: 'Введите текст' });
  const comments = readJSON(COMMENTS_FILE);
  const newComment = { id: Date.now(), reviewId: parseInt(reviewId), userId: req.user.id, author: req.user.username, text, createdAt: new Date().toISOString() };
  comments.push(newComment);
  writeJSON(COMMENTS_FILE, comments);
  res.json(newComment);
});

// ========== ИЗБРАННОЕ ==========
app.post('/api/favorites', auth, (req, res) => {
  let favs = readJSON(FAVORITES_FILE);
  const { gameId } = req.body;
  if (!favs.find(f => f.userId === req.user.id && f.gameId === gameId)) {
    favs.push({ userId: req.user.id, gameId, addedAt: new Date().toISOString() });
    writeJSON(FAVORITES_FILE, favs);
  }
  res.json({ success: true });
});
app.delete('/api/favorites/:gameId', auth, (req, res) => {
  let favs = readJSON(FAVORITES_FILE);
  favs = favs.filter(f => !(f.userId === req.user.id && f.gameId == req.params.gameId));
  writeJSON(FAVORITES_FILE, favs);
  res.json({ success: true });
});

// ========== ИМПОРТ (без axios, используем fetch) ==========
app.post('/api/import', auth, adminOnly, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL не указан' });
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const title = $('title').text().trim() || 'Импортированная игра';
    const description = $('meta[name="description"]').attr('content') || 'Описание отсутствует';
    const size = $('.size').text() || 'N/A';
    const magnet = $('a[href^="magnet:"]').attr('href') || `magnet:?xt=urn:btih:IMPORTED_${Date.now()}`;
    const developer = $('.developer').text() || 'Неизвестный';
    const releaseDate = $('.release-date').text() || new Date().toISOString().split('T')[0];
    let screenshots = [];
    $('img.screenshot, .screenshot img').each((i, el) => {
      let src = $(el).attr('src');
      if (src && !src.startsWith('http')) src = new URL(src, url).href;
      if (src) screenshots.push(src);
    });
    if (screenshots.length === 0) screenshots = ['https://picsum.photos/id/100/800/450'];
    res.json({ title: title.substring(0,100), genre: 'Action', description: description.substring(0,500), size, magnet, developer, releaseDate: releaseDate.substring(0,10), screenshots: screenshots.slice(0,4), tags: ['импорт'] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка парсинга', details: error.message });
  }
});

// ========== ПИРЫ И СТАТИСТИКА ==========
app.post('/api/update-peers', (req, res) => {
  let games = readJSON(GAMES_FILE);
  games = games.map(g => ({ ...g, seeders: Math.max(0, g.seeders + Math.floor(Math.random()*40)-20), leechers: Math.max(0, g.leechers + Math.floor(Math.random()*30)-15) }));
  writeJSON(GAMES_FILE, games);
  io.emit('peers-updated', games.map(g => ({ id: g.id, seeders: g.seeders, leechers: g.leechers })));
  res.json({ success: true });
});
app.get('/api/stats', (req, res) => {
  const games = readJSON(GAMES_FILE);
  const users = readJSON(USERS_FILE);
  const totalDownloads = games.reduce((s,g)=> s + (g.downloads||0), 0);
  const totalSeeders = games.reduce((s,g)=> s + g.seeders, 0);
  const topGames = [...games].sort((a,b)=> b.downloads - a.downloads).slice(0,5);
  res.json({ totalGames: games.length, totalUsers: users.length, totalDownloads, totalSeeders, topGames });
});

// ========== РЕКЛАМА ==========
app.get('/api/ads', (req, res) => { res.json(readJSON(ADS_FILE)); });
app.post('/api/ads', auth, adminOnly, (req, res) => { writeJSON(ADS_FILE, req.body); res.json({ success: true }); });

// ========== WEBSOCKET ==========
io.on('connection', (socket) => {
  socket.on('join-game', (gameId) => socket.join(`game_${gameId}`));
  socket.on('chat-message', (data) => io.to(`game_${data.gameId}`).emit('chat-message', { author: data.author, text: data.text, timestamp: new Date().toISOString() }));
});

// ========== ЗАПУСК ==========
server.listen(PORT, () => console.log(`🔥 SteamFall запущен на порту ${PORT}`));
