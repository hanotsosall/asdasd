from googleapiclient.discovery import build
from google.auth.transport.requests import Request
import hashlib
import io

def get_drive_service(user_id):
    # аналогично Gmail
    pass

def find_and_delete_duplicates(user_id):
    """Находит и удаляет дубликаты файлов по MD5"""
    service = get_drive_service(user_id)
    page_token = None
    hash_map = {}
    deleted = 0
    while True:
        response = service.files().list(q="trashed=false", fields="nextPageToken, files(id, name, md5Checksum, mimeType)", pageToken=page_token).execute()
        for file in response.get('files', []):
            if file.get('md5Checksum') and file['mimeType'] != 'application/vnd.google-apps.folder':
                h = file['md5Checksum']
                if h in hash_map:
                    # Удаляем дубликат
                    service.files().delete(fileId=file['id']).execute()
                    deleted += 1
                else:
                    hash_map[h] = file['id']
        page_token = response.get('nextPageToken', None)
        if not page_token:
            break
    return deleted

def delete_old_files(user_id, days=365):
    """Удаляет файлы, не изменявшиеся более N дней"""
    # реализация через query: 'modifiedTime < "2024-01-01T00:00:00Z"'
    pass
