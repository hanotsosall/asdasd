const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let userId = tg.initDataUnsafe.user?.id;
if (!userId) userId = prompt("Введите ваш Telegram ID");
document.getElementById('userIdSpan').innerText = userId;

async function apiCall(endpoint, method = 'POST', body = null) {
    const headers = { 'X-User-Id': userId };
    const options = { method, headers };
    if (body) {
        if (body instanceof FormData) options.body = body;
        else { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    }
    const resp = await fetch(endpoint, options);
    if (resp.status === 403) {
        tg.showAlert('Доступ не оплачен. Оплатите 500 ₽.');
        return null;
    }
    return resp.json();
}

async function loadProfile() {
    const data = await apiCall('/api/profile', 'GET');
    if (!data) return;
    if (data.paid) {
        document.getElementById('paidBadge').className = 'badge badge-success';
        document.getElementById('paidBadge').innerText = '✅ Активен';
        document.getElementById('statusText').innerHTML = '🟢 Доступ активирован';
        document.getElementById('buyBtn').style.display = 'none';
    } else {
        document.getElementById('paidBadge').className = 'badge badge-warning';
        document.getElementById('paidBadge').innerText = '❌ Не оплачен';
        document.getElementById('statusText').innerHTML = '🔴 Требуется оплата';
        document.getElementById('buyBtn').style.display = 'block';
    }
    for (const [srv, ok] of Object.entries(data.services)) {
        const badge = document.getElementById(`${srv}Status`);
        if (badge) badge.innerText = ok ? '✅ авторизован' : '⚪ не авторизован';
    }
}

function togglePanel(header) {
    const panel = header.parentElement.querySelector('.panel');
    panel.classList.toggle('open');
}

document.getElementById('buyBtn')?.addEventListener('click', async () => {
    await apiCall('/api/payment/notify', 'POST', new URLSearchParams({ user_id: userId }));
    tg.showAlert('Запрос отправлен администратору. После оплаты 500₽ доступ будет активирован.');
});

// Обработчики для clean-кнопок
document.querySelectorAll('.clean-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const service = btn.dataset.service;
        const resultDiv = document.getElementById(`${service}Result`);
        resultDiv.innerText = '⏳ Выполняется...';
        const resp = await apiCall(`/api/clean/${service}`, 'POST');
        if (resp) resultDiv.innerText = resp.message || 'Готово.';
    });
});

// VK
document.getElementById('vkSaveBtn')?.addEventListener('click', async () => {
    const token = document.getElementById('vkTokenInput').value.trim();
    if (!token) return tg.showAlert('Введите токен');
    const resp = await apiCall('/api/clean/vk', 'POST', new URLSearchParams({ token }));
    document.getElementById('vkResult').innerText = resp.message;
    loadProfile();
});
document.getElementById('vkCleanBtn')?.addEventListener('click', async () => {
    const resultDiv = document.getElementById('vkResult');
    resultDiv.innerText = '⏳ Выполняется...';
    const resp = await apiCall('/api/clean/vk', 'POST');
    if (resp) resultDiv.innerText = resp.message;
});

// Instagram
document.getElementById('instaSaveBtn')?.addEventListener('click', async () => {
    const username = document.getElementById('instaUser').value.trim();
    const password = document.getElementById('instaPass').value.trim();
    if (!username || !password) return tg.showAlert('Введите логин и пароль');
    const fd = new FormData();
    fd.append('username', username);
    fd.append('password', password);
    const resp = await apiCall('/api/clean/instagram', 'POST', fd);
    document.getElementById('instagramResult').innerText = resp.message;
    loadProfile();
});
document.getElementById('instaCleanBtn')?.addEventListener('click', async () => {
    const resultDiv = document.getElementById('instagramResult');
    resultDiv.innerText = '⏳ Выполняется...';
    const resp = await apiCall('/api/clean/instagram', 'POST');
    if (resp) resultDiv.innerText = resp.message;
});

// Анализ карты
document.getElementById('cardUploadBtn')?.addEventListener('click', () => {
    document.getElementById('cardFileInput').click();
});
document.getElementById('cardFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const resp = await apiCall('/api/check/card', 'POST', fd);
    document.getElementById('cardResult').innerText = resp.message;
});

// Проверка утечек
document.getElementById('breachCheckBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('breachEmailInput').value.trim();
    if (!email) return tg.showAlert('Введите email');
    const resp = await apiCall('/api/check/breaches', 'POST', new URLSearchParams({ email }));
    document.getElementById('breachResult').innerText = resp.message;
});

// Генерация письма
document.getElementById('letterGenBtn')?.addEventListener('click', async () => {
    const service = document.getElementById('letterServiceInput').value.trim();
    const email = document.getElementById('letterEmailInput').value.trim();
    if (!service || !email) return tg.showAlert('Заполните оба поля');
    const resp = await apiCall('/api/generate/letter', 'POST', new URLSearchParams({ service, email }));
    document.getElementById('letterResult').innerHTML = `<pre style="white-space: pre-wrap;">${resp.message}</pre>`;
});

// ИИ-совет
document.getElementById('aiAdviceBtn')?.addEventListener('click', async () => {
    const resp = await apiCall('/api/ai/advice', 'GET');
    document.getElementById('aiResult').innerText = resp.message;
});

// Вкладки
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        const tabId = btn.dataset.tab;
        document.getElementById(`tab-${tabId}`).classList.add('active');
    });
});

loadProfile();
