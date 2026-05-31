import os
import logging
from datetime import datetime
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
import utils
from cleaners import gmail_cleaner, drive_cleaner, twitter_cleaner, instagram_cleaner, vk_cleaner, account_deleter, ai_advisor

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", 0))

logging.basicConfig(level=logging.INFO)

# Хранилище paid статусов (в реальности БД)
user_paid = {}

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🧠 ИИ-анализ цифрового следа", callback_data='ai_analyze')],
        [InlineKeyboardButton("📧 Полная очистка Gmail", callback_data='clean_gmail')],
        [InlineKeyboardButton("🗑️ Очистка Google Drive", callback_data='clean_drive')],
        [InlineKeyboardButton("🐦 Очистка Twitter", callback_data='clean_twitter')],
        [InlineKeyboardButton("📸 Очистка Instagram", callback_data='clean_instagram')],
        [InlineKeyboardButton("🇷🇺 Очистка VK", callback_data='clean_vk')],
        [InlineKeyboardButton("🌐 Удаление аккаунтов с сайтов", callback_data='delete_accounts')],
        [InlineKeyboardButton("💳 Оплатить доступ (500 ₽)", callback_data='buy')],
        [InlineKeyboardButton("❓ Помощь", callback_data='help')],
    ]
    await update.message.reply_text(
        "🤖 *SlateClean ULTIMATE* — полная зачистка цифрового следа с помощью ИИ.\n"
        "Выберите действие:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data
    user_id = update.effective_user.id

    if data == 'buy':
        label = utils.generate_payment_label(user_id)
        context.user_data['payment_label'] = label
        # Кошелек 4100118620135634
        payment_url = f"https://yoomoney.ru/transfer?receiver=4100118620135634&amount=500&label={label}"
        keyboard = [
            [InlineKeyboardButton("💳 Перевести 500 ₽", url=payment_url)],
            [InlineKeyboardButton("✅ Я перевел", callback_data='check_payment')]
        ]
        await query.edit_message_text(
            "💰 Стоимость полного доступа ко всем функциям — **500 ₽** (разово).\n\n"
            f"Переведите 500 ₽ на кошелек `4100118620135634` с указанием метки:\n`{label}`\n\n"
            "Или нажмите кнопку для быстрого перевода.",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown"
        )

    elif data == 'check_payment':
        label = context.user_data.get('payment_label')
        if not label:
            await query.edit_message_text("❌ Ошибка: начните оплату заново /start → Оплатить")
            return
        if utils.check_yoomoney_payment(label):
            user_paid[user_id] = True
            await query.edit_message_text("✅ Оплата подтверждена! Теперь вам доступны все функции очистки.")
            if ADMIN_ID:
                await context.bot.send_message(ADMIN_ID, f"Пользователь {user_id} оплатил 500₽")
        else:
            await query.edit_message_text("⏳ Платёж не найден. Убедитесь, что перевели ровно 500 ₽ с указанием метки, и нажмите снова.")

    elif data == 'ai_analyze':
        if not user_paid.get(user_id, False):
            await query.edit_message_text("🚫 Доступ платный. Сначала оплатите /buy")
            return
        await query.edit_message_text("🧠 Анализирую ваш цифровой след... (может занять минуту)")
        report = ai_advisor.analyze_digital_footprint(user_id)
        await query.edit_message_text(report)

    elif data == 'clean_gmail':
        if not user_paid.get(user_id, False):
            await query.edit_message_text("🚫 Оплатите доступ")
            return
        # Проверяем авторизацию Gmail, если нет - отправляем ссылку (упрощённо)
        await query.edit_message_text("📧 Начинаю очистку Gmail...")
        deleted_emails = gmail_cleaner.delete_all_emails(user_id, days_old=180, exclude_important=True)
        unsubscribed = gmail_cleaner.unsubscribe_from_all_lists(user_id)
        await query.edit_message_text(f"✅ Удалено писем: {deleted_emails}\nОтписано от рассылок: {unsubscribed}")

    elif data == 'clean_drive':
        # аналогично
        await query.edit_message_text("🗑️ Поиск и удаление дубликатов в Drive...")
        deleted = drive_cleaner.find_and_delete_duplicates(user_id)
        await query.edit_message_text(f"✅ Удалено дубликатов файлов: {deleted}")

    elif data == 'clean_twitter':
        # Заглушка: нужно сначала авторизовать Twitter через отдельный диалог
        await query.edit_message_text("🐦 Очистка Twitter...")
        tweets_deleted = twitter_cleaner.delete_all_tweets(user_id)
        await query.edit_message_text(f"✅ Удалено твитов: {tweets_deleted}")

    # ... другие команды

    elif data == 'help':
        await query.edit_message_text("Полный спектр услуг: удаление email, дубликатов файлов, постов в соцсетях, ИИ-анализ. Оплата 500 ₽ разово.")

def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button_callback))
    app.run_polling()

if __name__ == "__main__":
    main()
