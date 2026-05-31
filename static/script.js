const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let userId = tg.initDataUnsafe.user?.id;
if (!userId) userId = prompt('Введите ваш Telegram ID');
document.getElementById('userIdDisplay').innerText = userId;
let paid = false;

// Вспомогательные функции UI
function setBadge(elementId, text, type) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    badge.innerText = text;
    badge.className = 'badge ';
    if (type === 'success') badge.classList.add('badge-success');
    else if (type === 'error') badge.classList.add('badge-error');
    else if (type === 'warning') badge.classList.add('badge-warning');
    else badge.classList.add('badge-neutral');
}

function updateUI() {
    if (paid) {
        setBadge('paidBadge', '✅ Активен', 'success');
        document.getElementById('buyButton').style.display = 'none';
    } else {
        setBadge('paidBadge', '❌ Не оплачен', 'error');
        document.getElementById('buyButton').style.display = 'block';
    }
}

async function apiCall(endpoint, method = 'POST', body = null) {
    const headers = { 'X-User-Id': userId };
    const options = { method, headers };
    if (body) {
        if (body instanceof FormData) {
            options.body = body;
        } else {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }
    const response = await fetch(endpoint, options);
    return response.json();
}

function showResult(elementId, message, isError = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerText = message;
    if (isError) el.style.borderLeftColor = '#E74C3C';
    else el.style.borderLeftColor = '#2A6B4E';
    el.classList.add('visible');
    setTimeout(() => {
        el.classList.remove('visible');
    }, 5000);
}

async function loadProfile() {
    try {
        const data = await apiCall('/api/profile', 'GET');
        paid = data.paid;
        updateUI();
        const services = data.services;
        for (const [srv, ok] of Object.entries(services)) {
            const badge = document.getElementById(`${srv}StatusBadge`);
            const cleanBtn = document.getElementById(`${srv}CleanBtn`);
            if (badge) {
                badge.innerText = ok ? 'авторизован' : 'не авторизован';
                badge.className = ok ? 'badge badge-success' : 'badge badge-neutral';
            }
            if (cleanBtn) {
                if (ok && paid) {
                    cleanBtn.innerText = '▶ Запустить очистку';
                    cleanBtn.disabled = false;
                    cleanBtn.classList.remove('btn-disabled');
                    cleanBtn.classList.add('btn-primary');
                } else {
                    cleanBtn.innerText = ok ? '⏳ Оплатите доступ' : '🔐 Требуется авторизация';
                    cleanBtn.disabled = true;
                    cleanBtn.classList.remove('btn-primary');
                    cleanBtn.classList.add('btn-disabled');
                }
            }
        }
        document.getElementById('skeleton').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';
    } catch(e) {
        console.error(e);
        document.getElementById('skeleton').innerHTML = '<div style="color:red;">Ошибка загрузки профиля</div>';
    }
}

function toggleService(serviceName) {
    const panel = document.getElementById(`${serviceName}Panel`);
    if (panel) panel.classList.toggle('open');
}

async function cleanService(service, extraData = null) {
    const resultDiv = document.getElementById(`${service}Result`);
    if (!resultDiv) return;
    resultDiv.innerText = '⏳ Выполняется...';
    resultDiv.classList.add('visible');
    const formData = new FormData();
    if (extraData) {
        Object.entries(extraData).forEach(([k,v]) => formData.append(k,v));
    }
    const resp = await apiCall(`/api/clean/${service}`, 'POST', formData);
    if (resp.status === 'auth_required') {
        resultDiv.innerHTML = `🔐 Требуется авторизация: <a href="${resp.auth_url}" target="_blank" style="color:#2ECC71;">Перейти</a><br>После авторизации вернитесь и нажмите очистку снова.`;
    } else if (resp.status === 'need_token') {
        resultDiv.innerText = resp.message + ' Введите токен в поле выше.';
    } else if (resp.status === 'need_credentials') {
        resultDiv.innerText = resp.message + ' Введите логин/пароль.';
    } else {
        resultDiv.innerText = resp.message || 'Готово.';
    }
    loadProfile();
}

// Раскрытие панелей
document.querySelectorAll('.service-row').forEach(row => {
    row.addEventListener('click', () => {
        const service = row.dataset.service;
        if (service) toggleService(service);
    });
});

// Кнопки очистки
document.getElementById('gmailCleanBtn')?.addEventListener('click', () => cleanService('gmail'));
document.getElementById('driveCleanBtn')?.addEventListener('click', () => cleanService('drive'));
document.getElementById('twitterCleanBtn')?.addEventListener('click', () => cleanService('twitter'));

// VK
document.getElementById('vkSaveBtn')?.addEventListener('click', async () => {
    const token = document.getElementById('vkTokenInput').value.trim();
    if (!token) return tg.showAlert('Введите VK Access Token');
    const resp = await apiCall('/api/clean/vk', 'POST', new URLSearchParams({ token }));
    showResult('vkResult', resp.message);
    loadProfile();
});
document.getElementById('vkCleanBtn')?.addEventListener('click', () => cleanService('vk'));

// Instagram
document.getElementById('instaSaveBtn')?.addEventListener('click', async () => {
    const username = document.getElementById('instaUser').value.trim();
    const password = document.getElementById('instaPass').value.trim();
    if (!username || !password) return tg.showAlert('Введите логин и пароль');
    const fd = new FormData();
    fd.append('username', username);
    fd.append('password', password);
    const resp = await apiCall('/api/clean/instagram', 'POST', fd);
    showResult('instagramResult', resp.message);
    loadProfile();
});
document.getElementById('instaCleanBtn')?.addEventListener('click', () => cleanService('instagram'));

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
    showResult('cardResult', resp.message);
});

// Проверка утечек
document.getElementById('breachCheckBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('breachEmailInput').value.trim();
    if (!email) return tg.showAlert('Введите email');
    const fd = new FormData();
    fd.append('email', email);
    const resp = await apiCall('/api/check/breaches', 'POST', fd);
    showResult('breachResult', resp.message);
});

// Генерация письма
document.getElementById('letterGenBtn')?.addEventListener('click', async () => {
    const service = document.getElementById('letterServiceInput').value.trim();
    const email = document.getElementById('letterEmailInput').value.trim();
    if (!service || !email) return tg.showAlert('Заполните оба поля');
    const fd = new FormData();
    fd.append('service', service);
    fd.append('email', email);
    const resp = await apiCall('/api/generate/letter', 'POST', fd);
    showResult('letterResult', resp.message);
});

// ИИ‑совет
document.getElementById('aiAdviceBtn')?.addEventListener('click', async () => {
    const resp = await apiCall('/api/ai/advice', 'GET');
    showResult('aiResult', resp.message);
});

// Оплата
document.getElementById('buyButton')?.addEventListener('click', () => {
    apiCall('/api/payment/notify', 'POST', new URLSearchParams({ user_id: userId })).then(() => {
        tg.showAlert('Запрос отправлен администратору. После оплаты 500 ₽ на кошелёк 4100118620135634 (с указанием Telegram ID) доступ будет активирован.');
    });
});

document.getElementById('infoBtn')?.addEventListener('click', () => {
    tg.openLink('/static/help.html');
});

// Старт
loadProfile();
