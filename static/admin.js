const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
if (!token) alert('Нет токена');

async function apiAdmin(endpoint, method='GET', body=null) {
    const opts = { method, headers: {} };
    if (body) {
        opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        opts.body = new URLSearchParams({...body, token});
    } else if (method === 'GET') {
        endpoint += `?token=${token}`;
    }
    const res = await fetch(endpoint, opts);
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
    users.forEach(u => {
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
                loadUsers(); loadStats();
            };
            cell.appendChild(btn);
        } else {
            cell.innerText = '—';
        }
    });
}

loadStats(); loadUsers();
