import os
import pickle
import io
import json
import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

def get_user_dir(user_id: int) -> str:
    path = f"tokens/{user_id}"
    os.makedirs(path, exist_ok=True)
    return path

def save_creds(user_id: int, creds, service: str):
    with open(f"{get_user_dir(user_id)}/{service}.pickle", "wb") as f:
        pickle.dump(creds, f)

def load_creds(user_id: int, service: str):
    path = f"{get_user_dir(user_id)}/{service}.pickle"
    if os.path.exists(path):
        with open(path, "rb") as f:
            return pickle.load(f)
    return None

# Paid users persistence
PAID_FILE = "paid_users.json"

def load_paid_users():
    if os.path.exists(PAID_FILE):
        with open(PAID_FILE, "r") as f:
            return set(json.load(f))
    return set()

def save_paid_users(users_set):
    with open(PAID_FILE, "w") as f:
        json.dump(list(users_set), f)

def add_paid_user(user_id):
    users = load_paid_users()
    users.add(user_id)
    save_paid_users(users)

def is_paid(user_id):
    return user_id in load_paid_users()

def check_hibp(email: str) -> str:
    api_key = os.getenv("HIBP_API_KEY")
    url = f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}"
    headers = {'hibp-api-key': api_key} if api_key else {}
    try:
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            breaches = resp.json()
            names = [b['Name'] for b in breaches[:5]]
            return f"⚠️ Email найден в {len(breaches)} утечках: {', '.join(names)}"
        elif resp.status_code == 404:
            return "✅ Email не найден в известных утечках."
        else:
            return f"❌ Ошибка API: {resp.status_code}"
    except:
        return "🔐 Не удалось проверить утечки."

def parse_bank_statement(file_content: bytes, filename: str) -> str:
    try:
        df = pd.read_csv(io.BytesIO(file_content))
        desc_col = None
        amount_col = None
        for col in df.columns:
            if 'description' in col.lower() or 'описание' in col.lower():
                desc_col = col
            if 'amount' in col.lower() or 'сумма' in col.lower():
                amount_col = col
        if desc_col is None or amount_col is None:
            return "❌ Не найдены столбцы с описанием и суммой."
        subs = df.groupby(desc_col).size().reset_index(name='count')
        subs = subs[subs['count'] >= 2]
        if subs.empty:
            return "✅ Регулярных платежей не обнаружено."
        result = "💳 Найдены потенциальные подписки:\n"
        for _, row in subs.head(10).iterrows():
            result += f"- {row[desc_col]} (повтор {row['count']} раз)\n"
        return result
    except Exception as e:
        return f"Ошибка парсинга: {e}"
