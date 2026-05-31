// Получаем user_id из Telegram WebApp
let tg = window.Telegram.WebApp;
tg.ready();
let userId = tg.initDataUnsafe.user?.id;
if (!userId) {
    // fallback: можно запросить ввод
    userId = prompt("Введите ваш Telegram ID");
}

// Все запросы будут добавлять заголовок X-User-Id
function apiCall(endpoint, method = 'POST', body = null) {
    let headers = {
        'X-User-Id': userId,
        'Content-Type': 'application/json'
    };
    let options = { method, headers };
    if (body) {
        if (body instanceof FormData) {
            delete headers['Content-Type'];
            options.body = body;
        } else {
            options.body = JSON.stringify(body);
        }
    }
    return fetch(endpoint, options).then(r => r.json());
}

// Загрузка профиля
async function loadProfile() {
    try {
        let data = await apiCall('/api/profile', 'GET');
        if (data.paid) {
            document.getElementById('paidStatus').innerHTML = '✅ Оплачен';
            document.getElementById('paidStatus').classList.remove('bg-red-600');
            document.getElementById('paidStatus').classList.add('bg-green-600');
        }
        let servicesHtml = '';
        for (let [srv, ok] of Object.entries(data.services)) {
            servicesHtml += `${srv}: ${ok ? '✅' : '❌'} `;
            let statusSpan = document.getElementById(`${srv}Status`);
            if (statusSpan) statusSpan.innerText = ok ? '✅ авторизован' : '⚪ не авторизован';
        }
        document.getElementById('servicesStatus').innerHTML = servicesHtml;
    } catch(e) { console.error(e); }
}

function toggleService(service) {
    let panel = document.getElementById(`${service}Panel`);
    if (panel) panel.classList.toggle('hidden');
}

async function cleanService(service) {
    let resultDiv = document.getElementById(`${service}Result`);
    resultDiv.innerHTML = '⏳ Выполняется...';
    let formData = new FormData();
    if (service === 'vk') {
        let token = document.getElementById('vkToken').value;
        if (token) formData.append('token', token);
    } else if (service === 'instagram') {
        let username = document.getElementById('instaUser').value;
        let password = document.getElementById('instaPass').value;
        if (username && password) {
            formData.append('username', username);
            formData.append('password', password);
        }
    }
    let resp = await apiCall(`/api/clean/${service}`, 'POST', formData);
    if (resp.status === 'auth_required') {
        resultDiv.innerHTML = `Требуется авторизация: <a href="${resp.auth_url}" target="_blank">Перейти</a>`;
    } else if (resp.status === 'need_token') {
        resultDiv.innerHTML = resp.message + ' Введите токен в поле выше.';
    } else if (resp.status === 'need_credentials') {
        resultDiv.innerHTML = resp.message + ' Введите логин/пароль.';
    } else {
        resultDiv.innerHTML = resp.message || 'Готово.';
    }
    loadProfile(); // обновить статусы
}

function saveVkToken() {
    let token = document.getElementById('vkToken').value;
    if (!token) return;
    apiCall('/api/clean/vk', 'POST', new URLSearchParams({ token })).then(resp => {
        document.getElementById('vkResult').innerHTML = resp.message;
        loadProfile();
    });
}

function saveInstagram() {
    let username = document.getElementById('instaUser').value;
    let password = document.getElementById('instaPass').value;
    if (!username || !password) return;
    let fd = new FormData();
    fd.append('username', username);
    fd.append('password', password);
    apiCall('/api/clean/instagram', 'POST', fd).then(resp => {
        document.getElementById('instagramResult').innerHTML = resp.message;
        loadProfile();
    });
}

function checkCard() {
    document.getElementById('cardFile').click();
}

function uploadCard() {
    let file = document.getElementById('cardFile').files[0];
    if (!file) return;
    let fd = new FormData();
    fd.append('file', file);
    apiCall('/api/check/card', 'POST', fd).then(resp => {
        document.getElementById('otherResult').innerHTML = resp.message;
    });
}

function checkBreaches() {
    let email = document.getElementById('emailBreach').value;
    if (!email) return;
    let fd = new FormData();
    fd.append('email', email);
    apiCall('/api/check/breaches', 'POST', fd).then(resp => {
        document.getElementById('otherResult').innerHTML = resp.message;
    });
}

function generateLetter() {
    let service = document.getElementById('serviceName').value;
    let email = document.getElementById('accountEmail').value;
    if (!service || !email) return;
    let fd = new FormData();
    fd.append('service', service);
    fd.append('email', email);
    apiCall('/api/generate/letter', 'POST', fd).then(resp => {
        document.getElementById('otherResult').innerHTML = `<pre class="whitespace-pre-wrap">${resp.message}</pre>`;
    });
}

function getAiAdvice() {
    apiCall('/api/ai/advice', 'GET').then(resp => {
        document.getElementById('otherResult').innerHTML = resp.message;
    });
}

document.getElementById('buyBtn').addEventListener('click', () => {
    apiCall('/api/payment/notify', 'POST', new URLSearchParams({ user_id: userId })).then(() => {
        alert('Запрос отправлен администратору. После оплаты 500 ₽ на кошелек 4100118620135634 вам активируют доступ.');
    });
});

loadProfile();
