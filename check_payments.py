import os
import re
import requests
from dotenv import load_dotenv

load_dotenv()
ACCESS_TOKEN = os.getenv("YOOMONEY_ACCESS_TOKEN")  # если есть

def check_payments():
    if not ACCESS_TOKEN:
        print("Нет токена ЮMoney. Ручное подтверждение.")
        return
    url = "https://yoomoney.ru/api/operation-history"
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}
    resp = requests.post(url, headers=headers, data={"records": 10})
    data = resp.json()
    for op in data.get("operations", []):
        if op["status"] == "success" and op["amount"] == "500":
            comment = op.get("comment", "")
            match = re.search(r'\d+', comment)
            if match:
                user_id = match.group(0)
                print(f"Платёж от {user_id}")

if __name__ == "__main__":
    check_payments()
