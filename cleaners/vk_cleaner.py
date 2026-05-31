import vk_api

def delete_vk_wall(user_id):
    creds = load_creds(user_id, "vk")
    if not creds:
        return 0
    vk_session = vk_api.VkApi(token=creds['access_token'])
    vk = vk_session.get_api()
    # Получаем посты
    posts = vk.wall.get(owner_id=creds['user_id'], count=100)
    deleted = 0
    for post in posts['items']:
        vk.wall.delete(owner_id=creds['user_id'], post_id=post['id'])
        deleted += 1
    return deleted
