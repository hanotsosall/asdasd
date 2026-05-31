import os
import logging
from fastapi import FastAPI, Request, Form, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
import requests

from utils import load_creds, save_creds, parse_bank_statement, check_hibp
from cleaners import (
    gmail_cleaner, drive_cleaner, twitter_cleaner,
    instagram_cleaner, vk_cleaner, account_deleter, ai_advisor
)

load_dotenv()
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://localhost:8080")
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))

app = FastAPI(title="SlateClean Mini App")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

user_sessions = {}

def get_user_id_from_request(request: Request) -> int:
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    return int(user_id)

# ---------- Страницы ----------
@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/about", response_class=HTMLResponse)
async def about(request: Request):
    return templates.TemplateResponse("about.html", {"request": request, "webapp_url": WEBAPP_URL})

# ---------- API ----------
@app.get("/api/profile")
async def get_profile(user_id: int = Depends(get_user_id_from_request)):
    paid = user_sessions.get(user_id, {}).get("paid", False)
    return {
        "user_id": user_id,
        "paid": paid,
        "services": {
            "gmail": load_creds(user_id, "gmail") is not None,
            "drive": load_creds(user_id, "drive") is not None,
            "twitter": load_creds(user_id, "twitter") is not None,
            "vk": load_creds(user_id, "vk") is not None,
            "instagram": load_creds(user_id, "instagram") is not None,
        }
    }

@app.post("/api/payment/notify")
async def payment_notify(user_id: int = Form(...)):
    logging.info(f"User {user_id} requested payment activation")
    if BOT_TOKEN and ADMIN_ID:
        text = f"💰 Пользователь {user_id} запросил активацию доступа. Оплатите 500₽ на кошелёк 4100118620135634 и активируйте командой /pay {user_id}"
        try:
            requests.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json={"chat_id": ADMIN_ID, "text": text})
        except:
            pass
    return {"status": "ok"}

# Остальные эндпоинты: /api/clean/gmail, /api/clean/drive, /api/clean/twitter, /api/clean/vk, /api/clean/instagram,
# /api/check/card, /api/check/breaches, /api/generate/letter, /api/ai/advice, /auth/google/callback
# (они идентичны предыдущей версии – см. ниже)

# ------------------- Ниже все те же эндпоинты (без изменений) -------------------
# В целях экономии места они не дублируются, но в реальном файле они должны быть.
# Полный код main.py с эндпоинтами можно взять из предыдущего ответа.
# Здесь я приведу только краткую заглушку для демонстрации:

@app.post("/api/clean/gmail")
async def clean_gmail(user_id: int = Depends(get_user_id_from_request)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    creds = load_creds(user_id, "gmail")
    if not creds:
        url, flow = gmail_cleaner.get_auth_url()
        user_sessions.setdefault(user_id, {})["gmail_flow"] = flow
        return {"status": "auth_required", "auth_url": url}
    result1 = gmail_cleaner.delete_old_emails(user_id)
    result2 = gmail_cleaner.unsubscribe_all(user_id)
    return {"status": "success", "message": f"{result1}\n{result2}"}

# ... (остальные эндпоинты такие же, как в предыдущем ответе)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
