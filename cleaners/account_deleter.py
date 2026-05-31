import openai
import os
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY

def generate_deletion_letter(service_name: str, email: str) -> str:
    if not OPENAI_API_KEY:
        return "🔐 OpenAI API ключ не задан."
    prompt = f"Напиши официальный запрос на удаление аккаунта с сайта {service_name} для email {email}. Ссылайся на GDPR, требуй удалить все персональные данные. Будь вежлив, но настойчив."
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Ошибка ИИ: {e}"
