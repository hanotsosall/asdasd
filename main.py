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

# ---------- создаём app ----------
app = FastAPI(title="SlateClean Mini App")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# временное хранилище сессий (в реальности использовать БД)
user_sessions = {}

def get_user_id_from_request(request: Request) -> int:
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    return int(user_id)

# ---------- страницы ----------
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
        text = f"💰 Пользователь {user_id} запросил активацию. Оплатите 500₽ на 4100118620135634 и активируйте командой /pay {user_id}"
        try:
            requests.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json={"chat_id": ADMIN_ID, "text": text})
        except Exception as e:
            logging.error(f"Failed to notify admin: {e}")
    return {"status": "ok"}

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

@app.post("/api/clean/drive")
async def clean_drive(user_id: int = Depends(get_user_id_from_request)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    creds = load_creds(user_id, "drive")
    if not creds:
        url, flow = drive_cleaner.get_auth_url()
        user_sessions.setdefault(user_id, {})["drive_flow"] = flow
        return {"status": "auth_required", "auth_url": url}
    result1 = drive_cleaner.delete_duplicates(user_id)
    result2 = drive_cleaner.delete_old_files(user_id)
    return {"status": "success", "message": f"{result1}\n{result2}"}

@app.post("/api/clean/twitter")
async def clean_twitter(user_id: int = Depends(get_user_id_from_request)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    creds = load_creds(user_id, "twitter")
    if not creds:
        url, auth = twitter_cleaner.get_auth_url()
        user_sessions.setdefault(user_id, {})["twitter_auth"] = auth
        return {"status": "auth_required", "auth_url": url}
    result = twitter_cleaner.clean_with_existing_tokens(user_id)
    return {"status": "success", "message": result}

@app.post("/api/clean/vk")
async def clean_vk(user_id: int = Depends(get_user_id_from_request), token: str = Form(None)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    if token:
        vk_cleaner.save_token(user_id, token)
        return {"status": "token_saved", "message": "Токен VK сохранён."}
    creds = load_creds(user_id, "vk")
    if not creds:
        return {"status": "need_token", "message": "Введите VK Access Token"}
    result = vk_cleaner.clean(user_id, creds)
    return {"status": "success", "message": result}

@app.post("/api/clean/instagram")
async def clean_instagram(user_id: int = Depends(get_user_id_from_request), username: str = Form(None), password: str = Form(None)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    if username and password:
        instagram_cleaner.save_credentials(user_id, username, password)
        return {"status": "token_saved", "message": "Данные Instagram сохранены."}
    creds = load_creds(user_id, "instagram")
    if not creds:
        return {"status": "need_credentials", "message": "Введите логин и пароль"}
    result = instagram_cleaner.clean(user_id)
    return {"status": "success", "message": result}

@app.post("/api/check/card")
async def check_card(user_id: int = Depends(get_user_id_from_request), file: bytes = Form(...)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    result = parse_bank_statement(file, "statement.csv")
    return {"status": "success", "message": result}

@app.post("/api/check/breaches")
async def check_breaches(email: str = Form(...), user_id: int = Depends(get_user_id_from_request)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    result = check_hibp(email)
    return {"status": "success", "message": result}

@app.post("/api/generate/letter")
async def generate_letter(service: str = Form(...), email: str = Form(...), user_id: int = Depends(get_user_id_from_request)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    letter = account_deleter.generate_deletion_letter(service, email)
    return {"status": "success", "message": letter}

@app.get("/api/ai/advice")
async def ai_advice(user_id: int = Depends(get_user_id_from_request)):
    if not user_sessions.get(user_id, {}).get("paid", False):
        raise HTTPException(status_code=403, detail="Not paid")
    advice = ai_advisor.get_advice()
    return {"status": "success", "message": advice}

@app.get("/auth/google/callback")
async def google_callback(code: str, state: str):
    try:
        user_id, service = state.split(":")
        user_id = int(user_id)
        if service == "gmail":
            flow = user_sessions.get(user_id, {}).get("gmail_flow")
            if flow:
                gmail_cleaner.get_service(user_id, flow, code)
        elif service == "drive":
            flow = user_sessions.get(user_id, {}).get("drive_flow")
            if flow:
                drive_cleaner.get_service(user_id, flow, code)
        return RedirectResponse(url=f"{WEBAPP_URL}/static/index.html?auth_success={service}")
    except Exception as e:
        return RedirectResponse(url=f"{WEBAPP_URL}/static/index.html?auth_error={e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
