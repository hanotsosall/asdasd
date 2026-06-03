function renderGames(games) {
  if (!games.length) {
    gamesGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center;">Игры не найдены</div>';
    return;
  }
  gamesGrid.innerHTML = games.map(game => `
    <div class="game-card" data-id="${game.id}">
      <div class="card-img" style="background-image: url('${game.screenshots?.[0] || 'https://picsum.photos/id/0/300/140'}');"></div>
      <div class="card-content">
        <div class="game-title">${escapeHtml(game.title)}</div>
        <div class="genre">${escapeHtml(game.genre)}</div>
        <div class="details">
          <span><i class="fas fa-hdd"></i> ${game.size}</span>
          <span><i class="fas fa-arrow-up"></i> ${game.seeders}</span>
          <span><i class="fas fa-star"></i> ${game.rating || '—'}</span>
        </div>
        <p class="game-short-desc">${escapeHtml(game.description.substring(0, 80))}…</p>
        <button class="download-btn" data-magnet="${escapeHtml(game.magnet)}">⬇️ Скачать торрент</button>
        <a href="/game.html?id=${game.id}" class="details-link">Подробнее →</a>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const magnet = btn.getAttribute('data-magnet');
      if (magnet && magnet !== 'undefined') {
        window.open(magnet, '_blank');
        showToast('Торрент запущен в вашем клиенте');
      } else {
        showToast('Ссылка временно недоступна', true);
      }
    });
  });
}
