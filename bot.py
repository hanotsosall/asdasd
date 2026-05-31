import os
import logging
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://your-domain.up.railway.app")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Глобальное хранилище оплат (в памяти – для теста, в продакшене нужно БД)
paid_users = set()

# ---------- Команды и кнопки ----------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🚀 Открыть Мини-апп (всё управление)", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton("📖 Что это за сервис? Как работает? Безопасно ли?", callback_data='info')],
        [InlineKeyboardButton("💰 Оплатить доступ (500 ₽)", callback_data='buy')],
        [InlineKeyboardButton("⚙️ Команды бота", callback_data='commands')],
    ]
    await update.message.reply_text(
        "🔥 *SlateClean* — профессиональная цифровая санация.\n\n"
        "Выберите действие:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

async def info_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    text = (
        "*О сервисе SlateClean*\n\n"
        "SlateClean — это автоматизированный инструмент для полной зачистки вашего цифрового следа.\n\n"
        "*Что мы удаляем?*\n"
        "• Все старые письма в Gmail + отписка от рассылок\n"
        "• Дубликаты и старые файлы в Google Drive\n"
        "• Ваши посты в Twitter/VK/Instagram (где авторизуетесь)\n"
        "• Проверяем утечки вашего email\n"
        "• Анализируем банковскую выписку на скрытые подписки\n"
        "• Помогаем написать письма для удаления аккаунтов (ИИ)\n\n"
        "*Как это работает?*\n"
        "Вы даёте доступ через OAuth (или вводите токены) — мы ничего не храним, кроме временных ключей.\n"
        "Все операции выполняются напрямую через официальные API. Ваши данные не покидают сессию.\n\n"
        "*Безопасность*\n"
        "• Мы не запрашиваем пароли (кроме Instagram/VK, но они сохраняются локально на сервере)\n"
        "• Все токены хранятся в зашифрованном виде (в папке `tokens/` с ограниченным доступом)\n"
        "• Вы можете отозвать доступ в любой момент в настройках Google/соцсетей\n"
        "• Сервис не собирает статистику, не передаёт данные третьим лицам\n\n"
        "*Оплата*\n"
        "Стоимость доступа — *500 ₽ разово*. Перевод на кошелёк `4100118620135634` с указанием Telegram ID.\n"
        "После оплаты администратор активирует доступ (команда /pay).\n\n"
        "💬 Поддержка: @slateclean_support (замените на реальный контакт)"
    )
    await query.edit_message_text(text, parse_mode="Markdown", disable_web_page_preview=True)

async def buy_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = update.effective_user.id
    await query.edit_message_text(
        f"💰 *Оплата доступа*\n\n"
        f"Переведите 500 ₽ на кошелёк ЮMoney:\n"
        f"`4100118620135634`\n\n"
        f"**В комментарии укажите ваш Telegram ID:** `{user_id}`\n\n"
        f"После перевода нажмите «Оплатил» в Мини-аппе или напишите @admin. Доступ будет активирован вручную.",
        parse_mode="Markdown"
    )
    # Оповещение админу (можно вынести в отдельную функцию)
    if os.getenv("ADMIN_ID"):
        try:
            await context.bot.send_message(
                os.getenv("ADMIN_ID"),
                f"💸 Пользователь {user_id} запросил оплату. Кошелёк: 4100118620135634"
            )
        except:
            pass

async def commands_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    text = (
        "*Доступные команды бота:*\n\n"
        "/start — Главное меню\n"
        "/info — Полная информация о сервисе\n"
        "/buy — Инструкция по оплате\n"
        "/help — Справка\n\n"
        "Все остальные действия выполняются через *Мини-апп* — нажмите «Открыть Мини-апп» в главном меню."
    )
    await query.edit_message_text(text, parse_mode="Markdown")

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "📖 *Справка*\n"
        "/start – Главное меню\n"
        "/info – Подробно о сервисе, безопасности, как работает\n"
        "/buy – Инструкция по оплате\n"
        "Используйте Мини-апп для всех операций очистки.",
        parse_mode="Markdown"
    )

# Админская команда активации оплаты
async def pay_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != os.getenv("ADMIN_ID"):
        await update.message.reply_text("⛔ Недостаточно прав.")
        return
    if not context.args:
        await update.message.reply_text("Использование: /pay USER_ID")
        return
    try:
        uid = int(context.args[0])
        paid_users.add(uid)
        await update.message.reply_text(f"✅ Пользователь {uid} активирован.")
        # Уведомляем пользователя через бота
        await context.bot.send_message(uid, "🎉 Ваш доступ к SlateClean активирован! Используйте Мини-апп.")
    except Exception as e:
        await update.message.reply_text(f"Ошибка: {e}")

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("info", info_callback))
    app.add_handler(CommandHandler("buy", buy_callback))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("pay", pay_command))
    app.add_handler(CallbackQueryHandler(info_callback, pattern='^info$'))
    app.add_handler(CallbackQueryHandler(buy_callback, pattern='^buy$'))
    app.add_handler(CallbackQueryHandler(commands_callback, pattern='^commands$'))
    logger.info("Бот запущен")
    app.run_polling()

if __name__ == "__main__":
    main()
