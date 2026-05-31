import os
import pickle
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

YOOMONEY_ACCESS_TOKEN = os.getenv("YOOMONEY_ACCESS_TOKEN")

def get_user_token_dir(user_id: int) -> str:
    os.makedirs("tokens", exist_ok=True)
    path = f"tokens/{user_id}"
    os.makedirs(path, exist_ok=True)
    return path

def save_creds(user_id: int, creds, service: str):
    with open(f"{get_user_token_dir(user_id)}/{service}.pickle", "wb") as f:
        pickle.dump(creds, f)

def load_creds(user_id: int, service: str):
    path = f"{get_user_token_dir(user_id)}/{service}.pickle"
    if os.path.exists(path):
        with open(path, "rb") as f:
            return pickle.load(f)
    return None

def check_yoomoney_payment(label: str) -> bool:
    """Проверяет, был ли платёж на кошелек 4100118620135634 с указанной меткой"""
    if not YOOMONEY_ACCESS_TOKEN:
        return False
    url = "https://yoomoney.ru/api/operation-history"
    headers = {"Authorization": f"Bearer {YOOMONEY_ACCESS_TOKEN}"}
    params = {"label": label, "records": 20}
    resp = requests.post(url, headers=headers, data=params)
    data = resp.json()
    for op in data.get("operations", []):
        if op.get("status") == "success" and op.get("label") == label:
            return True
    return False

def generate_payment_label(user_id: int) -> str:
    return f"slate_{user_id}_{int(datetime.now().timestamp())}"
