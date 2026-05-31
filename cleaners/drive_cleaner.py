from datetime import datetime, timedelta
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from utils import load_creds, save_creds

SCOPES = ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file']

def get_auth_url():
    flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
    auth_url, _ = flow.authorization_url(prompt='consent')
    return auth_url, flow

def get_service(user_id, flow=None, code=None):
    creds = load_creds(user_id, "drive")
    if not creds or not creds.valid:
        if flow and code:
            flow.fetch_token(code=code)
            creds = flow.credentials
            save_creds(user_id, creds, "drive")
        else:
            return None
    return build('drive', 'v3', credentials=creds)

def delete_duplicates(user_id):
    service = get_service(user_id)
    if not service:
        return "❌ Google Drive не авторизован"
    page_token = None
    hash_map = {}
    deleted = 0
    while True:
        response = service.files().list(
            q="trashed=false",
            fields="nextPageToken, files(id, name, md5Checksum, mimeType)",
            pageToken=page_token
        ).execute()
        for file in response.get('files', []):
            if file.get('md5Checksum') and file['mimeType'] != 'application/vnd.google-apps.folder':
                h = file['md5Checksum']
                if h in hash_map:
                    service.files().delete(fileId=file['id']).execute()
                    deleted += 1
                else:
                    hash_map[h] = file['id']
        page_token = response.get('nextPageToken', None)
        if not page_token:
            break
    return f"✅ Удалено дубликатов: {deleted}"

def delete_old_files(user_id, days=180):
    service = get_service(user_id)
    if not service:
        return "❌ Google Drive не авторизован"
    cutoff = (datetime.now() - timedelta(days=days)).isoformat() + 'Z'
    query = f"modifiedTime < '{cutoff}' and trashed = false"
    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get('files', [])
    deleted = 0
    for f in files:
        try:
            service.files().delete(fileId=f['id']).execute()
            deleted += 1
        except:
            pass
    return f"✅ Удалено {deleted} старых файлов (старше {days} дней)."
