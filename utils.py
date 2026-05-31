import os
import pickle
import io
import requests
import pandas as pd
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
    except Exception as e:
        return f"🔐 Не удалось проверить утечки: {e}"

def parse_bank_statement(file_content: bytes, filename: str) -> str:
    try:
        df = pd.read_csv(io.BytesIO(file_content))
        desc_col = None
        amount_col = None
        for col in df.columns:
            if 'description' in col.lower() or 'назначение' in col.lower() or 'описание' in col.lower():
                desc_col = col
            if 'amount' in col.lower() or 'сумма' in col.lower():
                amount_col = col
        if desc_col is None or amount_col is None:
            return "❌ Не найдены столбцы с описанием и суммой."
        subs = df.groupby(desc_col).size().reset_index(name='count')
        subs = subs[subs['count'] >= 2]
        if subs.empty:
            return "✅ Регулярных платежей (повтор ≥2) не обнаружено."
        result = "💳 Найдены потенциальные подписки:\n"
        for _, row in subs.head(10).iterrows():
            result += f"- {row[desc_col]} (повтор {row['count']} раз)\n"
        return result
    except Exception as e:
        return f"Ошибка парсинга: {e}"
