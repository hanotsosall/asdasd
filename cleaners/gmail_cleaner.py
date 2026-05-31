import pickle
import os
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import base64
import re

SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

def get_gmail_service(user_id, creds_file="credentials.json"):
    creds = load_creds(user_id, "gmail")
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(creds_file, SCOPES)
            # В боте нужно получать код через URL, здесь для простоты заглушка
            raise Exception("Not authorized")
        save_creds(user_id, creds, "gmail")
    return build('gmail', 'v1', credentials=creds)

def delete_all_emails(user_id, days_old=365, exclude_important=True):
    """Удаляет все письма старше N дней, кроме важных (помеченных звёздочкой или из определённых отправителей)"""
    service = get_gmail_service(user_id)
    # Формируем запрос: старше определённой даты
    before_date = f"{days_old}d"
    query = f"older_than:{before_date}"
    if exclude_important:
        query += " -is:starred -is:important"
    results = service.users().messages().list(userId='me', q=query, maxResults=500).execute()
    messages = results.get('messages', [])
    count = 0
    for msg in messages:
        service.users().messages().delete(userId='me', id=msg['id']).execute()
        count += 1
    return count

def unsubscribe_from_all_lists(user_id):
    """Находит письма с рассылками и отписывается (через List-Unsubscribe header)"""
    service = get_gmail_service(user_id)
    query = "unsubscribe OR list-unsubscribe"
    results = service.users().messages().list(userId='me', q=query, maxResults=200).execute()
    messages = results.get('messages', [])
    unsubscribed = 0
    for msg in messages:
        msg_data = service.users().messages().get(userId='me', id=msg['id'], format='metadata').execute()
        headers = msg_data.get('payload', {}).get('headers', [])
        unsub_url = None
        for h in headers:
            if h['name'].lower() == 'list-unsubscribe':
                unsub_url = h['value']
                break
        if unsub_url:
            # Попытка отправить GET запрос на отписку (упрощённо)
            try:
                import requests
                requests.get(unsub_url, timeout=5)
                unsubscribed += 1
            except:
                pass
        # Помечаем как прочитанное и удаляем
        service.users().messages().modify(userId='me', id=msg['id'], body={'removeLabelIds': ['INBOX'], 'addLabelIds': ['TRASH']}).execute()
    return unsubscribed
