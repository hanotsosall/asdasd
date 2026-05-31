import os
import logging
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from database import set_paid, is_paid, log_action, get_admin_token
from cleaners import gmail_cleaner, drive_cleaner, twitter_cleaner, vk_cleaner, instagram_cleaner
from utils import load_creds

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))
WEBAPP_URL = os.getenv("WEBAPP_URL")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🚀 Открыть мини-апп", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton("📖 О сервисе", callback_data='about')],
        [InlineKeyboardButton("💰 Оплатить", callback_data='buy')],
        [InlineKeyboardButton("📧 Очистить Gmail", callback_data='clean_gmail')],
        [InlineKeyboardButton("🗑️ Очистить Drive", callback_data='clean_drive')],
        [InlineKeyboardButton("🐦 Очистить Twitter", callback_data='clean_twitter')],
        [InlineKeyboardButton("🇷🇺 Очистить VK", callback_data='clean_vk')],
        [InlineKeyboardButton("📸 Очистить Instagram", callback_data='clean_instagram')],
        [InlineKeyboardButton("❓ Помощь", callback_data='help')],
        [InlineKeyboardButton("📘 Инструкция", callback_data='auth_help')],
    ]
    await update.message.reply_text(
        "🔥 *SlateClean* — профессиональная зачистка цифрового следа.\n\nВыберите действие:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

async def clean_callback(update: Update, context: ContextTypes.DEFAULT_TYPE, service: str):
    query = update.callback_query
    user_id = update.effective_user.id
    if not is_paid(user_id):
        await query.edit_message_text("🚫 Доступ платный. Оплатите 500 ₽ (кнопка «Оплатить»).")
        return
    creds = load_creds(user_id, service)
    if not creds:
        await query.edit_message_text(f"🔐 Сервис {service} не авторизован. Используйте /auth_help для инструкции.")
        return
    await query.edit_message_text(f"🔄 Запущена очистка {service}...")
    if service == "gmail":
        res = gmail_cleaner.delete_old_emails(user_id) + "\n" + gmail_cleaner.unsubscribe_all(user_id)
    elif service == "drive":
        res = drive_cleaner.delete_duplicates(user_id) + "\n" + drive_cleaner.delete_old_files(user_id)
    elif service == "twitter":
        res = twitter_cleaner.clean_with_existing_tokens(user_id)
    elif service == "vk":
        res = vk_cleaner.clean(user_id, creds)
    elif service == "instagram":
        res = instagram_cleaner.clean(user_id)
    else:
        res = "Функция в разработке"
    log_action(user_id, f"bot_clean_{service}", res)
    await query.edit_message_text(res)

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    user_id = update.effective_user.id

    if data == 'about':
        await query.edit_message_text(
            "📖 *SlateClean* — удаляем цифровой мусор через официальные API.\n"
            "✅ Безопасно (пароли не храним)\n"
            "✅ 5000+ пользователей\n"
            "✅ Доступ ко всем функциям после разовой оплаты 500 ₽\n\n"
            f"[Подробнее]({WEBAPP_URL}/about)",
            parse_mode="Markdown", disable_web_page_preview=True
        )
    elif data == 'buy':
        await query.edit_message_text(
            f"💰 *Оплата 500 ₽*\n"
            f"Переведите на кошелёк `4100118620135634` с комментарием: `{user_id}`\n"
            f"После оплаты нажмите «Я перевел» в мини-аппе или напишите админу.",
            parse_mode="Markdown"
        )
    elif data == 'clean_gmail':
        await clean_callback(update, context, "gmail")
    elif data == 'clean_drive':
        await clean_callback(update, context, "drive")
    elif data == 'clean_twitter':
        await clean_callback(update, context, "twitter")
    elif data == 'clean_vk':
        await clean_callback(update, context, "vk")
    elif data == 'clean_instagram':
        await clean_callback(update, context, "instagram")
    elif data == 'help':
        await query.edit_message_text(
            "❓ *Помощь*\n"
            "/start — главное меню\n"
            "Мини-апп — все функции с интерфейсом\n"
            "Оплата: 500 ₽ на 4100118620135634 с указанием Telegram ID\n"
            "После оплаты администратор активирует доступ командой /pay\n"
            "Админ-панель: /admin\n"
            "Инструкция по авторизации: /auth_help",
            parse_mode="Markdown"
        )
    elif data == 'auth_help':
        await query.edit_message_text(
            "📘 *Инструкция по авторизации*\n\n"
            "🔐 *Google*: нажмите очистку → перейдите по ссылке → разрешите доступ → скопируйте код → отправьте боту.\n"
            "🐦 *Twitter*: нажмите очистку → перейдите по ссылке → получите PIN → отправьте боту.\n"
            "🇷🇺 *VK*: получите токен на vkhost.github.io (права wall) → вставьте в поле в мини-аппе.\n"
            "📸 *Instagram*: введите логин/пароль → сохраните.\n\n"
            "📖 Полная версия: /auth_help_full",
            parse_mode="Markdown"
        )
    else:
        await query.edit_message_text("Используйте мини-апп для полного доступа.")

async def auth_help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📘 *Подробная инструкция по авторизации*\n\n"
        "1. *Google (Gmail/Drive)*\n"
        "   - Нажмите кнопку очистки → перейдите по ссылке Google.\n"
        "   - Разрешите доступ → скопируйте код из адресной строки (часть после `code=`).\n"
        "   - Отправьте код боту.\n\n"
        "2. *Twitter*\n"
        "   - Нажмите кнопку очистки → перейдите по ссылке.\n"
        "   - Авторизуйтесь → получите PIN-код → отправьте боту.\n\n"
        "3. *VK*\n"
        "   - Получите Access Token на [vkhost.github.io](https://vkhost.github.io) (выберите `wall`).\n"
        "   - Вставьте токен в мини-апп или отправьте боту.\n\n"
        "4. *Instagram*\n"
        "   - Введите логин и пароль в мини-аппе.\n"
        "   - Сохраните данные и запустите очистку.\n\n"
        "Если возникли проблемы, свяжитесь с поддержкой: @admin",
        parse_mode="Markdown", disable_web_page_preview=True
    )

async def pay_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        await update.message.reply_text("Недостаточно прав.")
        return
    if not context.args:
        await update.message.reply_text("/pay USER_ID")
        return
    try:
        uid = int(context.args[0])
        set_paid(uid, True)
        await update.message.reply_text(f"✅ Пользователь {uid} активирован.")
        await context.bot.send_message(uid, "🎉 Доступ к SlateClean активирован! Используйте /start")
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")

async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        await update.message.reply_text("Нет доступа")
        return
    token = get_admin_token()
    url = f"{WEBAPP_URL}/admin?token={token}"
    await update.message.reply_text(f"Ссылка на админ-панель: {url}")

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("pay", pay_command))
    app.add_handler(CommandHandler("admin", admin_command))
    app.add_handler(CommandHandler("auth_help", auth_help_command))
    app.add_handler(CallbackQueryHandler(button_handler))
    logger.info("Бот запущен")
    app.run_polling()

if __name__ == "__main__":
    main()
