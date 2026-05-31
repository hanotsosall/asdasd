import tweepy
import os
from dotenv import load_dotenv
from utils import load_creds, save_creds

load_dotenv()
API_KEY = os.getenv("TWITTER_API_KEY")
API_SECRET = os.getenv("TWITTER_API_SECRET")

def get_auth_url():
    auth = tweepy.OAuth1UserHandler(API_KEY, API_SECRET)
    url = auth.get_authorization_url()
    return url, auth

def clean(user_id, pin, request_token):
    auth = tweepy.OAuth1UserHandler(API_KEY, API_SECRET)
    auth.request_token = request_token
    try:
        access_token, access_secret = auth.get_access_token(pin)
        save_creds(user_id, (access_token, access_secret), "twitter")
        api = tweepy.API(auth)
        tweets = api.user_timeline(count=200)
        deleted = 0
        for tweet in tweets:
            api.destroy_status(tweet.id)
            deleted += 1
        favs = api.favorites(count=200)
        for fav in favs:
            api.destroy_favorite(fav.id)
        return f"✅ Twitter очищен: удалено {deleted} твитов."
    except Exception as e:
        return f"❌ Ошибка Twitter: {e}"

def clean_with_existing_tokens(user_id):
    creds = load_creds(user_id, "twitter")
    if not creds:
        return "❌ Twitter не авторизован."
    access_token, access_secret = creds
    auth = tweepy.OAuth1UserHandler(API_KEY, API_SECRET, access_token, access_secret)
    api = tweepy.API(auth)
    try:
        tweets = api.user_timeline(count=200)
        deleted = 0
        for tweet in tweets:
            api.destroy_status(tweet.id)
            deleted += 1
        return f"✅ Twitter очищен: удалено {deleted} твитов."
    except Exception as e:
        return f"❌ Ошибка: {e}"
