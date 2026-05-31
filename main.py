import os
import json
import logging
from fastapi import FastAPI, Request, Form, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from typing import Optional

# Подключаем наши модули
import utils
from cleaners import gmail_cleaner, drive_cleaner, twitter_cleaner, instagram_cleaner, vk_cleaner, account_deleter, ai_advisor

load_dotenv()
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://localhost:8000")

app = FastAPI(title="SlateClean Mini App")

# Статические файлы (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Временное хранилище для сессий пользователей (в реальности БД)
user_sessions = {}  # {user_id: {"paid": bool, "temp_data": {}}}

# ---------- Вспомогательные функции ----------
def get_user_id_from_request(request: Request) -> int:
    """Извлекает user_id из initData или заголовка"""
    # В Telegram Mini App данные передаются в заголовке X-Telegram-User-Id или в initData
    # Для простоты будем передавать в параметре или заголовке
    user_id = request.headers.get("X-User-Id")
    if user_id:
        return int(user_id)
    raise HTTPException(status_code=401, detail="User ID required")

# ---------- Маршруты для фронтенда ----------
@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/api/profile")
async def get_profile(user_id: int = Depends(get_user_id_from_request)):
    paid = user_sessions.get(user_id, {}).get("paid", False)
    gmail_ok = utils.load_creds(user_id, "gmail") is not None
    drive_ok = utils.load_creds(user_id, "drive") is not None
    twitter_ok = utils.load_creds(user_id, "twitter") is not None
    vk_ok = utils.load_creds(user_id, "vk") is not None
    insta_ok = utils.load_creds(user_id, "instagram") is not None
    return {
        "user_id": user_id,
        "paid": paid,
        "services": {
            "gmail": gmail_ok,
            "drive": drive_ok,
            "twitter": twitter_ok,
            "vk": vk_ok,
            "instagram": insta_ok
        }
    }

@app.post("/api/payment/notify")
async def payment_notify(user_id: int = Form(...)):
    """Уведомление от пользователя о платеже (админ увидит в боте)"""
    # Здесь можно отправить уведомление админу через бота (импорт bot)
    # Но для простоты запишем в лог
    logging.info(f"User {user_id} requested payment activation")
    # В реальности: отправить сообщение админу в Telegram
    return {"status": "ok"}

# Эндпоинты для очистки (только для оплаченных)
def check_paid(user_id: int):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Access not paid")

@app.post("/api/clean/gmail")
async def clean_gmail(request: Request, user_id: int = Depends(get_user_id_from_request)):
    check_paid(user_id)
    creds = utils.load_creds(user_id, "gmail")
    if not creds:
        # Генерируем URL авторизации
        url, flow = gmail_cleaner.get_auth_url()
        # Сохраняем flow в сессию (в реальности в БД)
        user_sessions.setdefault(user_id, {})["gmail_flow"] = flow
        return {"status": "auth_required", "auth_url": url}
    else:
        # Выполняем очистку
        result1 = gmail_cleaner.delete_old_emails(user_id, keep_days=30)
        result2 = gmail_cleaner.unsubscribe_all(user_id)
        return {"status": "success", "message": f"{result1}\n{result2}"}

@app.post("/api/clean/drive")
async def clean_drive(request: Request, user_id: int = Depends(get_user_id_from_request)):
    check_paid(user_id)
    creds = utils.load_creds(user_id, "drive")
    if not creds:
        url, flow = drive_cleaner.get_auth_url()
        user_sessions.setdefault(user_id, {})["drive_flow"] = flow
        return {"status": "auth_required", "auth_url": url}
    else:
        result1 = drive_cleaner.delete_duplicates(user_id)
        result2 = drive_cleaner.delete_old_files(user_id, days=180)
        return {"status": "success", "message": f"{result1}\n{result2}"}

@app.post("/api/clean/twitter")
async def clean_twitter(request: Request, user_id: int = Depends(get_user_id_from_request)):
    check_paid(user_id)
    creds = utils.load_creds(user_id, "twitter")
    if not creds:
        url, auth = twitter_cleaner.get_auth_url()
        user_sessions.setdefault(user_id, {})["twitter_auth"] = auth
        return {"status": "auth_required", "auth_url": url}
    else:
        result = twitter_cleaner.clean_with_existing_tokens(user_id)
        return {"status": "success", "message": result}

@app.post("/api/clean/vk")
async def clean_vk(request: Request, user_id: int = Depends(get_user_id_from_request), token: str = Form(None)):
    check_paid(user_id)
    if token:
        vk_cleaner.save_token(user_id, token)
        return {"status": "token_saved", "message": "Токен сохранён. Нажмите очистить снова."}
    creds = utils.load_creds(user_id, "vk")
    if not creds:
        return {"status": "need_token", "message": "Введите VK Access Token"}
    result = vk_cleaner.clean(user_id, creds)
    return {"status": "success", "message": result}

@app.post("/api/clean/instagram")
async def clean_instagram(request: Request, user_id: int = Depends(get_user_id_from_request), username: str = Form(None), password: str = Form(None)):
    check_paid(user_id)
    if username and password:
        instagram_cleaner.save_credentials(user_id, username, password)
        return {"status": "token_saved", "message": "Данные сохранены. Нажмите очистить снова."}
    creds = utils.load_creds(user_id, "instagram")
    if not creds:
        return {"status": "need_credentials", "message": "Введите логин и пароль"}
    result = instagram_cleaner.clean(user_id)
    return {"status": "success", "message": result}

@app.post("/api/check/card")
async def check_card(user_id: int = Depends(get_user_id_from_request), file: bytes = Form(...)):
    check_paid(user_id)
    result = utils.parse_bank_statement(file, "statement.csv")
    return {"status": "success", "message": result}

@app.post("/api/check/breaches")
async def check_breaches(email: str = Form(...), user_id: int = Depends(get_user_id_from_request)):
    check_paid(user_id)
    result = utils.check_hibp(email)
    return {"status": "success", "message": result}

@app.post("/api/generate/letter")
async def generate_letter(service: str = Form(...), email: str = Form(...), user_id: int = Depends(get_user_id_from_request)):
    check_paid(user_id)
    letter = account_deleter.generate_deletion_letter(service, email)
    return {"status": "success", "message": letter}

@app.get("/api/ai/advice")
async def ai_advice(user_id: int = Depends(get_user_id_from_request)):
    check_paid(user_id)
    advice = ai_advisor.get_advice()
    return {"status": "success", "message": advice}

# Эндпоинт для колбэков OAuth Google (редирект)
@app.get("/auth/google/callback")
async def google_callback(code: str, state: str, request: Request):
    # state должен содержать user_id и service
    # Для упрощения используем параметр state = user_id:service
    try:
        user_id, service = state.split(":")
        user_id = int(user_id)
        if service == "gmail":
            flow = user_sessions.get(user_id, {}).get("gmail_flow")
            if flow:
                creds = gmail_cleaner.get_service(user_id, flow, code)
                return RedirectResponse(url=f"{WEBAPP_URL}/static/index.html?auth_success=gmail")
        elif service == "drive":
            flow = user_sessions.get(user_id, {}).get("drive_flow")
            if flow:
                creds = drive_cleaner.get_service(user_id, flow, code)
                return RedirectResponse(url=f"{WEBAPP_URL}/static/index.html?auth_success=drive")
    except Exception as e:
        return RedirectResponse(url=f"{WEBAPP_URL}/static/index.html?auth_error={e}")
    return RedirectResponse(url=f"{WEBAPP_URL}/static/index.html?auth_error=unknown")

# ---------- Запуск сервера ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
