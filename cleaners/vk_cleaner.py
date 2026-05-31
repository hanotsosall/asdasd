import vk_api
from utils import load_creds, save_creds

def clean(user_id, token=None):
    if token is None:
        token = load_creds(user_id, "vk")
        if not token:
            return "❌ VK не авторизован. Введите access token."
    try:
        vk_session = vk_api.VkApi(token=token)
        vk = vk_session.get_api()
        me = vk.users.get()[0]['id']
        posts = vk.wall.get(owner_id=me, count=100)
        deleted = 0
        for post in posts['items']:
            vk.wall.delete(owner_id=me, post_id=post['id'])
            deleted += 1
        return f"✅ VK: удалено {deleted} записей со стены."
    except Exception as e:
        return f"❌ Ошибка VK: {e}"

def save_token(user_id, token):
    save_creds(user_id, token, "vk")
