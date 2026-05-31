import os
import shutil

def clear_user_sessions(user_id):
    path = f"tokens/{user_id}"
    if os.path.exists(path):
        shutil.rmtree(path)
        print(f"Сессии пользователя {user_id} удалены.")
    else:
        print("Сессий не найдено.")

if __name__ == "__main__":
    uid = input("Telegram ID: ")
    clear_user_sessions(uid)
