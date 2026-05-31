import requests
from datetime import datetime, timedelta
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from utils import load_creds, save_creds

SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

def get_auth_url():
    flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
    auth_url, _ = flow.authorization_url(prompt='consent')
    return auth_url, flow

def get_service(user_id, flow=None, code=None):
    creds = load_creds(user_id, "gmail")
    if not creds or not creds.valid:
        if flow and code:
            flow.fetch_token(code=code)
            creds = flow.credentials
            save_creds(user_id, creds, "gmail")
        else:
            return None
    return build('gmail', 'v1', credentials=creds)

def delete_old_emails(user_id, keep_days=30):
    service = get_service(user_id)
    if not service:
        return "❌ Gmail не авторизован"
    before_date = (datetime.now() - timedelta(days=keep_days)).strftime('%Y/%m/%d')
    query = f"before:{before_date} -is:starred -is:important"
    results = service.users().messages().list(userId='me', q=query, maxResults=500).execute()
    messages = results.get('messages', [])
    deleted = 0
    for msg in messages:
        try:
            service.users().messages().delete(userId='me', id=msg['id']).execute()
            deleted += 1
        except:
            pass
    return f"✅ Удалено {deleted} старых писем (старше {keep_days} дней)."

def unsubscribe_all(user_id):
    service = get_service(user_id)
    if not service:
        return "❌ Gmail не авторизован"
    results = service.users().messages().list(userId='me', q='unsubscribe OR list-unsubscribe', maxResults=200).execute()
    messages = results.get('messages', [])
    unsub_count = 0
    for msg in messages:
        msg_data = service.users().messages().get(userId='me', id=msg['id'], format='metadata').execute()
        headers = msg_data.get('payload', {}).get('headers', [])
        unsub_url = None
        for h in headers:
            if h['name'].lower() == 'list-unsubscribe':
                unsub_url = h['value']
                break
        if unsub_url:
            try:
                requests.get(unsub_url, timeout=5)
                unsub_count += 1
            except:
                pass
        service.users().messages().delete(userId='me', id=msg['id']).execute()
    return f"✅ Отписано от {unsub_count} рассылок, удалено {len(messages)} писем."
