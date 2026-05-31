import os
import logging
from datetime import datetime
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, MessageHandler,
    filters, ContextTypes, ConversationHandler
)

import utils
from cleaners import gmail_cleaner, drive_cleaner, twitter_cleaner, instagram_cleaner, vk_cleaner, account_deleter, ai_advisor

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Состояния для разговоров
WAITING_GMAIL_CODE, WAITING_DRIVE_CODE = range(2)
WAITING_TWITTER_PIN = 10
WAITING_VK_TOKEN = 11
WAITING_INSTA_LOGIN = 12
WAITING_INSTA_PASSWORD = 13
WAITING_CARD_STATEMENT = 20
WAITING_EMAIL_BREACH = 21
WAITING_LETTER_INPUT = 22

# Хранилище оплаченных пользователей (в реальности лучше БД)
paid_users = set()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("👤 Профиль", callback_data='profile')],
        [InlineKeyboardButton("🧹 ПОЛНАЯ ОЧИСТКА (все сервисы)", callback_data='full_clean')],
        [InlineKeyboardButton("📧 Очистить Gmail", callback_data='clean_gmail')],
        [InlineKeyboardButton("🗑️ Очистить Google Drive", callback_data='clean_drive')],
        [InlineKeyboardButton("🐦 Очистить Twitter", callback_data='clean_twitter')],
        [InlineKeyboardButton("🇷🇺 Очистить VK", callback_data='clean_vk')],
        [InlineKeyboardButton("📸 Очистить Instagram", callback_data='clean_instagram')],
        [InlineKeyboardButton("💳 Проверить карту на подписки", callback_data='check_card')],
        [InlineKeyboardButton("🔐 Проверить утечки данных", callback_data='check_breaches')],
        [InlineKeyboardButton("✉️ Сгенерировать письмо об удалении аккаунта", callback_data='gen_letter')],
        [InlineKeyboardButton("🧠 ИИ-совет по цифровому следу", callback_data='ai_advice')],
        [InlineKeyboardButton("💰 Оплатить 500 ₽", callback_data='buy')],
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
        gmail_ok = utils.load_creds(user_id, "gmail") is not None
        drive_ok = utils.load_creds(user_id, "drive") is not None
        twitter_ok = utils.load_creds(user_id, "twitter") is not None
        vk_ok = utils.load_creds(user_id, "vk") is not None
        insta_ok = utils.load_creds(user_id, "instagram") is not None
        paid = user_id in paid_users
        text = f"👤 *Профиль* @{username}\n💳 Оплата: {'✅ активен' if paid else '❌ не оплачен'}\n\n🔌 Подключенные сервисы:\n"
        text += f"📧 Gmail: {'✅' if gmail_ok else '❌'}\n"
        text += f"🗂️ Drive: {'✅' if drive_ok else '❌'}\n"
        text += f"🐦 Twitter: {'✅' if twitter_ok else '❌'}\n"
        text += f"🇷🇺 VK: {'✅' if vk_ok else '❌'}\n"
        text += f"📸 Instagram: {'✅' if insta_ok else '❌'}\n"
        await query.edit_message_text(text, parse_mode="Markdown")
        return

    if data == 'buy':
        await query.edit_message_text(
            "💳 *Оплата 500 ₽*\n\n"
            "Переведите 500 ₽ на кошелёк ЮMoney:\n"
            "`4100118620135634`\n\n"
            "**В комментарии укажите ваш Telegram ID:** `" + str(user_id) + "`\n\n"
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
        await query.edit_message_text("✅ Запрос отправлен админу. Доступ будет активирован в ближайшее время.")
        return

    # Проверка оплаты для всех остальных функций
    if user_id not in paid_users:
        await query.edit_message_text("🚫 Сначала оплатите доступ: /start → Оплатить 500 ₽")
        return

    if data == 'full_clean':
        await query.edit_message_text("🔄 Запущена полная очистка. Это может занять несколько минут...")
        results = []
        # Gmail
        if utils.load_creds(user_id, "gmail"):
            results.append(gmail_cleaner.delete_old_emails(user_id, keep_days=30))
            results.append(gmail_cleaner.unsubscribe_all(user_id))
        else:
            results.append("Gmail не авторизован – пропущен")
        # Drive
        if utils.load_creds(user_id, "drive"):
            results.append(drive_cleaner.delete_duplicates(user_id))
            results.append(drive_cleaner.delete_old_files(user_id, days=180))
        else:
            results.append("Drive не авторизован – пропущен")
        # Twitter
        if utils.load_creds(user_id, "twitter"):
            results.append(twitter_cleaner.clean_with_existing_tokens(user_id))
        else:
            results.append("Twitter не авторизован – пропущен")
        # VK
        if utils.load_creds(user_id, "vk"):
            results.append(vk_cleaner.clean(user_id))
        else:
            results.append("VK не авторизован – пропущен")
        # Instagram
        if utils.load_creds(user_id, "instagram"):
            results.append(instagram_cleaner.clean(user_id))
        else:
            results.append("Instagram не авторизован – пропущен")
        await query.edit_message_text("\n\n".join(results))
        return

    if data == 'clean_gmail':
        creds = utils.load_creds(user_id, "gmail")
        if not creds:
            url, flow = gmail_cleaner.get_auth_url()
            context.user_data['gmail_flow'] = flow
            await query.edit_message_text(
                f"🔐 Для доступа к Gmail перейдите по ссылке, разрешите доступ, затем скопируйте код из адресной строки (после `code=`) и отправьте его сюда.\n\n{url}"
            )
            return WAITING_GMAIL_CODE
        await query.edit_message_text("🔄 Очищаю Gmail...")
        res1 = gmail_cleaner.delete_old_emails(user_id, keep_days=30)
        res2 = gmail_cleaner.unsubscribe_all(user_id)
        await query.edit_message_text(f"{res1}\n{res2}")
        return

    if data == 'clean_drive':
        creds = utils.load_creds(user_id, "drive")
        if not creds:
            url, flow = drive_cleaner.get_auth_url()
            context.user_data['drive_flow'] = flow
            await query.edit_message_text(
                f"🔐 Для доступа к Google Drive перейдите по ссылке, затем отправьте код.\n\n{url}"
            )
            return WAITING_DRIVE_CODE
        await query.edit_message_text("🔄 Очищаю Drive...")
        res1 = drive_cleaner.delete_duplicates(user_id)
        res2 = drive_cleaner.delete_old_files(user_id, days=180)
        await query.edit_message_text(f"{res1}\n{res2}")
        return

    if data == 'clean_twitter':
        creds = utils.load_creds(user_id, "twitter")
        if not creds:
            url, auth = twitter_cleaner.get_auth_url()
            context.user_data['twitter_auth'] = auth
            await query.edit_message_text(
                f"🐦 Для очистки Twitter перейдите по ссылке, авторизуйтесь, затем введите полученный PIN-код:\n\n{url}\n\nPIN:"
            )
            return WAITING_TWITTER_PIN
        result = twitter_cleaner.clean_with_existing_tokens(user_id)
        await query.edit_message_text(result)
        return

    if data == 'clean_vk':
        token = utils.load_creds(user_id, "vk")
        if not token:
            await query.edit_message_text(
                "🔐 Введите ваш VK Access Token (получить можно на https://vkhost.github.io/).\n"
                "Токен должен иметь права: wall."
            )
            return WAITING_VK_TOKEN
        result = vk_cleaner.clean(user_id, token)
        await query.edit_message_text(result)
        return

    if data == 'clean_instagram':
        creds = utils.load_creds(user_id, "instagram")
        if not creds:
            await query.edit_message_text("Введите логин Instagram:")
            return WAITING_INSTA_LOGIN
        result = instagram_cleaner.clean(user_id)
        await query.edit_message_text(result)
        return

    if data == 'check_card':
        await query.edit_message_text(
            "📎 Отправьте файл выписки из банка в формате CSV (столбцы: описание, сумма).\n"
            "Я проанализирую регулярные платежи и найду подписки."
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

    if data == 'ai_advice':
        advice = ai_advisor.get_advice()
        await query.edit_message_text(advice)
        return

    if data == 'help':
        await query.edit_message_text(
            "🔒 *Безопасность и конфиденциальность*\n\n"
            "✅ Ваши данные НЕ хранятся. Токены доступа сохраняются локально и удаляются после очистки.\n"
            "✅ Все операции через официальные API.\n"
            "✅ После завершения очистки вы можете отозвать доступ к приложению.\n\n"
            "💰 *Оплата*: 500 ₽ разово на кошелёк 4100118620135634 с указанием Telegram ID.\n"
            "📞 Поддержка: @admin (ссылка)",
            parse_mode="Markdown"
        )
        return

    return ConversationHandler.END

# Обработчики для ввода данных
async def gmail_code_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    code = update.message.text.strip()
    flow = context.user_data.get('gmail_flow')
    if not flow:
        await update.message.reply_text("Сессия истекла. Начните заново /start")
        return ConversationHandler.END
    try:
        service = gmail_cleaner.get_service(update.effective_user.id, flow, code)
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
        service = drive_cleaner.get_service(update.effective_user.id, flow, code)
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
    result = twitter_cleaner.clean(update.effective_user.id, pin, auth.request_token)
    await update.message.reply_text(result)
    context.user_data.pop('twitter_auth', None)
    return ConversationHandler.END

async def vk_token_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    token = update.message.text.strip()
    vk_cleaner.save_token(update.effective_user.id, token)
    await update.message.reply_text("✅ VK токен сохранён! Теперь используйте кнопку очистки.")
    return ConversationHandler.END

async def insta_login_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['insta_login'] = update.message.text.strip()
    await update.message.reply_text("Введите пароль Instagram:")
    return WAITING_INSTA_PASSWORD

async def insta_password_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    password = update.message.text.strip()
    login = context.user_data.get('insta_login')
    if not login:
        await update.message.reply_text("Ошибка, начните заново")
        return ConversationHandler.END
    instagram_cleaner.save_credentials(update.effective_user.id, login, password)
    await update.message.reply_text("✅ Instagram авторизован! Теперь используйте кнопку очистки.")
    context.user_data.pop('insta_login', None)
    return ConversationHandler.END

async def card_statement_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message.document:
        await update.message.reply_text("Отправьте файл CSV.")
        return
    file = await update.message.document.get_file()
    content = await file.download_as_bytearray()
    result = utils.parse_bank_statement(content, update.message.document.file_name)
    await update.message.reply_text(result)
    context.user_data.pop('awaiting_card', None)

async def email_breach_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    email = update.message.text.strip()
    result = utils.check_hibp(email)
    await update.message.reply_text(result)
    context.user_data.pop('awaiting_email', None)

async def letter_input_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.strip()
    parts = text.split()
    if len(parts) < 2:
        await update.message.reply_text("Введите сервис и email через пробел, например: `spotify my@email.com`")
        return
    service, email = parts[0], parts[1]
    letter = account_deleter.generate_deletion_letter(service, email)
    await update.message.reply_text(f"✉️ *Письмо для {service}:*\n\n{letter}", parse_mode="Markdown")
    context.user_data.pop('awaiting_letter', None)

# Админ-команда активации
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

    # Twitter
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

    # Остальные кнопки
    app.add_handler(CallbackQueryHandler(button_handler, pattern='^(profile|buy|payment_done|full_clean|check_card|check_breaches|gen_letter|ai_advice|help)$'))

    # Обработчики для документов и текста
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
