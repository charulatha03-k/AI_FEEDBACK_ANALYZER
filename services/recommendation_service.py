import json
import sqlite3
from services.groq_service import ask_groq
from services.database_service import DB_NAME

def get_ai_recommendations(app_id=None):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    if app_id and app_id != "all":
        cursor.execute("""
            SELECT r.review, r.category, r.rating FROM reviews r
            LEFT JOIN apps a ON a.id = r.app_reference
            WHERE a.app_id = ? AND (r.sentiment IN ('Negative', 'Neutral') OR r.rating <= 3)
            ORDER BY r.created_at DESC LIMIT 50
        """, (app_id,))
    else:
        cursor.execute("""
            SELECT review, category, rating FROM reviews
            WHERE sentiment IN ('Negative', 'Neutral') OR rating <= 3
            ORDER BY created_at DESC LIMIT 50
        """)
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        if app_id and app_id != "all":
            cursor.execute("SELECT r.review, r.category, r.rating FROM reviews r LEFT JOIN apps a ON a.id = r.app_reference WHERE a.app_id = ? ORDER BY r.created_at DESC LIMIT 50", (app_id,))
        else:
            cursor.execute("SELECT review, category, rating FROM reviews ORDER BY created_at DESC LIMIT 50")
        rows = cursor.fetchall()
        conn.close()

    default_recommendations = [
        {
            "priority": "High",
            "title": "Fix Image Upload Crashes",
            "description": "Investigate crash logs related to photo attachment endpoints and optimize memory usage during upload to improve app stability.",
            "impact": "High"
        },
        {
            "priority": "Medium",
            "title": "Improve Delivery Speed",
            "description": "Partner with local delivery agents to optimize routes and set realistic ETA expectations on the UI.",
            "impact": "High"
        },
        {
            "priority": "Low",
            "title": "Enhance Pricing Transparency",
            "description": "Display tax and delivery breakdowns explicitly before the final checkout page to reduce cart abandonment.",
            "impact": "Medium"
        }
    ]

    if not rows:
        return default_recommendations

    reviews_text = "\n".join([f"- Category: {r[1]}, Rating: {r[2]}★ | Review: {r[0]}" for r in rows])

    prompt = f"""
    You are an AI business advisor. Analyze the following customer complaints/feedback:
    {reviews_text}

    Generate exactly 3 actionable business recommendations to improve the product and service.
    Return the response as a valid JSON array of objects. Do not include any markdown formatting, backticks, or text before/after the JSON. Just return raw JSON.

    Each object must have the following keys:
    - "priority": "High", "Medium", or "Low"
    - "title": Short action-oriented title (e.g., "Improve Delivery Performance")
    - "description": Clear description of the recommended action and why it matters
    - "impact": Expected business impact level — "High", "Medium", or "Low"

    Example structure:
    [
      {{"priority": "High", "title": "Improve Delivery Performance", "description": "Optimize logistics and set realistic delivery ETAs.", "impact": "High"}}
    ]
    """

    try:
        response = ask_groq(prompt).strip()
        if response.startswith("```json"):
            response = response[7:]
        elif response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]
        response = response.strip()

        recs = json.loads(response)
        if isinstance(recs, list) and len(recs) > 0:
            return recs
    except Exception as e:
        print(f"Error parsing AI recommendations, using fallback: {str(e)}")

    return default_recommendations
