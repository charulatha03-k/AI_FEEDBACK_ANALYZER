import sqlite3
import pandas as pd
from services.database_service import DB_NAME, get_feedback_dataframe


def get_sentiment_trend(app_id=None):
    df = get_feedback_dataframe(app_id=app_id)
    if df.empty or "sentiment" not in df.columns:
        return pd.DataFrame(columns=["Sentiment", "Count"])
    sentiment_data = (
        df["sentiment"]
        .value_counts()
        .reset_index()
    )
    sentiment_data.columns = [
        "Sentiment",
        "Count"
    ]
    return sentiment_data


def get_category_trend(app_id=None):
    df = get_feedback_dataframe(app_id=app_id)
    if df.empty or "category" not in df.columns:
        return pd.DataFrame(columns=["Category", "Count"])
    category_data = (
        df["category"]
        .value_counts()
        .reset_index()
    )
    category_data.columns = [
        "Category",
        "Count"
    ]
    return category_data


def get_source_trend(app_id=None):
    df = get_feedback_dataframe(app_id=app_id)
    if df.empty or "source" not in df.columns:
        return pd.DataFrame(columns=["Source", "Count"])
    source_data = (
        df["source"]
        .value_counts()
        .reset_index()
    )
    source_data.columns = [
        "Source",
        "Count"
    ]
    return source_data


def get_rating_trend(app_id=None):
    df = get_feedback_dataframe(app_id=app_id)
    if df.empty:
        return pd.DataFrame(columns=["rating"])
    rating_data = df.dropna(
        subset=["rating"]
    )
    return rating_data


def get_overall_metrics(app_id=None):
    df = get_feedback_dataframe(app_id=app_id)
    total_reviews = len(df)
    avg_rating = 0.0

    if (
        "rating" in df.columns
        and df["rating"].notna().sum() > 0
    ):
        avg_rating = round(
            float(df["rating"].mean()),
            2
        )

    # Let's count sentiments
    pos_count = len(df[df["sentiment"] == "Positive"]) if "sentiment" in df.columns else 0
    neg_count = len(df[df["sentiment"] == "Negative"]) if "sentiment" in df.columns else 0
    neu_count = len(df[df["sentiment"] == "Neutral"]) if "sentiment" in df.columns else 0

    pos_pct = round((pos_count / total_reviews * 100), 1) if total_reviews > 0 else 0
    neg_pct = round((neg_count / total_reviews * 100), 1) if total_reviews > 0 else 0
    neu_pct = round((neu_count / total_reviews * 100), 1) if total_reviews > 0 else 0

    # Reviews today (created_at matches today)
    # Since sqlite created_at is UTC standard, let's query today's reviews
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    if app_id and app_id != "all":
        cursor.execute("""
        SELECT COUNT(*)
        FROM reviews r
        LEFT JOIN apps a ON a.id = r.app_reference
        WHERE a.app_id = ? AND date(r.created_at) = date('now')
        """, (app_id,))
    else:
        cursor.execute("""
        SELECT COUNT(*)
        FROM reviews
        WHERE date(created_at) = date('now')
        """)
    reviews_today = cursor.fetchone()[0]
    conn.close()

    return {
        "total_reviews": total_reviews,
        "avg_rating": avg_rating,
        "positive_pct": pos_pct,
        "negative_pct": neg_pct,
        "neutral_pct": neu_pct,
        "reviews_today": reviews_today
    }


def get_sentiment_trend_by_date(days=30, app_id=None):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    # We query daily counts of Positive, Negative, Neutral reviews over the last N days
    if app_id and app_id != "all":
        query = """
        SELECT date(r.created_at) as date_val, r.sentiment, COUNT(*) as count
        FROM reviews r
        LEFT JOIN apps a ON a.id = r.app_reference
        WHERE a.app_id = ? AND r.created_at >= datetime('now', ?)
        GROUP BY date_val, r.sentiment
        ORDER BY date_val ASC
        """
        cursor.execute(query, (app_id, f'-{days} days'))
    else:
        query = """
        SELECT date(created_at) as date_val, sentiment, COUNT(*) as count
        FROM reviews
        WHERE created_at >= datetime('now', ?)
        GROUP BY date_val, sentiment
        ORDER BY date_val ASC
        """
        cursor.execute(query, (f'-{days} days',))
    rows = cursor.fetchall()
    conn.close()
    
    data_map = {}
    for date_str, sentiment, count in rows:
        if not date_str:
            continue
        if date_str not in data_map:
            data_map[date_str] = {"date": date_str, "Positive": 0, "Negative": 0, "Neutral": 0}
        
        # Normalize sentiment strings (sometimes LLM might return lowercase or mixed)
        sentiment_norm = sentiment.strip().capitalize()
        if sentiment_norm in ["Positive", "Negative", "Neutral"]:
            data_map[date_str][sentiment_norm] = count
            
    # Convert to sorted list of dicts
    result = sorted(list(data_map.values()), key=lambda x: x["date"])
    
    # If no data, populate mock trend data for demo/visual representation
    if not result:
        import datetime
        today = datetime.date.today()
        for i in range(days, -1, -1):
            d = today - datetime.timedelta(days=i)
            d_str = d.strftime("%Y-%m-%d")
            result.append({
                "date": d_str,
                "Positive": 0,
                "Negative": 0,
                "Neutral": 0
            })
            
    return result


def get_rating_distribution(app_id=None):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    if app_id and app_id != "all":
        query = """
        SELECT r.rating, COUNT(*) as count
        FROM reviews r
        LEFT JOIN apps a ON a.id = r.app_reference
        WHERE a.app_id = ? AND r.rating IS NOT NULL
        GROUP BY r.rating
        """
        cursor.execute(query, (app_id,))
    else:
        query = """
        SELECT rating, COUNT(*) as count
        FROM reviews
        WHERE rating IS NOT NULL
        GROUP BY rating
        """
        cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()
    
    dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for rating, count in rows:
        if rating in dist:
            dist[rating] = count
    return dist


def get_category_sentiment_trend(app_id=None):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    if app_id and app_id != "all":
        query = """
        SELECT r.category, r.sentiment, COUNT(*) as count
        FROM reviews r
        LEFT JOIN apps a ON a.id = r.app_reference
        WHERE a.app_id = ? AND r.category IS NOT NULL AND r.sentiment IS NOT NULL
        GROUP BY r.category, r.sentiment
        """
        cursor.execute(query, (app_id,))
    else:
        query = """
        SELECT category, sentiment, COUNT(*) as count
        FROM reviews
        WHERE category IS NOT NULL AND sentiment IS NOT NULL
        GROUP BY category, sentiment
        """
        cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()
    
    data_map = {}
    for category, sentiment, count in rows:
        if category not in data_map:
            data_map[category] = {"Category": category, "Positive": 0, "Negative": 0, "Neutral": 0, "Total": 0}
        
        sentiment_norm = sentiment.strip().capitalize()
        if sentiment_norm in ["Positive", "Negative", "Neutral"]:
            data_map[category][sentiment_norm] = count
            data_map[category]["Total"] += count
            
    # Sort categories by highest total count first
    result = sorted(list(data_map.values()), key=lambda x: x["Total"], reverse=True)
    return result