import os
import logging
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))
WEBAPP_URL = os.getenv("WEBAPP_URL")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Хранилище оплаченных пользователей (в реальности БД)
paid_users = set()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🚀 Открыть мини-апп", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton("📖 О сервисе", callback_data='about')],
        [InlineKeyboardButton("💰 Оплатить доступ", callback_data='buy')],
        [InlineKeyboardButton("📧 Очистить Gmail", callback_data='clean_gmail')],
        [InlineKeyboardButton("🗑️ Очистить Drive", callback_data='clean_drive')],
        [InlineKeyboardButton("🐦 Очистить Twitter", callback_data='clean_twitter')],
        [InlineKeyboardButton("🇷🇺 Очистить VK", callback_data='clean_vk')],
        [InlineKeyboardButton("📸 Очистить Instagram", callback_data='clean_instagram')],
        [InlineKeyboardButton("💳 Проверить карту", callback_data='check_card')],
        [InlineKeyboardButton("🔐 Проверить утечки", callback_data='check_breaches')],
        [InlineKeyboardButton("🧠 ИИ-совет", callback_data='ai_advice')],
        [InlineKeyboardButton("❓ Помощь", callback_data='help')],
    ]
    await update.message.reply_text(
        "🔥 *SlateClean* — профессиональная зачистка цифрового следа.\n\n"
        "Выберите действие:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    user_id = update.effective_user.id

    if data == 'about':
        await query.edit_message_text(
            "📖 *SlateClean* — сервис для удаления цифрового мусора.\n\n"
            "Мы очищаем Gmail, Google Drive, Twitter, VK, Instagram, находим скрытые подписки, проверяем утечки, генерируем письма для удаления аккаунтов.\n\n"
            "Безопасно: только OAuth, без паролей. Подробнее в мини-аппе /about",
            parse_mode="Markdown"
        )
        return
    if data == 'buy':
        await query.edit_message_text(
            f"💰 *Оплата доступа*: 500 ₽ разово\n\n"
            f"Переведите на кошелёк ЮMoney:\n`4100118620135634`\n\n"
            f"В комментарии укажите ваш Telegram ID: `{user_id}`\n\n"
            f"После перевода нажмите «Я перевел» в мини-аппе. Администратор активирует доступ.",
            parse_mode="Markdown"
        )
        return
    if data in ('clean_gmail', 'clean_drive', 'clean_twitter', 'clean_vk', 'clean_instagram', 'check_card', 'check_breaches', 'ai_advice'):
        if user_id not in paid_users:
            await query.edit_message_text("🚫 Доступ платный. Оплатите 500 ₽ (кнопка «Оплатить доступ»).")
            return
        await query.edit_message_text("✅ Для выполнения этой операции используйте мини-апп (кнопка выше).")
        return
    if data == 'help':
        await query.edit_message_text(
            "❓ *Помощь*\n\n"
            "/start – главное меню\n"
            "Мини-апп – все функции очистки\n"
            "Оплата: 500 ₽ на 4100118620135634 с комментарием (ваш Telegram ID)\n\n"
            "Техподдержка: @admin",
            parse_mode="Markdown"
        )
        return
    await query.edit_message_text("Функция в разработке. Используйте мини-апп.")

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
        await context.bot.send_message(uid, "🎉 Доступ к SlateClean активирован! Используйте /start")
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("pay", pay_command))
    app.add_handler(CallbackQueryHandler(button_handler))
    logger.info("Бот запущен")
    app.run_polling()

if __name__ == "__main__":
    main()
