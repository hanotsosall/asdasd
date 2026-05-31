import os
import logging
from fastapi import FastAPI, Request, Form, HTTPException, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
import requests

from database import (
    init_db, register_user, set_paid, is_paid, get_all_users,
    get_stats, log_action, get_admin_token, set_user_token_status
)
from utils import load_creds, save_creds, parse_bank_statement, check_hibp
from cleaners import (
    gmail_cleaner, drive_cleaner, twitter_cleaner,
    instagram_cleaner, vk_cleaner, account_deleter, ai_advisor
)

load_dotenv()
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://localhost:8080")
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))

init_db()

app = FastAPI(title="SlateClean")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

user_sessions = {}

def get_user_id_from_request(request: Request) -> int:
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing user ID")
    return int(user_id)

# ---------- Страницы ----------
@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/about", response_class=HTMLResponse)
async def about(request: Request):
    return templates.TemplateResponse("about.html", {"request": request, "webapp_url": WEBAPP_URL})

@app.get("/auth_help", response_class=HTMLResponse)
async def auth_help_page():
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Инструкция по авторизации SlateClean</title><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body{background:#0B0E14;color:#E2E8F0;font-family:system-ui;padding:20px;max-width:800px;margin:0 auto;}
        h1{color:#6EE7B7;}
        h2{color:#3B82F6;}
        code{background:#1E293B;padding:2px 6px;border-radius:6px;}
        a{color:#3B82F6;}
        .card{background:#11161F;border-radius:16px;padding:20px;margin:20px 0;border:1px solid #1E293B;}
    </style>
    </head>
    <body>
    <h1>📘 Инструкция по авторизации в SlateClean</h1>
    <p>Все авторизации проходят через официальные API. Ваши пароли не запрашиваются и не хранятся.</p>
    
    <div class="card">
        <h2>📧 Google (Gmail / Drive)</h2>
        <ol><li>Нажмите «Запустить очистку» в мини-аппе или боте.</li>
        <li>Перейдите по ссылке, выберите аккаунт.</li>
        <li>Разрешите доступ SlateClean (права на чтение/удаление).</li>
        <li>Скопируйте код из адресной строки (часть после <code>code=</code>) и отправьте боту.</li></ol>
    </div>

    <div class="card">
        <h2>🐦 Twitter</h2>
        <ol><li>Нажмите «Очистить Twitter».</li>
        <li>Перейдите по ссылке, авторизуйтесь, разрешите доступ.</li>
        <li>Полученный PIN-код отправьте боту.</li></ol>
    </div>

    <div class="card">
        <h2>🇷🇺 VK</h2>
        <ol><li>Получите Access Token на <a href="https://vkhost.github.io" target="_blank">vkhost.github.io</a> (права <code>wall</code>).</li>
        <li>Скопируйте токен и вставьте в поле в мини-аппе или отправьте боту.</li></ol>
    </div>

    <div class="card">
        <h2>📸 Instagram</h2>
        <ol><li>Введите логин и пароль в мини-аппе.</li>
        <li>Нажмите «Сохранить данные».</li>
        <li>Если Instagram запросит подтверждение – подтвердите в приложении.</li></ol>
    </div>

    <div class="card">
        <h2>💰 Оплата доступа</h2>
        <p>Переведите 500 ₽ на кошелёк ЮMoney <code>4100118620135634</code> с комментарием, содержащим ваш Telegram ID. После оплаты нажмите «Я перевел» в мини-аппе – администратор активирует доступ.</p>
    </div>

    <p><a href="/">← Вернуться в мини-апп</a></p>
    </body></html>
    """

# ---------- Админ-панель ----------
@app.get("/admin")
async def admin_panel(request: Request, token: str = Query(...)):
    try:
        admin_token = get_admin_token()
        if token != admin_token:
            return HTMLResponse(content=f"Invalid token: {token}", status_code=403)
        # Принудительно проверяем наличие шаблона
        if not os.path.exists("templates/admin.html"):
            return HTMLResponse(content="<h1>Ошибка: файл templates/admin.html не найден</h1>", status_code=500)
        return templates.TemplateResponse("admin.html", {"request": request})
    except Exception as e:
        import traceback
        error_text = traceback.format_exc()
        return HTMLResponse(content=f"<pre>{error_text}</pre>", status_code=500)

@app.get("/admin/api/users")
async def admin_users(token: str = Query(...)):
    if token != get_admin_token():
        raise HTTPException(status_code=403)
    return get_all_users()

@app.post("/admin/api/set_paid")
async def admin_set_paid(user_id: int = Form(...), paid: bool = Form(...), token: str = Form(...)):
    if token != get_admin_token():
        raise HTTPException(status_code=403)
    set_paid(user_id, paid)
    log_action(0, "admin_set_paid", f"User {user_id} paid={paid}")
    return {"status": "ok"}

@app.get("/admin/api/stats")
async def admin_stats(token: str = Query(...)):
    if token != get_admin_token():
        raise HTTPException(status_code=403)
    return get_stats()

# ---------- Пользовательское API ----------
@app.get("/api/profile")
async def get_profile(user_id: int = Depends(get_user_id_from_request)):
    register_user(user_id)
    return {
        "user_id": user_id,
        "paid": is_paid(user_id),
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
    log_action(user_id, "payment_notify", "User requested payment")
    if BOT_TOKEN and ADMIN_ID:
        text = f"💰 Пользователь {user_id} запросил активацию. Оплатите 500₽ на 4100118620135634 и активируйте /pay {user_id}"
        try:
            requests.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage", json={"chat_id": ADMIN_ID, "text": text})
        except:
            pass
    return {"status": "ok"}

@app.post("/api/clean/gmail")
async def clean_gmail(user_id: int = Depends(get_user_id_from_request)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403, detail="Not paid")
    creds = load_creds(user_id, "gmail")
    if not creds:
        url, flow = gmail_cleaner.get_auth_url()
        user_sessions[str(user_id)] = {"gmail_flow": flow}
        return {"status": "auth_required", "auth_url": url}
    result1 = gmail_cleaner.delete_old_emails(user_id)
    result2 = gmail_cleaner.unsubscribe_all(user_id)
    log_action(user_id, "clean_gmail", result1 + " " + result2)
    return {"status": "success", "message": f"{result1}\n{result2}"}

@app.post("/api/clean/drive")
async def clean_drive(user_id: int = Depends(get_user_id_from_request)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403)
    creds = load_creds(user_id, "drive")
    if not creds:
        url, flow = drive_cleaner.get_auth_url()
        user_sessions[str(user_id)] = {"drive_flow": flow}
        return {"status": "auth_required", "auth_url": url}
    result1 = drive_cleaner.delete_duplicates(user_id)
    result2 = drive_cleaner.delete_old_files(user_id)
    log_action(user_id, "clean_drive", result1 + " " + result2)
    return {"status": "success", "message": f"{result1}\n{result2}"}

@app.post("/api/clean/twitter")
async def clean_twitter(user_id: int = Depends(get_user_id_from_request)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403)
    creds = load_creds(user_id, "twitter")
    if not creds:
        url, auth = twitter_cleaner.get_auth_url()
        user_sessions[str(user_id)] = {"twitter_auth": auth}
        return {"status": "auth_required", "auth_url": url}
    result = twitter_cleaner.clean_with_existing_tokens(user_id)
    log_action(user_id, "clean_twitter", result)
    return {"status": "success", "message": result}

@app.post("/api/clean/vk")
async def clean_vk(user_id: int = Depends(get_user_id_from_request), token: str = Form(None)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403)
    if token:
        vk_cleaner.save_token(user_id, token)
        return {"status": "token_saved", "message": "Токен VK сохранён."}
    creds = load_creds(user_id, "vk")
    if not creds:
        return {"status": "need_token", "message": "Введите VK Access Token"}
    result = vk_cleaner.clean(user_id, creds)
    log_action(user_id, "clean_vk", result)
    return {"status": "success", "message": result}

@app.post("/api/clean/instagram")
async def clean_instagram(user_id: int = Depends(get_user_id_from_request), username: str = Form(None), password: str = Form(None)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403)
    if username and password:
        instagram_cleaner.save_credentials(user_id, username, password)
        return {"status": "token_saved", "message": "Данные Instagram сохранены."}
    creds = load_creds(user_id, "instagram")
    if not creds:
        return {"status": "need_credentials", "message": "Введите логин и пароль"}
    result = instagram_cleaner.clean(user_id)
    log_action(user_id, "clean_instagram", result)
    return {"status": "success", "message": result}

@app.post("/api/check/card")
async def check_card(user_id: int = Depends(get_user_id_from_request), file: bytes = Form(...)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403)
    result = parse_bank_statement(file, "statement.csv")
    log_action(user_id, "check_card", result)
    return {"status": "success", "message": result}

@app.post("/api/check/breaches")
async def check_breaches(email: str = Form(...), user_id: int = Depends(get_user_id_from_request)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403)
    result = check_hibp(email)
    log_action(user_id, "check_breaches", result)
    return {"status": "success", "message": result}

@app.post("/api/generate/letter")
async def generate_letter(service: str = Form(...), email: str = Form(...), user_id: int = Depends(get_user_id_from_request)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403)
    letter = account_deleter.generate_deletion_letter(service, email)
    log_action(user_id, "generate_letter", f"service={service}")
    return {"status": "success", "message": letter}

@app.get("/api/ai/advice")
async def ai_advice(user_id: int = Depends(get_user_id_from_request)):
    if not is_paid(user_id):
        raise HTTPException(status_code=403)
    advice = ai_advisor.get_advice()
    log_action(user_id, "ai_advice", "advice requested")
    return {"status": "success", "message": advice}

@app.get("/auth/google/callback")
async def google_callback(code: str, state: str):
    try:
        user_id, service = state.split(":")
        user_id = int(user_id)
        if service == "gmail":
            flow = user_sessions.get(str(user_id), {}).get("gmail_flow")
            if flow:
                gmail_cleaner.get_service(user_id, flow, code)
                set_user_token_status(user_id, "gmail", True)
        elif service == "drive":
            flow = user_sessions.get(str(user_id), {}).get("drive_flow")
            if flow:
                drive_cleaner.get_service(user_id, flow, code)
                set_user_token_status(user_id, "drive", True)
        return RedirectResponse(url=f"{WEBAPP_URL}/static/index.html?auth_success={service}")
    except Exception as e:
        return RedirectResponse(url=f"{WEBAPP_URL}/static/index.html?auth_error={e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
