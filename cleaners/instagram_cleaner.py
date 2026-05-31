import os
from instagrapi import Client
from utils import load_creds, save_creds
from dotenv import load_dotenv

load_dotenv()
DEFAULT_USERNAME = os.getenv("INSTA_USERNAME")
DEFAULT_PASSWORD = os.getenv("INSTA_PASSWORD")

def clean(user_id, username=None, password=None):
    if username is None or password is None:
        creds = load_creds(user_id, "instagram")
        if creds:
            username, password = creds
        else:
            return "❌ Instagram не авторизован."
    try:
        cl = Client()
        cl.login(username, password)
        user_id_insta = cl.user_id
        medias = cl.user_medias(user_id_insta, amount=50)
        deleted = 0
        for media in medias:
            cl.media_delete(media.id)
            deleted += 1
        cl.logout()
        return f"✅ Instagram: удалено {deleted} постов."
    except Exception as e:
        return f"❌ Ошибка Instagram: {e}"

def save_credentials(user_id, username, password):
    save_creds(user_id, (username, password), "instagram")
