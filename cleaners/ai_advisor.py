import openai
import os
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY

def get_advice() -> str:
    if not OPENAI_API_KEY:
        return "🧠 Для ИИ-советов добавьте OPENAI_API_KEY в .env"
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Дай 3 практических совета, как уменьшить цифровой след обычному человеку (email, соцсети, облака, поисковики)."}]
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Ошибка ИИ: {e}"
