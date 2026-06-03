// server.js - SteamFall 2.0 Ultimate (650+ строк)
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

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'steamfall_super_secret_key_2025';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ================== ИНИЦИАЛИЗАЦИЯ ПАПОК И ФАЙЛОВ ==================
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
const LOG_FILE = path.join(LOGS_DIR, 'server.log');

// Вспомогательная функция логирования
function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  console.log(message);
}

// Инициализация JSON-файлов с дефолтными данными
function initJSON(file, defaultData) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
    log(`Создан ${file}`);
  }
}
initJSON(USERS_FILE, [{
  id: 1,
  username: 'admin',
  password: bcrypt.hashSync('admin123', 8),
  role: 'admin',
  email: 'admin@steamfall.com',
  avatar: 'https://i.pravatar.cc/150?img=1',
  createdAt: new Date().toISOString(),
  banned: false,
  banReason: null,
  lastSeen: new Date().toISOString()
}]);
initJSON(GAMES_FILE, [
  { id: 1, title: "Cyberpunk 2077", slug: "cyberpunk-2077", genre: "RPG", description: "Киберпанк будущего от CD Projekt Red. Открытый мир, нелинейный сюжет.", size: "68 GB", magnet: "magnet:?xt=urn:btih:DEMO1", torrentFile: null, seeders: 1245, leechers: 342, rating: 4.2, releaseDate: "2020-12-10", developer: "CD Projekt Red", publisher: "CD Projekt Red", screenshots: ["https://picsum.photos/id/1/800/450", "https://picsum.photos/id/10/800/450"], tags: ["киберпанк", "открытый мир"], downloads: 15800, views: 45200, addedAt: new Date().toISOString() },
  { id: 2, title: "The Witcher 3: Wild Hunt", slug: "the-witcher-3", genre: "RPG", description: "Легендарная RPG о ведьмаке Геральте из Ривии.", size: "50 GB", magnet: "magnet:?xt=urn:btih:DEMO2", torrentFile: null, seeders: 2890, leechers: 567, rating: 4.9, releaseDate: "2015-05-19", developer: "CD Projekt Red", publisher: "CD Projekt Red", screenshots: ["https://picsum.photos/id/2/800/450"], tags: ["фэнтези", "сюжет"], downloads: 42000, views: 120000, addedAt: new Date().toISOString() }
]);
initJSON(REVIEWS_FILE, []);
initJSON(COMMENTS_FILE, []);
initJSON(ADS_FILE, [
  { id: 1, position: "header", code: '<div class="ad-banner">🔥 VIP-аккаунт: без рекламы и быстрый доступ</div>', active: true },
  { id: 2, position: "sidebar", code: '<div class="ad-banner">📢 Ваша реклама здесь — пишите на sale@steamfall.com</div>', active: true },
  { id: 3, position: "infeed", code: '<div class="ad-banner">⭐ Игровой бустинг со скидкой 20%</div>', active: true }
]);
initJSON(DOWNLOADS_FILE, []);
initJSON(FAVORITES_FILE, []);
initJSON(BANS_FILE, []);

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    log(`Ошибка чтения ${file}: ${e.message}`);
    return [];
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  log(`Записано в ${file}`);
}

// ================== MIDDLEWARE ==================
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Неверный или просроченный токен' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  next();
}

function moderatorOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'moderator') return res.status(403).json({ error: 'Требуются права модератора' });
  next();
}

// ================== ПОЛЬЗОВАТЕЛИ ==================
// Регистрация с валидацией
app.post('/api/register',
  body('username').isLength({ min: 3 }).withMessage('Минимум 3 символа'),
  body('password').isLength({ min: 6 }).withMessage('Минимум 6 символов'),
  body('email').isEmail().withMessage('Неверный email'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { username, password, email } = req.body;
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Логин занят' });
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email уже используется' });
    const hashed = bcrypt.hashSync(password, 8);
    const newUser = {
      id: Date.now(),
      username,
      password: hashed,
      email,
      role: 'user',
      avatar: `https://i.pravatar.cc/150?img=${Math.floor(Math.random() * 70)}`,
      createdAt: new Date().toISOString(),
      banned: false,
      banReason: null,
      lastSeen: new Date().toISOString()
    };
    users.push(newUser);
    writeJSON(USERS_FILE, users);
    const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
    log(`Новый пользователь: ${username}`);
    res.json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, avatar: newUser.avatar } });
  });

// Логин
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Неверный логин или пароль' });
  if (user.banned) return res.status(403).json({ error: `Аккаунт заблокирован: ${user.banReason || 'Нарушение правил'}` });
  user.lastSeen = new Date().toISOString();
  writeJSON(USERS_FILE, users);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  log(`Вход пользователя: ${username}`);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar } });
});

// Профиль (защищённый)
app.get('/api/profile', auth, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const downloads = readJSON(DOWNLOADS_FILE).filter(d => d.userId === user.id);
  const favorites = readJSON(FAVORITES_FILE).filter(f => f.userId === user.id);
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      createdAt: user.createdAt,
      lastSeen: user.lastSeen
    },
    downloads,
    favorites
  });
});

// Обновление профиля
app.put('/api/profile', auth, async (req, res) => {
  const { email, avatar } = req.body;
  const users = readJSON(USERS_FILE);
  const userIndex = users.findIndex(u => u.id === req.user.id);
  if (userIndex === -1) return res.status(404).json({ error: 'Не найден' });
  if (email) users[userIndex].email = email;
  if (avatar) users[userIndex].avatar = avatar;
  writeJSON(USERS_FILE, users);
  res.json({ success: true, user: users[userIndex] });
});

// Админ: список всех пользователей
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, role: u.role, banned: u.banned, lastSeen: u.lastSeen })));
});

// Админ: бан/разбан пользователя
app.post('/api/admin/users/:id/ban', auth, adminOnly, (req, res) => {
  const { reason } = req.body;
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.banned = true;
  user.banReason = reason || 'Нарушение правил';
  writeJSON(USERS_FILE, users);
  log(`Пользователь ${user.username} заблокирован`);
  res.json({ success: true });
});
app.post('/api/admin/users/:id/unban', auth, adminOnly, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  user.banned = false;
  user.banReason = null;
  writeJSON(USERS_FILE, users);
  log(`Пользователь ${user.username} разблокирован`);
  res.json({ success: true });
});

// ================== ИГРЫ ==================
// Получение списка игр (пагинация, фильтрация, поиск)
app.get('/api/games', (req, res) => {
  let games = readJSON(GAMES_FILE);
  const { search, genre, sort, page = 1, limit = 12 } = req.query;
  if (search) games = games.filter(g => g.title.toLowerCase().includes(search.toLowerCase()) || (g.tags && g.tags.some(t => t.includes(search.toLowerCase()))));
  if (genre && genre !== 'all') games = games.filter(g => g.genre === genre);
  if (sort === 'date') games.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  if (sort === 'downloads') games.sort((a, b) => b.downloads - a.downloads);
  if (sort === 'size') games.sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
  if (sort === 'rating') games.sort((a, b) => b.rating - a.rating);
  if (sort === 'views') games.sort((a, b) => (b.views || 0) - (a.views || 0));
  const total = games.length;
  const start = (page - 1) * limit;
  const paginated = games.slice(start, start + limit);
  res.json({ games: paginated, total, page: +page, totalPages: Math.ceil(total / limit) });
});

// Получить одну игру по ID с увеличением просмотров
app.get('/api/games/:id', (req, res) => {
  const games = readJSON(GAMES_FILE);
  const game = games.find(g => g.id == req.params.id);
  if (!game) return res.status(404).json({ error: 'Игра не найдена' });
  game.views = (game.views || 0) + 1;
  writeJSON(GAMES_FILE, games);
  res.json(game);
});

// Добавить игру (только админ)
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
  log(`Добавлена игра: ${newGame.title} (admin: ${req.user.username})`);
  res.json(newGame);
});

// Обновить игру
app.put('/api/games/:id', auth, adminOnly, (req, res) => {
  let games = readJSON(GAMES_FILE);
  const index = games.findIndex(g => g.id == req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Игра не найдена' });
  games[index] = { ...games[index], ...req.body };
  writeJSON(GAMES_FILE, games);
  log(`Обновлена игра ID ${req.params.id}`);
  res.json(games[index]);
});

// Удалить игру
app.delete('/api/games/:id', auth, adminOnly, (req, res) => {
  let games = readJSON(GAMES_FILE);
  games = games.filter(g => g.id != req.params.id);
  writeJSON(GAMES_FILE, games);
  log(`Удалена игра ID ${req.params.id}`);
  res.json({ success: true });
});

// Загрузка торрент-файла (админ)
const storage = multer.diskStorage({
  destination: TORRENTS_DIR,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
app.post('/api/upload-torrent', auth, adminOnly, upload.single('torrent'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({ filename: req.file.filename, originalName: req.file.originalname });
});

// ================== ОТЗЫВЫ И КОММЕНТАРИИ ==================
// Отзывы к игре
app.get('/api/reviews/:gameId', (req, res) => {
  const reviews = readJSON(REVIEWS_FILE);
  const gameReviews = reviews.filter(r => r.gameId == req.params.gameId);
  // Сортируем по полезности и дате
  gameReviews.sort((a, b) => (b.likes - a.likes) || (new Date(b.createdAt) - new Date(a.createdAt)));
  res.json(gameReviews);
});

// Добавить отзыв (только авторизованные)
app.post('/api/reviews', auth, async (req, res) => {
  const { gameId, text, rating } = req.body;
  if (!gameId || !text || !rating) return res.status(400).json({ error: 'Заполните все поля' });
  if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Рейтинг от 1 до 5' });
  const reviews = readJSON(REVIEWS_FILE);
  // Проверка, не оставлял ли пользователь уже отзыв на эту игру
  const existing = reviews.find(r => r.userId === req.user.id && r.gameId == gameId);
  if (existing) return res.status(400).json({ error: 'Вы уже оставили отзыв на эту игру' });
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
  // Пересчёт среднего рейтинга игры
  const games = readJSON(GAMES_FILE);
  const gameIndex = games.findIndex(g => g.id == gameId);
  if (gameIndex !== -1) {
    const gameReviews = reviews.filter(r => r.gameId == gameId);
    const avg = gameReviews.reduce((s, r) => s + r.rating, 0) / gameReviews.length;
    games[gameIndex].rating = parseFloat(avg.toFixed(1));
    writeJSON(GAMES_FILE, games);
  }
  log(`Новый отзыв от ${req.user.username} на игру ${gameId}`);
  res.json(newReview);
});

// Лайк отзыва
app.post('/api/reviews/:id/like', auth, (req, res) => {
  let reviews = readJSON(REVIEWS_FILE);
  const review = reviews.find(r => r.id == req.params.id);
  if (!review) return res.status(404).json({ error: 'Отзыв не найден' });
  review.likes += 1;
  writeJSON(REVIEWS_FILE, reviews);
  res.json({ likes: review.likes });
});

// Комментарии к отзывам
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

// ================== ИЗБРАННОЕ ==================
app.post('/api/favorites', auth, (req, res) => {
  const { gameId } = req.body;
  let favs = readJSON(FAVORITES_FILE);
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

// ================== ИМПОРТ ИГР (ПАРСИНГ) ==================
app.post('/api/import', auth, adminOnly, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL не указан' });
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const $ = cheerio.load(data);
    // Пытаемся извлечь данные — адаптивно под разные сайты
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Импортированная игра';
    const description = $('meta[name="description"]').attr('content') || $('.description').text().trim() || 'Описание отсутствует';
    const size = $('.size').text() || $('[data-size]').attr('data-size') || 'N/A';
    const magnet = $('a[href^="magnet:"]').attr('href') || `magnet:?xt=urn:btih:IMPORTED_${Date.now()}`;
    const developer = $('.developer').text() || $('[itemprop="author"]').text() || 'Неизвестный';
    const releaseDate = $('.release-date').text() || $('[itemprop="datePublished"]').attr('content') || new Date().toISOString().split('T')[0];
    const screenshots = [];
    $('img.screenshot, .screenshot img').each((i, el) => {
      let src = $(el).attr('src');
      if (src && !src.startsWith('http')) src = new URL(src, url).href;
      if (src) screenshots.push(src);
    });
    if (screenshots.length === 0) screenshots.push('https://picsum.photos/id/100/800/450');
    const imported = {
      title: title.substring(0, 100),
      genre: 'Action',
      description: description.substring(0, 500),
      size,
      magnet,
      developer,
      releaseDate: releaseDate.substring(0, 10),
      screenshots: screenshots.slice(0, 4),
      tags: ['импорт']
    };
    log(`Импорт выполнен: ${url}`);
    res.json(imported);
  } catch (error) {
    log(`Ошибка импорта ${url}: ${error.message}`);
    res.status(500).json({ error: 'Ошибка парсинга', details: error.message });
  }
});

// ================== РЕКЛАМА ==================
app.get('/api/ads', (req, res) => {
  const ads = readJSON(ADS_FILE);
  res.json(ads.filter(a => a.active));
});
app.post('/api/ads', auth, adminOnly, (req, res) => {
  writeJSON(ADS_FILE, req.body);
  res.json({ success: true });
});

// ================== СТАТИСТИКА И ГРАФИКИ ==================
app.get('/api/stats', (req, res) => {
  const games = readJSON(GAMES_FILE);
  const users = readJSON(USERS_FILE);
  const totalDownloads = games.reduce((s, g) => s + (g.downloads || 0), 0);
  const totalSeeders = games.reduce((s, g) => s + g.seeders, 0);
  const totalLeechers = games.reduce((s, g) => s + g.leechers, 0);
  const topGames = [...games].sort((a, b) => b.downloads - a.downloads).slice(0, 5);
  res.json({
    totalGames: games.length,
    totalUsers: users.length,
    totalDownloads,
    totalSeeders,
    totalLeechers,
    topGames: topGames.map(g => ({ title: g.title, downloads: g.downloads, rating: g.rating }))
  });
});

// ================== ОБНОВЛЕНИЕ ПИРОВ (WebSocket + API) ==================
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

// ================== SITEMAP ==================
app.get('/sitemap.xml', (req, res) => {
  const games = readJSON(GAMES_FILE);
  let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  xml += `<url><loc>https://steamfall.com/</loc><priority>1.0</priority></url>`;
  games.forEach(game => {
    xml += `<url><loc>https://steamfall.com/game.html?id=${game.id}</loc><lastmod>${game.addedAt.split('T')[0]}</lastmod><priority>0.8</priority></url>`;
  });
  xml += '</urlset>';
  res.header('Content-Type', 'application/xml');
  res.send(xml);
});

// ================== WEB SOCKETS (ЧАТЫ В РЕАЛЬНОМ ВРЕМЕНИ) ==================
io.on('connection', (socket) => {
  log(`WebSocket клиент подключён: ${socket.id}`);
  socket.on('join-game', (gameId) => {
    socket.join(`game_${gameId}`);
    log(`Клиент ${socket.id} присоединился к комнате game_${gameId}`);
  });
  socket.on('chat-message', (data) => {
    io.to(`game_${data.gameId}`).emit('chat-message', {
      author: data.author,
      text: data.text,
      timestamp: new Date().toISOString()
    });
  });
  socket.on('disconnect', () => {
    log(`Клиент отключён: ${socket.id}`);
  });
});

// Запуск сервера
server.listen(PORT, () => {
  log(`🔥 SteamFall 2.0 запущен на http://localhost:${PORT}`);
  log(`Админка: http://localhost:${PORT}/admin.html (пароль admin123)`);
});