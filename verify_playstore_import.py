import sqlite3
import datetime
from services.database_service import create_table, get_or_create_app, save_feedback, review_exists, DB_NAME
from services.playstore_service import fetch_playstore_reviews
from services.sentiment_service import get_sentiment
from services.category_service import get_category

create_table()

reviews_data = fetch_playstore_reviews('com.whatsapp', count=5)
print('Fetched', len(reviews_data), 'reviews')
if not reviews_data:
    raise SystemExit('No reviews fetched')

app_meta = reviews_data[0].get('app_metadata', {})
app_ref = get_or_create_app(
    app_meta.get('app_id'),
    app_name=app_meta.get('app_name'),
    developer=app_meta.get('developer'),
    icon_url=app_meta.get('icon_url'),
    playstore_category=app_meta.get('playstore_category'),
)
print('App ref', app_ref)
new = 0
dup = 0
for item in reviews_data:
    review_text = (item.get('review') or '').strip()
    if not review_text:
        continue
    if review_exists(review_text, app_id=app_meta.get('app_id')):
        dup += 1
        continue
    rating = item.get('rating')
    sentiment = get_sentiment(review_text)
    category = get_category(review_text)
    saved = save_feedback(
        'PlayStore',
        review_text,
        rating,
        sentiment,
        category,
        app_id=app_meta.get('app_id'),
        app_name=app_meta.get('app_name'),
        developer=app_meta.get('developer'),
        icon_url=app_meta.get('icon_url'),
        playstore_category=app_meta.get('playstore_category'),
        review_date=datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        language='en',
    )
    print('saved', saved, review_text[:60])
    if saved:
        new += 1
    else:
        dup += 1

print('new', new, 'dup', dup)
conn = sqlite3.connect(DB_NAME)
cur = conn.cursor()
cur.execute('SELECT a.app_name, COUNT(*) FROM reviews r JOIN apps a ON r.app_reference=a.id WHERE a.app_id=? GROUP BY a.app_name', (app_meta.get('app_id'),))
print('counts', cur.fetchall())
conn.close()
