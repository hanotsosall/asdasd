# SlateClean — Professional Digital Sanitation

SlateClean is a high‑end Telegram Mini App and Bot for removing digital footprint: clean Gmail, Drive, Twitter, VK, Instagram, find hidden subscriptions, check breaches, generate GDPR deletion letters, and get AI advice.

## Features
- **Google Gmail** – delete old emails + mass unsubscribe
- **Google Drive** – delete duplicates + old files
- **Twitter** – delete tweets, likes, retweets
- **VK** – delete wall posts
- **Instagram** – delete posts
- **Bank statement analysis** (CSV) – detect recurring payments
- **Have I Been Pwned** integration
- **AI‑generated deletion letters** (OpenAI)
- **AI advice** on digital footprint reduction

## Tech stack
- FastAPI + Uvicorn
- Telegram Bot API (python-telegram-bot)
- Google OAuth, Tweepy, vk-api, instagrapi
- OpenAI API
- Railway deployment ready

## Deployment
1. Set environment variables (`.env`)
2. Place `credentials.json` (Google OAuth)
3. Deploy on Railway with Dockerfile

## License
Private – for authorized use only.
