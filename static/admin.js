const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
if (!token) alert('Нет токена доступа');

async function apiAdmin(endpoint, method = 'GET', body = null) {
    const opts = { method, headers: {} };
    if (body) {
        opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        opts.body = new URLSearchParams({ ...body, token }).toString();
    } else if (method === 'GET') {
        endpoint += (endpoint.includes('?') ? '&' : '?') + `token=${token}`;
    }
    const res = await fetch(endpoint, opts);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function loadStats() {
    const stats = await apiAdmin('/admin/api/stats');
    document.getElementById('totalUsers').innerText = stats.total_users;
    document.getElementById('paidUsers').innerText = stats.paid_users;
    document.getElementById('logs24h').innerText = stats.logs_24h;
}

async function loadUsers() {
    const users = await apiAdmin('/admin/api/users');
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '';
    for (const u of users) {
        const row = tbody.insertRow();
        row.insertCell(0).innerText = u.user_id;
        row.insertCell(1).innerText = u.username || '—';
        row.insertCell(2).innerText = new Date(u.registered_at).toLocaleString();
        row.insertCell(3).innerHTML = u.paid ? '✅ Да' : '❌ Нет';
        const cell = row.insertCell(4);
        if (!u.paid) {
            const btn = document.createElement('button');
            btn.innerText = 'Активировать';
            btn.onclick = async () => {
                await apiAdmin('/admin/api/set_paid', 'POST', { user_id: u.user_id, paid: 'true' });
                loadUsers();
                loadStats();
            };
            cell.appendChild(btn);
        } else {
            cell.innerText = '—';
        }
    }
}

// График активности (можно дополнить реальными данными)
const ctx = document.getElementById('activityChart').getContext('2d');
new Chart(ctx, {
    type: 'line',
    data: {
        labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
        datasets: [{ label: 'Активность', data: [12, 19, 3, 5, 2, 3, 7], borderColor: '#3B82F6', tension: 0.3 }]
    },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#E2E8F0' } } } }
});

loadStats();
loadUsers();
