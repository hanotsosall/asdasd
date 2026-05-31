# В начало main.py добавить импорт
from fastapi.responses import HTMLResponse
import os

# Добавить эндпоинт для отдачи страницы помощи
@app.get("/help", response_class=HTMLResponse)
async def help_page():
    with open("static/help.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

# Исправленный payment/notify (принимает user_id из query string)
@app.post("/api/payment/notify")
async def payment_notify(user_id: int = Query(...)):
    logging.info(f"User {user_id} requested payment activation")
    BOT_TOKEN = os.getenv("BOT_TOKEN")
    ADMIN_ID = os.getenv("ADMIN_ID")
    if BOT_TOKEN and ADMIN_ID:
        import requests
        text = f"💰 Пользователь {user_id} запросил активацию. Переведите 500₽ на 4100118620135634 с комментарием {user_id}, затем активируйте /pay {user_id}"
        try:
            requests.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json={"chat_id": ADMIN_ID, "text": text})
        except Exception as e:
            logging.error(f"Notify error: {e}")
    return {"status": "ok"}
