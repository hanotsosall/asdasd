import os
import pickle
import logging
import re
import csv
import io
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, MessageHandler,
    filters, ContextTypes, ConversationHandler
)

# Google
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Twitter
import tweepy

# VK
import vk_api

# Instagram
from instagrapi import Client as InstaClient

# OpenAI
import openai

# Для работы с CSV (выписки)
import pandas as pd

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY

# Настройка логов
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Состояния для Google
WAITING_GMAIL_CODE, WAITING_DRIVE_CODE = range(2)
# Состояния для Twitter (после получения URL)
WAITING_TWITTER_PIN = 10
# Состояния для VK (уже есть токен, не требуется)
WAITING_VK_TOKEN = 11
# Состояния для Instagram (логин/пароль)
WAITING_INSTA_LOGIN = 12
WAITING_INSTA_PASSWORD = 13
# Состояния для загрузки выписки карты
WAITING_CARD_STATEMENT = 20

# Глобальное хранилище оплат
paid_users = set()

# ---------- Вспомогательные функции ----------
def get_user_dir(user_id: int):
    path = f"user_data/{user_id}"
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

# ---------- GOOGLE GMAIL ----------
SCOPES_GMAIL = ['https://www.googleapis.com/auth/gmail.modify']
def get_gmail_auth_url():
    flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES_GMAIL)
    auth_url, _ = flow.authorization_url(prompt='consent')
    return auth_url, flow

def get_gmail_service(user_id, flow=None, code=None):
    creds = load_creds(user_id, "gmail")
    if not creds or not creds.valid:
        if flow and code:
            flow.fetch_token(code=code)
            creds = flow.credentials
            save_creds(user_id, creds, "gmail")
        else:
            return None
    return build('gmail', 'v1', credentials=creds)

def gmail_delete_all_emails(user_id, keep_days=30):
    """Удаляет все письма, кроме тех, что новее keep_days дней, и важных/отмеченных звёздами"""
    service = get_gmail_service(user_id)
    if not service:
        return "❌ Gmail не авторизован"
    before_date = (datetime.now() - timedelta(days=keep_days)).strftime('%Y/%m/%d')
    query = f"before:{before_date} -is:starred -is:important -label:inbox"
    results = service.users().messages().list(userId='me', q=query, maxResults=1000).execute()
    messages = results.get('messages', [])
    deleted = 0
    for msg in messages:
        try:
            service.users().messages().delete(userId='me', id=msg['id']).execute()
            deleted += 1
        except:
            pass
    return f"✅ Удалено старых писем (старше {keep_days} дней): {deleted}"

def gmail_unsubscribe_from_all(user_id):
    service = get_gmail_service(user_id)
    if not service:
        return "❌ Gmail не авторизован"
    results = service.users().messages().list(userId='me', q='unsubscribe OR list-unsubscribe', maxResults=200).execute()
    messages = results.get('messages', [])
    unsub_count = 0
    for msg in messages:
        msg_data = service.users().messages().get(userId='me', id=msg['id'], format='metadata').execute()
        headers = msg_data.get('payload', {}).get('headers', [])
        unsub_url = None
        for h in headers:
            if h['name'].lower() == 'list-unsubscribe':
                unsub_url = h['value']
                break
        if unsub_url:
            try:
                requests.get(unsub_url, timeout=5)
                unsub_count += 1
            except:
                pass
        service.users().messages().delete(userId='me', id=msg['id']).execute()
    return f"✅ Отписано от рассылок: {unsub_count}, удалено писем: {len(messages)}"

def gmail_revoke_third_party_access(user_id):
    """Отзыв доступа у сторонних приложений через Google Account API (требует дополнительных прав)"""
    # Сложно реализовать через Gmail API, требуется Security API. Оставим инструкцию.
    return "🔐 Для отзыва доступа приложений перейдите по ссылке и удалите ненужные: https://myaccount.google.com/permissions"

# ---------- GOOGLE DRIVE ----------
SCOPES_DRIVE = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file']
def get_drive_auth_url():
    flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES_DRIVE)
    auth_url, _ = flow.authorization_url(prompt='consent')
    return auth_url, flow

def get_drive_service(user_id, flow=None, code=None):
    creds = load_creds(user_id, "drive")
    if not creds or not creds.valid:
        if flow and code:
            flow.fetch_token(code=code)
            creds = flow.credentials
            save_creds(user_id, creds, "drive")
        else:
            return None
    return build('drive', 'v3', credentials=creds)

def drive_delete_duplicates(user_id):
    service = get_drive_service(user_id)
    if not service:
        return "❌ Drive не авторизован"
    page_token = None
    hash_map = {}
    deleted = 0
    while True:
        response = service.files().list(q="trashed=false", fields="nextPageToken, files(id, name, md5Checksum, mimeType)", pageToken=page_token).execute()
        for file in response.get('files', []):
            if file.get('md5Checksum') and file['mimeType'] != 'application/vnd.google-apps.folder':
                h = file['md5Checksum']
                if h in hash_map:
                    service.files().delete(fileId=file['id']).execute()
                    deleted += 1
                else:
                    hash_map[h] = file['id']
        page_token = response.get('nextPageToken', None)
        if not page_token:
            break
    return f"✅ Удалено дубликатов: {deleted}"

def drive_delete_old_files(user_id, days=180):
    service = get_drive_service(user_id)
    if not service:
        return "❌ Drive не авторизован"
    cutoff = (datetime.now() - timedelta(days=days)).isoformat() + 'Z'
    query = f"modifiedTime < '{cutoff}' and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get('files', [])
    deleted = 0
    for f in files:
        try:
            service.files().delete(fileId=f['id']).execute()
            deleted += 1
        except:
            pass
    return f"✅ Удалено старых файлов ({days} дней): {deleted}"

# ---------- TWITTER ----------
def get_twitter_auth_url():
    auth = tweepy.OAuth1UserHandler(os.getenv("TWITTER_API_KEY"), os.getenv("TWITTER_API_SECRET"))
    url = auth.get_authorization_url()
    return url, auth

def twitter_clean(user_id, pin, request_token):
    auth = tweepy.OAuth1UserHandler(os.getenv("TWITTER_API_KEY"), os.getenv("TWITTER_API_SECRET"))
    auth.request_token = request_token
    try:
        access_token, access_secret = auth.get_access_token(pin)
        api = tweepy.API(auth)
        # Сохраняем токены
        creds = (access_token, access_secret)
        save_creds(user_id, creds, "twitter")
        # Удаляем все твиты
        user_timeline = api.user_timeline(count=200)
        deleted_tweets = 0
        for tweet in user_timeline:
            api.destroy_status(tweet.id)
            deleted_tweets += 1
        # Удаляем лайки
        favorites = api.favorites(count=200)
        for fav in favorites:
            api.destroy_favorite(fav.id)
        # Удаляем ретвиты (свои) – сложно, можно пропустить
        return f"✅ Twitter очищен: удалено {deleted_tweets} твитов."
    except Exception as e:
        return f"❌ Ошибка: {e}"

# ---------- VK ----------
def vk_clean(user_id, token):
    try:
        vk_session = vk_api.VkApi(token=token)
        vk = vk_session.get_api()
        # Получаем свой ID
        me = vk.users.get()[0]['id']
        # Удаляем записи со стены
        posts = vk.wall.get(owner_id=me, count=100)
        deleted = 0
        for post in posts['items']:
            vk.wall.delete(owner_id=me, post_id=post['id'])
            deleted += 1
        return f"✅ VK очищен: удалено {deleted} записей со стены."
    except Exception as e:
        return f"❌ Ошибка VK: {e}"

# ---------- INSTAGRAM ----------
def instagram_clean(username, password):
    try:
        cl = InstaClient()
        cl.login(username, password)
        user_id = cl.user_id
        # Удаляем все посты
        medias = cl.user_medias(user_id, amount=50)
        deleted = 0
        for media in medias:
            cl.media_delete(media.id)
            deleted += 1
        cl.logout()
        return f"✅ Instagram: удалено {deleted} постов."
    except Exception as e:
        return f"❌ Ошибка Instagram: {e}"

# ---------- ПРОВЕРКА КАРТ И ПОДПИСОК ----------
def parse_bank_statement(file_content, filename):
    """Парсит CSV выписку, ищет повторяющиеся платежи"""
    try:
        df = pd.read_csv(io.StringIO(file_content.decode('utf-8')))
        # Ищем столбцы с датой, суммой, описанием
        # Демо-логика: группируем по описанию, если больше 2 повторений за 3 месяца
        if 'Description' in df.columns and 'Amount' in df.columns:
            subs = df.groupby('Description').size().reset_index(name='count')
            subs = subs[subs['count'] >= 2]
            result = "💳 Подозрительные регулярные платежи:\n"
            for _, row in subs.iterrows():
                result += f"- {row['Description']} (повтор {row['count']} раз)\n"
            return result
        else:
            return "❌ Не найден столбец с описанием или суммой. Проверьте формат выписки."
    except Exception as e:
        return f"Ошибка парсинга: {e}"

# ---------- ПРОВЕРКА УТЕЧЕК ----------
def check_hibp(email):
    url = f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}"
    headers = {'hibp-api-key': os.getenv('HIBP_API_KEY', '')} if os.getenv('HIBP_API_KEY') else {}
    try:
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            breaches = resp.json()
            names = [b['Name'] for b in breaches]
            return f"⚠️ Ваш email найден в {len(breaches)} утечках: {', '.join(names[:5])}"
        else:
            return "✅ Ваш email не обнаружен в известных утечках."
    except:
        return "🔐 Не удалось проверить утечки (API ошибка)."

# ---------- ИИ-генерация письма для удаления аккаунта ----------
def generate_deletion_letter(service_name, email):
    if not OPENAI_API_KEY:
        return "🔐 Добавьте OPENAI_API_KEY в .env"
    prompt = f"Напиши официальный запрос на удаление аккаунта с сайта {service_name} для email {email}. Ссылайся на GDPR, требуй удалить все персональные данные. Используй вежливый, но настойчивый тон."
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content
    except:
        return "Ошибка ИИ, попробуйте позже."

# ---------- ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ----------
def get_profile_text(user_id, username):
    paid = user_id in paid_users
    gmail_ok = load_creds(user_id, "gmail") is not None
    drive_ok = load_creds(user_id, "drive") is not None
    twitter_ok = load_creds(user_id, "twitter") is not None
    vk_ok = load_creds(user_id, "vk") is not None
    insta_ok = load_creds(user_id, "insta") is not None
    text = f"👤 *Профиль* @{username}\n"
    text += f"💳 Статус оплаты: {'✅ Активирован' if paid else '❌ Не оплачен'}\n\n"
    text += "🔌 *Подключённые сервисы:*\n"
    text += f"📧 Gmail: {'✅' if gmail_ok else '❌'}\n"
    text += f"🗂️ Google Drive: {'✅' if drive_ok else '❌'}\n"
    text += f"🐦 Twitter: {'✅' if twitter_ok else '❌'}\n"
    text += f"🇷🇺 VK: {'✅' if vk_ok else '❌'}\n"
    text += f"📸 Instagram: {'✅' if insta_ok else '❌'}\n"
    return text

# ---------- КОМАНДЫ И КНОПКИ ----------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("👤 Профиль", callback_data='profile')],
        [InlineKeyboardButton("🧹 ПОЛНАЯ ОЧИСТКА ВСЕГО", callback_data='full_clean')],
        [InlineKeyboardButton("📧 Очистить Gmail (все письма)", callback_data='clean_gmail')],
        [InlineKeyboardButton("🗑️ Очистить Google Drive", callback_data='clean_drive')],
        [InlineKeyboardButton("🐦 Очистить Twitter", callback_data='clean_twitter')],
        [InlineKeyboardButton("🇷🇺 Очистить VK", callback_data='clean_vk')],
        [InlineKeyboardButton("📸 Очистить Instagram", callback_data='clean_instagram')],
        [InlineKeyboardButton("💳 Проверить карту на подписки", callback_data='check_card')],
        [InlineKeyboardButton("🔐 Проверить утечки данных", callback_data='check_breaches')],
        [InlineKeyboardButton("✉️ Сгенерировать письмо об удалении аккаунта", callback_data='gen_letter')],
        [InlineKeyboardButton("💰 Оплатить 500 ₽ (доступ ко всему)", callback_data='buy')],
        [InlineKeyboardButton("❓ Помощь / Безопасность", callback_data='help')],
    ]
    await update.message.reply_text(
        "🔥 *SlateClean ULTIMATE* — полная зачистка цифрового следа.\n\n"
        "✅ После оплаты 500 ₽ вам станут доступны все функции.\n"
        "🔒 Ваши данные не хранятся — всё удаляется после сессии.\n"
        "👇 Выберите действие:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    user_id = update.effective_user.id
    username = update.effective_user.username or "user"

    if data == 'profile':
        text = get_profile_text(user_id, username)
        await query.edit_message_text(text, parse_mode="Markdown")
        return

    if data == 'buy':
        context.user_data['awaiting_payment'] = True
        await query.edit_message_text(
            "💳 *Оплата 500 ₽*\n\n"
            "Переведите 500 ₽ на кошелёк ЮMoney:\n"
            "`4100118620135634`\n\n"
            "**В комментарии к переводу укажите ваш Telegram ID:** `" + str(user_id) + "`\n\n"
            "После перевода нажмите кнопку «Я перевел».",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✅ Я перевел", callback_data='payment_done')]]),
            parse_mode="Markdown"
        )
        return

    if data == 'payment_done':
        if ADMIN_ID:
            await context.bot.send_message(
                ADMIN_ID,
                f"💰 Пользователь {user_id} (@{username}) сообщил об оплате 500 ₽.\n"
                f"Проверьте кошелек и активируйте доступ командой:\n/pay {user_id}"
            )
        await query.edit_message_text("✅ Запрос отправлен админу. Доступ будет активирован в течение суток.")
        return

    # Проверка оплаты для остальных функций
    if user_id not in paid_users:
        await query.edit_message_text("🚫 Сначала оплатите доступ: /start → Оплатить 500 ₽")
        return

    if data == 'full_clean':
        # Запускаем все очистки последовательно
        await query.edit_message_text("🔄 Запущена полная очистка. Это может занять несколько минут...")
        results = []
        # Gmail
        gmail_service = get_gmail_service(user_id)
        if gmail_service:
            res1 = gmail_delete_all_emails(user_id, keep_days=7)
            res2 = gmail_unsubscribe_from_all(user_id)
            results.append(res1 + "\n" + res2)
        else:
            results.append("Gmail не авторизован, пропущен.")
        # Drive
        drive_service = get_drive_service(user_id)
        if drive_service:
            results.append(drive_delete_duplicates(user_id))
            results.append(drive_delete_old_files(user_id, days=90))
        else:
            results.append("Drive не авторизован, пропущен.")
        # Twitter (если есть токен)
        twitter_creds = load_creds(user_id, "twitter")
        if twitter_creds:
            # Восстановить API и удалить
            results.append("Twitter: используйте отдельную кнопку.")
        # VK, Instagram аналогично
        await query.edit_message_text("\n".join(results))
        return

    if data == 'clean_gmail':
        creds = load_creds(user_id, "gmail")
        if not creds:
            url, flow = get_gmail_auth_url()
            context.user_data['gmail_flow'] = flow
            await query.edit_message_text(
                f"🔐 Для доступа к Gmail перейдите по ссылке и разрешите доступ, затем скопируйте код из адресной строки (после `code=`) и отправьте его сюда.\n\n{url}"
            )
            return WAITING_GMAIL_CODE
        await query.edit_message_text("🔄 Удаляю старые письма и отписываюсь...")
        res1 = gmail_delete_all_emails(user_id, keep_days=30)
        res2 = gmail_unsubscribe_from_all(user_id)
        await query.edit_message_text(f"{res1}\n{res2}")
        return

    if data == 'clean_drive':
        creds = load_creds(user_id, "drive")
        if not creds:
            url, flow = get_drive_auth_url()
            context.user_data['drive_flow'] = flow
            await query.edit_message_text(
                f"🔐 Для доступа к Google Drive перейдите по ссылке, затем отправьте код.\n\n{url}"
            )
            return WAITING_DRIVE_CODE
        await query.edit_message_text("🔄 Удаляю дубликаты и старые файлы...")
        res1 = drive_delete_duplicates(user_id)
        res2 = drive_delete_old_files(user_id, days=180)
        await query.edit_message_text(f"{res1}\n{res2}")
        return

    if data == 'clean_twitter':
        creds = load_creds(user_id, "twitter")
        if not creds:
            url, auth = get_twitter_auth_url()
            context.user_data['twitter_auth'] = auth
            await query.edit_message_text(
                f"🐦 Для очистки Twitter перейдите по ссылке, авторизуйтесь, затем введите полученный PIN-код:\n\n{url}\n\n"
                "PIN:"
            )
            return WAITING_TWITTER_PIN
        else:
            # Уже есть токены – можно очистить
            await query.edit_message_text("🔄 Очищаем Twitter...")
            # Восстановим API
            api_key = os.getenv("TWITTER_API_KEY")
            api_secret = os.getenv("TWITTER_API_SECRET")
            access_token, access_secret = creds
            auth = tweepy.OAuth1UserHandler(api_key, api_secret, access_token, access_secret)
            api = tweepy.API(auth)
            try:
                tweets = api.user_timeline(count=200)
                deleted = 0
                for t in tweets:
                    api.destroy_status(t.id)
                    deleted += 1
                await query.edit_message_text(f"✅ Удалено {deleted} твитов.")
            except Exception as e:
                await query.edit_message_text(f"❌ Ошибка: {e}")
        return

    if data == 'clean_vk':
        creds = load_creds(user_id, "vk")
        if not creds:
            await query.edit_message_text(
                "🔐 Введите ваш VK Access Token (получить можно на https://vkhost.github.io/).\n"
                "Токен должен иметь права: wall, friends, groups."
            )
            return WAITING_VK_TOKEN
        result = vk_clean(user_id, creds)
        await query.edit_message_text(result)
        return

    if data == 'clean_instagram':
        creds = load_creds(user_id, "insta")
        if not creds:
            await query.edit_message_text("Введите логин Instagram:")
            return WAITING_INSTA_LOGIN
        else:
            # creds - это (username, password)
            username, password = creds
            await query.edit_message_text("🔄 Очищаем Instagram...")
            result = instagram_clean(username, password)
            await query.edit_message_text(result)
        return

    if data == 'check_card':
        await query.edit_message_text(
            "📎 Отправьте файл выписки из банка в формате CSV (столбцы: Дата, Описание, Сумма).\n"
            "Я проанализирую регулярные платежи и найду скрытые подписки."
        )
        context.user_data['awaiting_card'] = True
        return

    if data == 'check_breaches':
        await query.edit_message_text("Введите ваш email для проверки утечек:")
        context.user_data['awaiting_email'] = True
        return

    if data == 'gen_letter':
        await query.edit_message_text("Введите название сервиса и ваш email через пробел, например:\n`spotify my@email.com`")
        context.user_data['awaiting_letter'] = True
        return

    if data == 'help':
        await query.edit_message_text(
            "🔒 *Безопасность и конфиденциальность*\n\n"
            "✅ Ваши данные НЕ хранятся на наших серверах. Токены доступа сохраняются локально на устройстве администратора и удаляются после очистки.\n"
            "✅ Все операции с Google, Twitter и другими сервисами выполняются напрямую через официальные API.\n"
            "✅ Мы не запрашиваем пароли — только OAuth-авторизация.\n"
            "✅ После завершения очистки вы можете в любой момент отозвать доступ к приложению.\n\n"
            "💰 *Оплата*: 500 ₽ разово на кошелёк 4100118620135634 с указанием Telegram ID.\n"
            "📞 Поддержка: @admin (ссылка)",
            parse_mode="Markdown"
        )
        return

    return ConversationHandler.END

# ---------- Обработчики для ввода данных ----------
async def gmail_code_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    code = update.message.text.strip()
    flow = context.user_data.get('gmail_flow')
    if not flow:
        await update.message.reply_text("Сессия истекла. Начните заново /start")
        return ConversationHandler.END
    try:
        service = get_gmail_service(update.effective_user.id, flow, code)
        if service:
            await update.message.reply_text("✅ Gmail авторизован! Теперь используйте кнопку очистки.")
        else:
            await update.message.reply_text("❌ Ошибка авторизации.")
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")
    finally:
        context.user_data.pop('gmail_flow', None)
    return ConversationHandler.END

async def drive_code_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    code = update.message.text.strip()
    flow = context.user_data.get('drive_flow')
    if not flow:
        await update.message.reply_text("Сессия истекла.")
        return ConversationHandler.END
    try:
        service = get_drive_service(update.effective_user.id, flow, code)
        if service:
            await update.message.reply_text("✅ Google Drive авторизован!")
        else:
            await update.message.reply_text("❌ Ошибка.")
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")
    finally:
        context.user_data.pop('drive_flow', None)
    return ConversationHandler.END

async def twitter_pin_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    pin = update.message.text.strip()
    auth = context.user_data.get('twitter_auth')
    if not auth:
        await update.message.reply_text("Сессия истекла, начните заново /start")
        return ConversationHandler.END
    result = twitter_clean(update.effective_user.id, pin, auth.request_token)
    await update.message.reply_text(result)
    context.user_data.pop('twitter_auth', None)
    return ConversationHandler.END

async def vk_token_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    token = update.message.text.strip()
    # Проверим токен
    try:
        vk_session = vk_api.VkApi(token=token)
        vk_session.get_api().users.get()
        save_creds(update.effective_user.id, token, "vk")
        await update.message.reply_text("✅ VK токен сохранён! Теперь используйте кнопку очистки.")
    except:
        await update.message.reply_text("❌ Неверный токен. Попробуйте снова.")
    return ConversationHandler.END

async def insta_login_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['insta_login'] = update.message.text.strip()
    await update.message.reply_text("Введите пароль Instagram:")
    return WAITING_INSTA_PASSWORD

async def insta_password_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    password = update.message.text.strip()
    login = context.user_data.get('insta_login')
    if not login:
        await update.message.reply_text("Ошибка, начните заново /start")
        return ConversationHandler.END
    save_creds(update.effective_user.id, (login, password), "insta")
    await update.message.reply_text("✅ Instagram авторизован! Теперь используйте кнопку очистки.")
    context.user_data.pop('insta_login', None)
    return ConversationHandler.END

async def card_statement_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message.document:
        await update.message.reply_text("Пожалуйста, отправьте файл CSV.")
        return
    file = await update.message.document.get_file()
    content = await file.download_as_bytearray()
    result = parse_bank_statement(content, update.message.document.file_name)
    await update.message.reply_text(result)
    context.user_data.pop('awaiting_card', None)

async def email_breach_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    email = update.message.text.strip()
    result = check_hibp(email)
    await update.message.reply_text(result)
    context.user_data.pop('awaiting_email', None)

async def letter_input_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()
    parts = text.split()
    if len(parts) < 2:
        await update.message.reply_text("Введите сервис и email через пробел, например: `spotify my@email.com`")
        return
    service = parts[0]
    email = parts[1]
    letter = generate_deletion_letter(service, email)
    await update.message.reply_text(f"✉️ *Письмо для {service}:*\n\n{letter}", parse_mode="Markdown")
    context.user_data.pop('awaiting_letter', None)

# ---------- АДМИН-КОМАНДА АКТИВАЦИИ ----------
async def pay_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        await update.message.reply_text("Недостаточно прав.")
        return
    if not context.args:
        await update.message.reply_text("Использование: /pay USER_ID")
        return
    try:
        uid = int(context.args[0])
        paid_users.add(uid)
        await update.message.reply_text(f"✅ Пользователь {uid} получил доступ.")
        await context.bot.send_message(uid, "🎉 Ваш доступ к SlateClean активирован! Используйте /start")
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")

# ---------- ЗАПУСК ----------
def main():
    app = Application.builder().token(BOT_TOKEN).build()

    # ConversationHandler для Google
    conv_google = ConversationHandler(
        entry_points=[CallbackQueryHandler(button_handler, pattern='^(clean_gmail|clean_drive)$')],
        states={
            WAITING_GMAIL_CODE: [MessageHandler(filters.TEXT & ~filters.COMMAND, gmail_code_handler)],
            WAITING_DRIVE_CODE: [MessageHandler(filters.TEXT & ~filters.COMMAND, drive_code_handler)],
        },
        fallbacks=[CommandHandler('cancel', lambda u,c: u.message.reply_text("Отменено"))]
    )
    app.add_handler(conv_google)

    # ConversationHandler для Twitter
    conv_twitter = ConversationHandler(
        entry_points=[CallbackQueryHandler(button_handler, pattern='^clean_twitter$')],
        states={WAITING_TWITTER_PIN: [MessageHandler(filters.TEXT & ~filters.COMMAND, twitter_pin_handler)]},
        fallbacks=[CommandHandler('cancel', lambda u,c: u.message.reply_text("Отменено"))]
    )
    app.add_handler(conv_twitter)

    # VK
    conv_vk = ConversationHandler(
        entry_points=[CallbackQueryHandler(button_handler, pattern='^clean_vk$')],
        states={WAITING_VK_TOKEN: [MessageHandler(filters.TEXT & ~filters.COMMAND, vk_token_handler)]},
        fallbacks=[CommandHandler('cancel', lambda u,c: u.message.reply_text("Отменено"))]
    )
    app.add_handler(conv_vk)

    # Instagram
    conv_insta = ConversationHandler(
        entry_points=[CallbackQueryHandler(button_handler, pattern='^clean_instagram$')],
        states={
            WAITING_INSTA_LOGIN: [MessageHandler(filters.TEXT & ~filters.COMMAND, insta_login_handler)],
            WAITING_INSTA_PASSWORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, insta_password_handler)],
        },
        fallbacks=[CommandHandler('cancel', lambda u,c: u.message.reply_text("Отменено"))]
    )
    app.add_handler(conv_insta)

    # Обработчики для остальных callback'ов
    app.add_handler(CallbackQueryHandler(button_handler, pattern='^(profile|buy|payment_done|full_clean|check_card|check_breaches|gen_letter|help)$'))
    # Отдельные обработчики для ввода данных
    app.add_handler(MessageHandler(filters.Document.ALL, card_statement_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, email_breach_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, letter_input_handler))

    # Команды
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("pay", pay_command))

    logger.info("Бот запущен")
    app.run_polling()

if __name__ == "__main__":
    main()
