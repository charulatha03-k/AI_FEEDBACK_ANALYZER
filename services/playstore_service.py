from google_play_scraper import reviews, app


def fetch_playstore_reviews(app_id, count=50):
    result, _ = reviews(app_id, lang="en", country="in", count=count)
    app_data = app(app_id)

    app_metadata = {
        "app_id": app_data.get("appId") or app_id,
        "app_name": app_data.get("title") or app_data.get("appName") or app_id,
        "developer": app_data.get("developer") or app_data.get("developerName"),
        "icon_url": app_data.get("icon") or app_data.get("iconUrl"),
        "playstore_category": app_data.get("genre") or app_data.get("category"),
    }

    review_list = []
    for item in result:
        review_list.append(
            {
                "review": item.get("content"),
                "rating": item.get("score"),
                "app_metadata": app_metadata,
            }
        )

    return review_list