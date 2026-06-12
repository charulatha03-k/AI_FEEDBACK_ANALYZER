import sqlite3

DB_NAME = "feedback.db"

def create_table():

    conn = sqlite3.connect(DB_NAME)

    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review TEXT,
        sentiment TEXT,
        category TEXT
    )
    """)

    conn.commit()
    conn.close()


def save_feedback(review, sentiment, category):

    conn = sqlite3.connect(DB_NAME)

    cursor = conn.cursor()

    cursor.execute("""
    INSERT INTO feedback
    (review, sentiment, category)
    VALUES (?, ?, ?)
    """, (review, sentiment, category))

    conn.commit()
    conn.close()


def get_all_feedback():

    conn = sqlite3.connect(DB_NAME)

    cursor = conn.cursor()

    cursor.execute("""
    SELECT * FROM feedback
    """)

    rows = cursor.fetchall()

    conn.close()

    return rows