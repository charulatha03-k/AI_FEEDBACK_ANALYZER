from services.playstore_service import fetch_playstore_reviews

reviews = fetch_playstore_reviews(
    "com.whatsapp",
    count=5
)

for review in reviews:
    print(review)