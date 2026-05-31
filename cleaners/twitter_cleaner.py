import tweepy

def get_twitter_api(user_id):
    creds = load_creds(user_id, "twitter")
    if not creds:
        return None
    auth = tweepy.OAuth1UserHandler(consumer_key, consumer_secret, creds['token'], creds['secret'])
    return tweepy.API(auth)

def delete_all_tweets(user_id):
    api = get_twitter_api(user_id)
    if not api:
        return 0
    tweets = api.user_timeline(count=200, tweet_mode='extended')
    deleted = 0
    for tweet in tweets:
        api.destroy_status(tweet.id)
        deleted += 1
    # для удаления старых нужно пагинация, упрощённо
    return deleted

def delete_all_likes(user_id):
    api = get_twitter_api(user_id)
    if not api:
        return 0
    likes = api.favorites(count=200)
    for like in likes:
        api.destroy_favorite(like.id)
    return len(likes)
