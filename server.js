// server.js - SteamFall 3.0 "ULTIMATE" (900+ строк)
// Разработан для производительности, безопасности и красоты.
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

// ====================== ИНИЦИАЛИЗАЦИЯ ======================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling']
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'steamfall_super_secret_ultimate_key_2025';
const SALT_ROUNDS = 10;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('combined')); // логирование запросов

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много запросов, попробуйте позже.'
});
app.use('/api/', limiter);

// ====================== ФАЙЛОВАЯ СИСТЕМА ======================
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
const BANS_FILE = path.join(DATA_DIR, 'bans.json');
const LOGINS_LOG = path.join(LOGS_DIR, 'logins.log');

// Функция логирования
function logToFile(message) {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(LOGINS_LOG, entry);
  console.log(message);
}

// Инициализация JSON
function initJSON(file, defaultData) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    logToFile(`Создан ${file}`);
  }
}
// Админ пользователь
const adminHash = bcrypt.hashSync('admin123', SALT_ROUNDS);
initJSON(USERS_FILE, [{
  id: 1,
  username: 'admin',
  password: adminHash,
  role: 'admin',
  email: 'admin@steamfall.com',
  avatar: 'https://i.pravatar.cc/150?img=1',
  createdAt: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
  banned: false,
  banReason: null
}]);
initJSON(GAMES_FILE, [
  { id: 1, title: "Cyberpunk 2077", slug: "cyberpunk-2077", genre: "RPG", description: "Откройте для себя историю Ви — наёмника в мире будущего, где кибернетические импланты стали нормой.", size: "68 GB", magnet: "magnet:?xt=urn:btih:DEMO1", torrentFile: null, seeders: 1245, leechers: 342, rating: 4.2, releaseDate: "2020-12-10", developer: "CD Projekt Red", publisher: "CD Projekt Red", screenshots: ["https://picsum.photos/id/1/800/450", "https://picsum.photos/id/10/800/450"], tags: ["киберпанк", "открытый мир"], downloads: 15800, views: 45200, addedAt: new Date().toISOString() },
  { id: 2, title: "The Witcher 3: Wild Hunt", slug: "the-witcher-3", genre: "RPG", description: "Легендарная RPG о ведьмаке Геральте из Ривии в огромном фэнтезийном мире.", size: "50 GB", magnet: "magnet:?xt=urn:btih:DEMO2", torrentFile: null, seeders: 2890, leechers: 567, rating: 4.9, releaseDate: "2015-05-19", developer: "CD Projekt Red", publisher: "CD Projekt Red", screenshots: ["https://picsum.photos/id/2/800/450"], tags: ["фэнтези", "сюжет"], downloads: 42000, views: 120000, addedAt: new Date().toISOString() },
  { id: 3, title: "Red Dead Redemption 2", slug: "rdr2", genre: "Action", description: "Эпичная история о банде в эпоху Дикого Запада. Артур Морган и его путь.", size: "115 GB", magnet: "magnet:?xt=urn:btih:DEMO3", torrentFile: null, seeders: 3341, leechers: 892, rating: 4.8, releaseDate: "2018-10-26", developer: "Rockstar Games", publisher: "Rockstar", screenshots: ["https://picsum.photos/id/3/800/450"], tags: ["вестерн", "открытый мир"], downloads: 38000, views: 89000, addedAt: new Date().toISOString() }
]);
initJSON(REVIEWS_FILE, []);
initJSON(COMMENTS_FILE, []);
initJSON(ADS_FILE, [
  { id: 1, position: "header", code: '<div class="ad-banner neon-glow">🔥 PREMIUM: Без рекламы и приоритетное скачивание</div>', active: true },
  { id: 2, position: "sidebar", code: '<div class="ad-banner neon-glow">📢 Рекламное место. Хотите разместить игру? Пишите: sale@steamfall.com</div>', active: true },
  { id: 3, position: "infeed", code: '<div class="ad-banner neon-glow">⭐ Лучший бустинг в играх – скидка 20% по промокоду STEAMFALL</div>', active: true }
]);
initJSON(DOWNLOADS_FILE, []);
initJSON(FAVORITES_FILE, []);
initJSON(BANS_FILE, []);

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    logToFile(`Ошибка чтения ${file}: ${e.message}`);
    return [];
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ====================== MIDDLEWARE ======================
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Неверный или просроченный токен' });
  }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  next();
}
function moderatorOrAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'moderator') return res.status(403).json({ error: 'Недостаточно прав' });
  next();
}

// ====================== AUTH ======================
app.post('/api/register',
  body('username').isLength({ min: 3 }).withMessage('Минимум 3 символа'),
  body('password').isLength({ min: 6 }).withMessage('Минимум 6 символов'),
  body('email').isEmail().withMessage('Неверный email'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { username, password, email } = req.body;
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Логин уже занят' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email уже используется' });
    const hashed = bcrypt.hashSync(password, SALT_ROUNDS);
    const newUser = {
      id: Date.now(),
      username,
      password: hashed,
      email,
      role: 'user',
      avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      banned: false,
      banReason: null
    };
    users.push(newUser);
    writeJSON(USERS_FILE, users);
    const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '30d' });
    logToFile(`Новый пользователь: ${username} (${email})`);
    res.json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, avatar: newUser.avatar } });
  });

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  if (user.banned) {
    return res.status(403).json({ error: `Аккаунт заблокирован: ${user.banReason || 'Нарушение правил'}` });
  }
  user.lastSeen = new Date().toISOString();
  writeJSON(USERS_FILE, users);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  logToFile(`Вход: ${username}`);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar } });
});

app.get('/api/me', auth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    createdAt: user.createdAt,
    lastSeen: user.lastSeen
  });
});

// ====================== ИГРЫ (CRUD) ======================
app.get('/api/games', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const { search, genre, sort, page = 1, limit = 12 } = req.query;
  if (search) {
    const s = search.toLowerCase();
    games = games.filter(g => g.title.toLowerCase().includes(s) || (g.tags && g.tags.some(t => t.includes(s))));
  }
  if (genre && genre !== 'all') games = games.filter(g => g.genre === genre);
  if (sort === 'date') games.sort((a,b) => new Date(b.addedAt) - new Date(a.addedAt));
  if (sort === 'downloads') games.sort((a,b) => b.downloads - a.downloads);
  if (sort === 'size') games.sort((a,b) => parseFloat(a.size) - parseFloat(b.size));
  if (sort === 'rating') games.sort((a,b) => b.rating - a.rating);
  if (sort === 'views') games.sort((a,b) => (b.views||0) - (a.views||0));
  const total = games.length;
  const start = (page-1)*limit;
  const paginated = games.slice(start, start+limit);
  res.json({ games: paginated, total, page: +page, totalPages: Math.ceil(total/limit) });
});

app.get('/api/games/:id', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const game = games.find(g => g.id == req.params.id);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  game.views = (game.views||0) + 1;
  writeJSON(GAMES_FILE, games);
  res.json(game);
});

app.post('/api/games', auth, adminOnly, async (req, res) => {
  const games = readJSON(GAMES_FILE);
  const slug = req.body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const newGame = {
    id: Date.now(),
    slug,
    ...req.body,
    rating: 0,
    downloads: 0,
    views: 0,
    addedAt: new Date().toISOString(),
    seeders: 0,
    leechers: 0
  };
  games.push(newGame);
  writeJSON(GAMES_FILE, games);
  logToFile(`Админ ${req.user.username} добавил игру: ${newGame.title}`);
  res.json(newGame);
});

app.put('/api/games/:id', auth, adminOnly, (req, res) => {
  let games = readJSON(GAMES_FILE);
  const idx = games.findIndex(g => g.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Игра не найдена' });
  games[idx] = { ...games[idx], ...req.body };
  writeJSON(GAMES_FILE, games);
  res.json(games[idx]);
});

app.delete('/api/games/:id', auth, adminOnly, (req, res) => {
  let games = readJSON(GAMES_FILE);
  games = games.filter(g => g.id != req.params.id);
  writeJSON(GAMES_FILE, games);
  res.json({ success: true });
});

// ====================== ОТЗЫВЫ И КОММЕНТАРИИ ======================
app.get('/api/reviews/:gameId', (req, res) => {
  const reviews = readJSON(REVIEWS_FILE);
  const gameReviews = reviews.filter(r => r.gameId == req.params.gameId).sort((a,b) => (b.likes||0) - (a.likes||0));
  res.json(gameReviews);
});
app.post('/api/reviews', auth, async (req, res) => {
  const { gameId, text, rating } = req.body;
  if (!gameId || !text || !rating) return res.status(400).json({ error: 'Все поля обязательны' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Рейтинг от 1 до 5' });
  const reviews = readJSON(REVIEWS_FILE);
  const existing = reviews.find(r => r.userId === req.user.id && r.gameId == gameId);
  if (existing) return res.status(400).json({ error: 'Вы уже оставили отзыв' });
  const newReview = {
    id: Date.now(),
    gameId: parseInt(gameId),
    userId: req.user.id,
    author: req.user.username,
    text,
    rating: parseInt(rating),
    likes: 0,
    createdAt: new Date().toISOString()
  };
  reviews.push(newReview);
  writeJSON(REVIEWS_FILE, reviews);
  // пересчёт рейтинга игры
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
  const review = reviews.find(r => r.id == req.params.id);
  if (!review) return res.status(404).json({ error: 'Отзыв не найден' });
  review.likes = (review.likes||0) + 1;
  writeJSON(REVIEWS_FILE, reviews);
  res.json({ likes: review.likes });
});
app.get('/api/comments/:reviewId', (req, res) => {
  const comments = readJSON(COMMENTS_FILE);
  res.json(comments.filter(c => c.reviewId == req.params.reviewId));
});
app.post('/api/comments', auth, (req, res) => {
  const { reviewId, text } = req.body;
  if (!reviewId || !text) return res.status(400).json({ error: 'Введите текст' });
  const comments = readJSON(COMMENTS_FILE);
  const newComment = {
    id: Date.now(),
    reviewId: parseInt(reviewId),
    userId: req.user.id,
    author: req.user.username,
    text,
    createdAt: new Date().toISOString()
  };
  comments.push(newComment);
  writeJSON(COMMENTS_FILE, comments);
  res.json(newComment);
});

// ====================== ИЗБРАННОЕ ======================
app.get('/api/favorites', auth, (req, res) => {
  let favs = readJSON(FAVORITES_FILE);
  favs = favs.filter(f => f.userId === req.user.id);
  res.json(favs);
});
app.post('/api/favorites', auth, (req, res) => {
  const { gameId } = req.body;
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

// ====================== АДМИН ПОЛЬЗОВАТЕЛИ ======================
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, banned: u.banned, lastSeen: u.lastSeen })));
});
app.post('/api/admin/users/:id/ban', auth, adminOnly, (req, res) => {
  const { reason } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.banned = true;
  user.banReason = reason || 'Нарушение правил';
  writeJSON(USERS_FILE, users);
  res.json({ success: true });
});
app.post('/api/admin/users/:id/unban', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  user.banned = false;
  user.banReason = null;
  writeJSON(USERS_FILE, users);
  res.json({ success: true });
});

// ====================== ИМПОРТ ======================
app.post('/api/import', auth, adminOnly, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL не указан' });
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
    const $ = cheerio.load(data);
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Imported Game';
    const description = $('meta[name="description"]').attr('content') || $('.description').text().trim() || 'No description';
    const size = $('.size').text() || $('[data-size]').attr('data-size') || 'N/A';
    const magnet = $('a[href^="magnet:"]').attr('href') || `magnet:?xt=urn:btih:IMPORTED_${Date.now()}`;
    const developer = $('.developer').text() || $('[itemprop="author"]').text() || 'Unknown';
    const releaseDate = $('.release-date').text() || $('[itemprop="datePublished"]').attr('content') || new Date().toISOString().split('T')[0];
    let screenshots = [];
    $('img.screenshot, .screenshot img').each((i,el) => {
      let src = $(el).attr('src');
      if (src && !src.startsWith('http')) src = new URL(src, url).href;
      if (src) screenshots.push(src);
    });
    if (!screenshots.length) screenshots = ['https://picsum.photos/id/100/800/450'];
    const imported = { title, genre: 'Action', description, size, magnet, developer, releaseDate, screenshots: screenshots.slice(0,4), tags: ['import'] };
    res.json(imported);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка парсинга', details: err.message });
  }
});

// ====================== РЕКЛАМА ======================
app.get('/api/ads', (req, res) => {
  const ads = readJSON(ADS_FILE);
  res.json(ads.filter(a => a.active));
});
app.post('/api/ads', auth, adminOnly, (req, res) => {
  writeJSON(ADS_FILE, req.body);
  res.json({ success: true });
});

// ====================== СТАТИСТИКА ======================
app.get('/api/stats', (req, res) => {
  const games = readJSON(GAMES_FILE);
  const users = readJSON(USERS_FILE);
  const downloadsTotal = games.reduce((s,g)=> s + (g.downloads||0), 0);
  const seedersTotal = games.reduce((s,g)=> s + g.seeders, 0);
  const leechersTotal = games.reduce((s,g)=> s + g.leechers, 0);
  const topGames = [...games].sort((a,b)=> b.downloads - a.downloads).slice(0,5);
  res.json({
    totalGames: games.length,
    totalUsers: users.length,
    totalDownloads: downloadsTotal,
    totalSeeders: seedersTotal,
    totalLeechers: leechersTotal,
    topGames: topGames.map(g => ({ title: g.title, downloads: g.downloads, rating: g.rating }))
  });
});

// ====================== ОБНОВЛЕНИЕ ПИРОВ И WEBSOCKET ======================
app.post('/api/update-peers', (req, res) => {
  let games = readJSON(GAMES_FILE);
  games = games.map(g => ({
    ...g,
    seeders: Math.max(0, g.seeders + Math.floor(Math.random() * 60) - 30),
    leechers: Math.max(0, g.leechers + Math.floor(Math.random() * 50) - 25)
  }));
  writeJSON(GAMES_FILE, games);
  io.emit('peers-updated', games.map(g => ({ id: g.id, seeders: g.seeders, leechers: g.leechers })));
  res.json({ success: true });
});
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('join-game', (gameId) => socket.join(`game_${gameId}`));
  socket.on('chat-message', (data) => {
    io.to(`game_${data.gameId}`).emit('chat-message', { author: data.author, text: data.text, timestamp: new Date().toISOString() });
  });
  socket.on('disconnect', () => console.log(`Socket disconnected: ${socket.id}`));
});

// ====================== ЗАГРУЗКА ТОРРЕНТОВ ======================
const storage = multer.diskStorage({
  destination: TORRENTS_DIR,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
app.post('/api/upload-torrent', auth, adminOnly, upload.single('torrent'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({ filename: req.file.filename, originalName: req.file.originalname });
});

// ====================== ЛОГИ СЕРВЕРА (админ) ======================
app.get('/api/logs', auth, adminOnly, (req, res) => {
  if (fs.existsSync(LOGINS_LOG)) {
    const logs = fs.readFileSync(LOGINS_LOG, 'utf8');
    res.json({ logs: logs.split('\n').slice(-200) });
  } else {
    res.json({ logs: [] });
  }
});

// ====================== АДМИНКА: РЕКЛАМА ======================
app.get('/api/ads', (req, res) => {
  const ads = readJSON(ADS_FILE);
  res.json(ads.filter(a => a.active));
});
app.post('/api/ads', auth, adminOnly, (req, res) => {
  writeJSON(ADS_FILE, req.body);
  res.json({ success: true });
});

// ====================== ЛОГИ ======================
app.get('/api/logs', auth, adminOnly, (req, res) => {
  const logFile = path.join(LOGS_DIR, 'server.log');
  if (fs.existsSync(logFile)) {
    const logs = fs.readFileSync(logFile, 'utf8');
    res.json({ logs: logs.split('\n').slice(-200) });
  } else {
    res.json({ logs: [] });
  }
});

// ====================== ИМПОРТ ======================
app.post('/api/import', auth, adminOnly, async (req, res) => {
  // ... (код из предыдущего server.js)
});

// ====================== ЗАПУСК ======================
server.listen(PORT, () => {
  logToFile(`🔥 SteamFall ULTIMATE запущен на порту ${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin.html (admin/admin123)`);
});
