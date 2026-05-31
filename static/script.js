const tg = window.Telegram.WebApp;
tg.ready(); tg.expand();
let userId = tg.initDataUnsafe.user?.id;
if (!userId) userId = prompt("Введите ваш Telegram ID");

document.getElementById('userIdSpan').innerText = userId;

async function apiCall(endpoint, method='POST', body=null) {
    const headers = { 'X-User-Id': userId };
    const options = { method, headers };
    if (body) {
        if (body instanceof FormData) options.body = body;
        else { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    }
    const resp = await fetch(endpoint, options);
    return resp.json();
}

async function loadProfile() {
    const data = await apiCall('/api/profile', 'GET');
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

document.querySelectorAll('.clean-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const service = btn.dataset.service;
        const resultDiv = document.getElementById(`${service}Result`);
        resultDiv.innerText = '⏳ Выполняется...';
        const resp = await apiCall(`/api/clean/${service}`, 'POST');
        resultDiv.innerText = resp.message || 'Готово.';
    });
});

loadProfile();
