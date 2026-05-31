import openai

def analyze_digital_footprint(user_id):
    """Собирает метаданные (количество писем, файлов, постов) и через ИИ даёт рекомендации"""
    # Получаем статистику из каждого сервиса
    stats = {
        "emails_total": 0,
        "drive_files": 0,
        "tweets": 0,
        "instagram_posts": 0
    }
    prompt = f"Пользователь имеет {stats}. Что ему следует удалить в первую очередь для минимизации цифрового следа?"
    response = openai.ChatCompletion.create(model="gpt-3.5-turbo", messages=[{"role": "user", "content": prompt}])
    return response.choices[0].message.content
