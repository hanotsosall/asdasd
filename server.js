const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const http = require('http');
const multer = require('multer');
const cheerio = require('cheerio');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'steamfall_super_secret_2025';

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('tiny'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// ========== ДИРЕКТОРИИ ==========
const DATA_DIR = path.join(__dirname, 'data');
const TORRENTS_DIR = path.join(__dirname, 'torrents');
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(TORRENTS_DIR)) fs.mkdirSync(TORRENTS_DIR);
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const ADS_FILE = path.join(DATA_DIR, 'ads.json');
const DOWNLOADS_FILE = path.join(DATA_DIR, 'downloads.json');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return []; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ========== ИНИЦИАЛИЗАЦИЯ ДАННЫХ ==========
const adminHash = bcrypt.hashSync('admin123', 10);
if (!fs.existsSync(USERS_FILE)) {
  writeJSON(USERS_FILE, [{ id: 1, username: 'admin', password: adminHash, role: 'admin', email: 'admin@steamfall.com', avatar: 'https://i.pravatar.cc/150', createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(), banned: false }]);
}
if (!fs.existsSync(GAMES_FILE)) {
  writeJSON(GAMES_FILE, [
    { id: 1, title: "Cyberpunk 2077", genre: "RPG", description: "Киберпанк будущего. Откройте для себя историю Ви — наёмника в мире будущего, где кибернетические импланты стали нормой.", size: "68 GB", magnet: "magnet:?xt=urn:btih:DEMO1", alternative_torrents: [{ label: "Repack от Xatab", magnet: "magnet:?xt=urn:btih:DEMO1_REPACK", size: "45 GB" }], seeders: 1245, leechers: 342, rating: 4.2, releaseDate: "2020-12-10", developer: "CD Projekt Red", publisher: "CD Projekt Red", screenshots: ["https://picsum.photos/id/1/800/450", "https://picsum.photos/id/10/800/450"], tags: ["киберпанк", "открытый мир"], downloads: 15800, views: 45200, updates_count: 12, addedAt: new Date().toISOString(), lastUpdate: new Date().toISOString(), systemRequirements: { os: "Windows 10 64-bit", cpu: "Intel Core i7-4790", ram: "12 GB", gpu: "NVIDIA GTX 1060 6GB", storage: "70 GB" } },
    { id: 2, title: "The Witcher 3: Wild Hunt", genre: "RPG", description: "Легендарная RPG о ведьмаке Геральте из Ривии. Огромный открытый мир, глубокий сюжет, десятки часов геймплея.", size: "50 GB", magnet: "magnet:?xt=urn:btih:DEMO2", alternative_torrents: [], seeders: 2890, leechers: 567, rating: 4.9, releaseDate: "2015-05-19", developer: "CD Projekt Red", publisher: "CD Projekt Red", screenshots: ["https://picsum.photos/id/2/800/450", "https://picsum.photos/id/20/800/450"], tags: ["фэнтези", "сюжет"], downloads: 42000, views: 120000, updates_count: 18, addedAt: new Date().toISOString(), lastUpdate: new Date().toISOString(), systemRequirements: { os: "Windows 7 64-bit", cpu: "Intel Core i5-2500K", ram: "6 GB", gpu: "NVIDIA GTX 660", storage: "55 GB" } },
    { id: 3, title: "Red Dead Redemption 2", genre: "Action", description: "Эпичная история о банде в эпоху Дикого Запада. Артур Морган и его путь.", size: "115 GB", magnet: "magnet:?xt=urn:btih:DEMO3", alternative_torrents: [{ label: "Repack от FitGirl", magnet: "magnet:?xt=urn:btih:DEMO3_FIT", size: "65 GB" }], seeders: 3341, leechers: 892, rating: 4.8, releaseDate: "2018-10-26", developer: "Rockstar Games", publisher: "Rockstar", screenshots: ["https://picsum.photos/id/3/800/450"], tags: ["вестерн", "открытый мир"], downloads: 38000, views: 89000, updates_count: 8, addedAt: new Date().toISOString(), lastUpdate: new Date().toISOString(), systemRequirements: { os: "Windows 10 64-bit", cpu: "Intel Core i7-4770K", ram: "12 GB", gpu: "NVIDIA GTX 1060 6GB", storage: "150 GB" } }
  ]);
}
if (!fs.existsSync(REVIEWS_FILE)) writeJSON(REVIEWS_FILE, []);
if (!fs.existsSync(COMMENTS_FILE)) writeJSON(COMMENTS_FILE, []);
if (!fs.existsSync(ADS_FILE)) {
  writeJSON(ADS_FILE, [
    { id: 1, position: "header", code: '<div class="ad-banner">🔥 Premium доступ — скачай без ограничений</div>', active: true },
    { id: 2, position: "sidebar", code: '<div class="ad-banner">📢 Реклама. Ваше место здесь</div>', active: true },
    { id: 3, position: "infeed", code: '<div class="ad-banner">⭐ Лучший бустинг в играх – скидка 20%</div>', active: true }
  ]);
}
if (!fs.existsSync(DOWNLOADS_FILE)) writeJSON(DOWNLOADS_FILE, []);
if (!fs.existsSync(FAVORITES_FILE)) writeJSON(FAVORITES_FILE, []);

// ========== МИДЛВЕЙРЫ ==========
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch(e) { res.status(401).json({ error: 'Неверный токен' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ только админу' });
  next();
}

// ========== АВТОРИЗАЦИЯ ==========
app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body;
  const users = readJSON(USERS_FILE);
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Логин занят' });
  const hashed = bcrypt.hashSync(password, 10);
  const newUser = { id: Date.now(), username, password: hashed, email, role: 'user', avatar: 'https://i.pravatar.cc/150', createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(), banned: false };
  users.push(newUser);
  writeJSON(USERS_FILE, users);
  const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '30d' });
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
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar } });
});
app.get('/api/me', auth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  res.json({ id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar, createdAt: user.createdAt });
});

// ========== ИГРЫ – ОСНОВНЫЕ ==========
app.get('/api/games', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const { search, genre, year, developer, tag, sort, page = 1, limit = 12 } = req.query;
  if (search) games = games.filter(g => g.title.toLowerCase().includes(search.toLowerCase()));
  if (genre && genre !== 'all') games = games.filter(g => g.genre === genre);
  if (year) games = games.filter(g => new Date(g.releaseDate).getFullYear() == year);
  if (developer) games = games.filter(g => g.developer?.toLowerCase().includes(developer.toLowerCase()));
  if (tag) games = games.filter(g => g.tags && g.tags.includes(tag));
  if (sort === 'date') games.sort((a,b) => new Date(b.addedAt) - new Date(a.addedAt));
  if (sort === 'downloads') games.sort((a,b) => b.downloads - a.downloads);
  if (sort === 'rating') games.sort((a,b) => b.rating - a.rating);
  if (sort === 'views') games.sort((a,b) => (b.views||0) - (a.views||0));
  const start = (page-1)*limit;
  const paginated = games.slice(start, start+limit);
  res.json({ games: paginated, total: games.length, page: +page, totalPages: Math.ceil(games.length/limit) });
});
app.get('/api/games/:id', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const game = games.find(g => g.id == req.params.id);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  game.views = (game.views||0) + 1;
  writeJSON(GAMES_FILE, games);
  res.json(game);
});
app.post('/api/games', auth, adminOnly, (req, res) => {
  const games = readJSON(GAMES_FILE);
  const newGame = {
    ...req.body,
    id: Date.now(),
    rating: 0,
    downloads: 0,
    views: 0,
    updates_count: 0,
    alternative_torrents: req.body.alternative_torrents || [],
    addedAt: new Date().toISOString(),
    lastUpdate: new Date().toISOString(),
    seeders: 0,
    leechers: 0,
    systemRequirements: req.body.systemRequirements || {}
  };
  games.push(newGame);
  writeJSON(GAMES_FILE, games);
  res.json(newGame);
});
app.put('/api/games/:id', auth, adminOnly, (req, res) => {
  let games = readJSON(GAMES_FILE);
  const idx = games.findIndex(g => g.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Игра не найдена' });
  games[idx] = { ...games[idx], ...req.body, lastUpdate: new Date().toISOString() };
  writeJSON(GAMES_FILE, games);
  res.json(games[idx]);
});
app.put('/api/games/:id/update', auth, adminOnly, (req, res) => {
  let games = readJSON(GAMES_FILE);
  const idx = games.findIndex(g => g.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Игра не найдена' });
  games[idx].updates_count = (games[idx].updates_count || 0) + 1;
  games[idx].lastUpdate = new Date().toISOString();
  if (req.body.alternative_torrents) games[idx].alternative_torrents = req.body.alternative_torrents;
  writeJSON(GAMES_FILE, games);
  res.json(games[idx]);
});
app.delete('/api/games/:id', auth, adminOnly, (req, res) => {
  let games = readJSON(GAMES_FILE);
  games = games.filter(g => g.id != req.params.id);
  writeJSON(GAMES_FILE, games);
  res.json({ success: true });
});

// ========== СПЕЦИАЛЬНЫЕ СПИСКИ (как на byrutgame) ==========
app.get('/api/games/released', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const today = new Date().toISOString().slice(0,10);
  const released = games.filter(g => g.releaseDate <= today)
    .sort((a,b) => new Date(b.releaseDate) - new Date(a.releaseDate))
    .slice(0, 12);
  res.json(released);
});
app.get('/api/games/upcoming', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const today = new Date().toISOString().slice(0,10);
  const upcoming = games.filter(g => g.releaseDate > today)
    .sort((a,b) => new Date(a.releaseDate) - new Date(b.releaseDate))
    .slice(0, 12);
  res.json(upcoming);
});
app.get('/api/games/popular', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const popular = [...games].sort((a,b) => (b.downloads||0) - (a.downloads||0)).slice(0, 5);
  res.json(popular);
});

// ========== ОТЗЫВЫ И КОММЕНТАРИИ ==========
app.get('/api/reviews/:gameId', (req, res) => {
  const reviews = readJSON(REVIEWS_FILE);
  res.json(reviews.filter(r => r.gameId == req.params.gameId));
});
app.post('/api/reviews', auth, (req, res) => {
  const { gameId, text, rating } = req.body;
  const reviews = readJSON(REVIEWS_FILE);
  const newReview = { id: Date.now(), gameId: parseInt(gameId), userId: req.user.id, author: req.user.username, text, rating, likes: 0, createdAt: new Date().toISOString() };
  reviews.push(newReview);
  writeJSON(REVIEWS_FILE, reviews);
  // обновление среднего рейтинга игры
  const games = readJSON(GAMES_FILE);
  const game = games.find(g => g.id == gameId);
  if (game) {
    const gameReviews = reviews.filter(r => r.gameId == gameId);
    const avg = gameReviews.reduce((s,r)=> s+r.rating,0)/gameReviews.length;
    game.rating = parseFloat(avg.toFixed(1));
    writeJSON(GAMES_FILE, games);
  }
  res.json(newReview);
});
app.post('/api/reviews/:id/like', auth, (req, res) => {
  let reviews = readJSON(REVIEWS_FILE);
  const rev = reviews.find(r => r.id == req.params.id);
  if (rev) { rev.likes = (rev.likes||0) + 1; writeJSON(REVIEWS_FILE, reviews); res.json({ likes: rev.likes }); }
  else res.status(404).json({ error: 'Not found' });
});
app.get('/api/comments/:reviewId', (req, res) => {
  const comments = readJSON(COMMENTS_FILE);
  res.json(comments.filter(c => c.reviewId == req.params.reviewId));
});
app.post('/api/comments', auth, (req, res) => {
  const { reviewId, text } = req.body;
  const comments = readJSON(COMMENTS_FILE);
  const newComment = { id: Date.now(), reviewId: parseInt(reviewId), userId: req.user.id, author: req.user.username, text, createdAt: new Date().toISOString() };
  comments.push(newComment);
  writeJSON(COMMENTS_FILE, comments);
  res.json(newComment);
});

// ========== ИЗБРАННОЕ ==========
app.get('/api/favorites', auth, (req, res) => {
  let favs = readJSON(FAVORITES_FILE);
  favs = favs.filter(f => f.userId === req.user.id);
  res.json(favs);
});
app.post('/api/favorites', auth, (req, res) => {
  const { gameId } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  let favs = readJSON(FAVORITES_FILE);
  if (!favs.find(f => f.userId === req.user.id && f.gameId == gameId)) {
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

// ========== АДМИНКА ==========
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, banned: u.banned, lastSeen: u.lastSeen })));
});
app.post('/api/admin/users/:id/ban', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id == req.params.id);
  if (user) { user.banned = true; writeJSON(USERS_FILE, users); res.json({ success: true }); }
  else res.status(404).json({ error: 'Не найден' });
});
app.post('/api/admin/users/:id/unban', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id == req.params.id);
  if (user) { user.banned = false; writeJSON(USERS_FILE, users); res.json({ success: true }); }
  else res.status(404).json({ error: 'Не найден' });
});

// ========== ИМПОРТ ==========
app.post('/api/import', auth, adminOnly, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL не указан' });
  try {
    const { data } = await axios.get(url, { timeout: 5000 });
    const $ = cheerio.load(data);
    const title = $('title').text().trim() || 'Imported Game';
    res.json({ title, genre: 'Action', description: 'Imported', size: 'N/A', magnet: 'magnet:?xt=urn:btih:import', developer: 'Unknown', releaseDate: new Date().toISOString().split('T')[0], screenshots: ['https://picsum.photos/id/100/800/450'], tags: [] });
  } catch(e) { res.status(500).json({ error: 'Ошибка импорта' }); }
});

// ========== РЕКЛАМА ==========
app.get('/api/ads', (req, res) => {
  const ads = readJSON(ADS_FILE);
  res.json(ads.filter(a => a.active));
});
app.post('/api/ads', auth, adminOnly, (req, res) => {
  writeJSON(ADS_FILE, req.body);
  res.json({ success: true });
});

// ========== ЛОГИ ==========
app.get('/api/logs', auth, adminOnly, (req, res) => {
  const logFile = path.join(LOGS_DIR, 'server.log');
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, 'utf8');
    res.json({ logs: logs.split('\n').slice(-200) });
  } else res.json({ logs: [] });
});

// ========== СТАТИСТИКА (расширенная) ==========
app.get('/api/stats', (req, res) => {
  const games = readJSON(GAMES_FILE);
  const users = readJSON(USERS_FILE);
  const reviews = readJSON(REVIEWS_FILE);
  const totalDownloads = games.reduce((s,g) => s + (g.downloads||0), 0);
  const totalSeeders = games.reduce((s,g) => s + g.seeders, 0);
  let updatesLastWeek = 0;
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
  games.forEach(g => {
    if (g.lastUpdate && new Date(g.lastUpdate) > weekAgo) updatesLastWeek++;
  });
  res.json({
    totalGames: games.length,
    totalUsers: users.length,
    totalDownloads,
    totalSeeders,
    totalComments: reviews.length,
    updatesLastWeek
  });
});

// ========== ОБНОВЛЕНИЕ ПИРОВ И WEBSOCKET ==========
app.post('/api/update-peers', (req, res) => {
  let games = readJSON(GAMES_FILE);
  games = games.map(g => ({ ...g, seeders: Math.max(0, g.seeders + Math.floor(Math.random()*40)-20), leechers: Math.max(0, g.leechers + Math.floor(Math.random()*30)-15) }));
  writeJSON(GAMES_FILE, games);
  io.emit('peers-updated', games.map(g => ({ id: g.id, seeders: g.seeders, leechers: g.leechers })));
  res.json({ success: true });
});
io.on('connection', (socket) => {
  socket.on('join-game', (gameId) => socket.join(`game_${gameId}`));
  socket.on('chat-message', (data) => io.to(`game_${data.gameId}`).emit('chat-message', { author: data.author, text: data.text, timestamp: new Date().toISOString() }));
});

// ========== ОТСЛЕЖИВАНИЕ СКАЧИВАНИЙ ==========
app.post('/api/track-download', (req, res) => {
  const { gameId } = req.body;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  let games = readJSON(GAMES_FILE);
  const game = games.find(g => g.id == gameId);
  if (game) {
    game.downloads = (game.downloads || 0) + 1;
    writeJSON(GAMES_FILE, games);
    // также записываем в историю, если нужна
    const downloads = readJSON(DOWNLOADS_FILE);
    downloads.push({ gameId, userId: req.user?.id || null, timestamp: new Date().toISOString() });
    writeJSON(DOWNLOADS_FILE, downloads);
  }
  res.json({ success: true });
});

// ========== ЗАГРУЗКА ТОРРЕНТ-ФАЙЛА ==========
const upload = multer({ dest: TORRENTS_DIR });
app.post('/api/upload-torrent', auth, adminOnly, upload.single('torrent'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  res.json({ filename: req.file.filename });
});

// ========== ЗАПУСК ==========
server.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
  console.log(`🔐 Админка: http://localhost:${PORT}/admin.html (логин admin, пароль admin123)`);
});
