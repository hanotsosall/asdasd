import requests
from bs4 import BeautifulSoup

def get_accounts_to_delete(user_email):
    """Ищет сервисы, где у пользователя есть аккаунт (через haveibeenpwned или вручную)"""
    # Заглушка: возвращает список популярных сервисов
    return ['spotify', 'netflix', 'old_forum.com']

def generate_deletion_request(service, email):
    """Использует OpenAI для составления письма на удаление аккаунта"""
    import openai
    prompt = f"Напиши официальный запрос на удаление аккаунта с сайта {service} для email {email}. Укажи причину: хочу удалить все данные."
    response = openai.ChatCompletion.create(model="gpt-3.5-turbo", messages=[{"role": "user", "content": prompt}])
    return response.choices[0].message.content
