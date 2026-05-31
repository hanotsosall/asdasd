import sqlite3
import json
from datetime import datetime
from typing import List, Dict, Any

DB_PATH = "slateclean.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        # Пользователи
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                registered_at TEXT,
                paid BOOLEAN DEFAULT 0,
                paid_at TEXT
            )
        ''')
        # Токены пользователей (можно и в файлах, но для админки удобно видеть)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS user_tokens (
                user_id INTEGER,
                service TEXT,
                has_token BOOLEAN DEFAULT 0,
                PRIMARY KEY (user_id, service)
            )
        ''')
        # Логи действий
        conn.execute('''
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT,
                details TEXT,
                timestamp TEXT
            )
        ''')
        # Статистика
        conn.execute('''
            CREATE TABLE IF NOT EXISTS stats (
                key TEXT PRIMARY KEY,
                value INTEGER
            )
        ''')
        # Админ-токен (генерируется при первом запуске)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS admin (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                token TEXT,
                created_at TEXT
            )
        ''')
        # Создаём админ-токен, если нет
        row = conn.execute("SELECT token FROM admin WHERE id=1").fetchone()
        if not row:
            import secrets
            token = secrets.token_urlsafe(32)
            conn.execute("INSERT INTO admin (id, token, created_at) VALUES (1, ?, ?)",
                         (token, datetime.now().isoformat()))
        conn.commit()

def register_user(user_id: int, username: str = "", first_name: str = "", last_name: str = ""):
    with get_db() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE user_id=?", (user_id,)).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO users (user_id, username, first_name, last_name, registered_at, paid, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (user_id, username, first_name, last_name, datetime.now().isoformat(), 0, None)
            )
            conn.commit()
            log_action(user_id, "register", f"User {user_id} registered")

def set_paid(user_id: int, paid: bool = True):
    with get_db() as conn:
        conn.execute("UPDATE users SET paid=?, paid_at=? WHERE user_id=?", 
                     (1 if paid else 0, datetime.now().isoformat() if paid else None, user_id))
        conn.commit()
        log_action(user_id, "payment_activated" if paid else "payment_deactivated", f"Paid={paid}")

def is_paid(user_id: int) -> bool:
    with get_db() as conn:
        row = conn.execute("SELECT paid FROM users WHERE user_id=?", (user_id,)).fetchone()
        return row is not None and row['paid'] == 1

def log_action(user_id: int, action: str, details: str = ""):
    with get_db() as conn:
        conn.execute("INSERT INTO logs (user_id, action, details, timestamp) VALUES (?, ?, ?, ?)",
                     (user_id, action, details, datetime.now().isoformat()))
        conn.commit()

def get_all_users() -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY registered_at DESC").fetchall()
        return [dict(row) for row in rows]

def get_user_tokens_status(user_id: int) -> Dict[str, bool]:
    with get_db() as conn:
        rows = conn.execute("SELECT service, has_token FROM user_tokens WHERE user_id=?", (user_id,)).fetchall()
        return {row['service']: bool(row['has_token']) for row in rows}

def set_user_token_status(user_id: int, service: str, has_token: bool):
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO user_tokens (user_id, service, has_token) VALUES (?, ?, ?)",
                     (user_id, service, 1 if has_token else 0))
        conn.commit()

def get_stats() -> Dict[str, int]:
    with get_db() as conn:
        total_users = conn.execute("SELECT COUNT(*) as cnt FROM users").fetchone()['cnt']
        paid_users = conn.execute("SELECT COUNT(*) as cnt FROM users WHERE paid=1").fetchone()['cnt']
        logs_24h = conn.execute(
            "SELECT COUNT(*) as cnt FROM logs WHERE timestamp > datetime('now', '-1 day')"
        ).fetchone()['cnt']
        return {"total_users": total_users, "paid_users": paid_users, "logs_24h": logs_24h}

def get_admin_token() -> str:
    with get_db() as conn:
        row = conn.execute("SELECT token FROM admin WHERE id=1").fetchone()
        return row['token'] if row else None
