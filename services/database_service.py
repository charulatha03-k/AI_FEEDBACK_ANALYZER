import sqlite3
import os
import pandas as pd

DB_NAME = "feedback.db"


def _get_connection(check_same_thread=False):
    conn = sqlite3.connect(DB_NAME, timeout=30.0, isolation_level=None, check_same_thread=check_same_thread)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _infer_topic(review_text, category=None):
    text = (review_text or "").strip().lower()
    if category:
        return category
    if any(term in text for term in ["crash", "bug", "error", "freeze", "slow", "lag", "performance"]):
        return "Performance"
    if any(term in text for term in ["price", "cost", "cheap", "expensive", "billing", "pay"]):
        return "Pricing"
    if any(term in text for term in ["support", "help", "customer", "service"]):
        return "Support"
    if any(term in text for term in ["design", "ui", "ux", "interface", "layout"]):
        return "UI/UX"
    return "General"


def _migrate_reviews_remove_unique_constraint(cursor):
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='reviews'")
    row = cursor.fetchone()
    if not row or not row[0]:
        return

    create_sql = row[0].upper()
    has_review_unique = 'REVIEW TEXT UNIQUE' in create_sql or 'UNIQUE (REVIEW)' in create_sql or 'UNIQUE(REVIEW)' in create_sql

    if not has_review_unique:
        cursor.execute("PRAGMA index_list('reviews')")
        for index_row in cursor.fetchall():
            index_name = index_row[1]
            is_unique = index_row[2]
            if is_unique:
                cursor.execute(f"PRAGMA index_info('{index_name}')")
                index_columns = [item[2].upper() for item in cursor.fetchall()]
                if index_columns == ['REVIEW']:
                    has_review_unique = True
                    break

    if not has_review_unique:
        return

    cursor.execute("PRAGMA foreign_keys = OFF")
    cursor.execute("ALTER TABLE reviews RENAME TO reviews_old")
    cursor.execute("""
    CREATE TABLE reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_reference INTEGER,
        review TEXT NOT NULL,
        rating INTEGER,
        sentiment TEXT,
        category TEXT,
        topic TEXT,
        language TEXT,
        translated_review TEXT,
        source TEXT,
        review_date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_reference) REFERENCES apps(id)
    )
    """)
    cursor.execute("""
    INSERT INTO reviews (
        id,
        app_reference,
        review,
        rating,
        sentiment,
        category,
        topic,
        language,
        translated_review,
        source,
        review_date,
        created_at
    )
    SELECT
        id,
        app_reference,
        review,
        rating,
        sentiment,
        category,
        topic,
        language,
        translated_review,
        source,
        review_date,
        created_at
    FROM reviews_old
    """)
    cursor.execute("DROP TABLE reviews_old")
    cursor.execute("PRAGMA foreign_keys = ON")


def create_table():
    conn = _get_connection(check_same_thread=False)
    cursor = conn.cursor()

    cursor.execute("PRAGMA foreign_keys = ON")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id TEXT UNIQUE NOT NULL,
        app_name TEXT NOT NULL,
        developer TEXT,
        icon_url TEXT,
        playstore_category TEXT,
        last_fetched TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_reference INTEGER,
        review TEXT NOT NULL,
        rating INTEGER,
        sentiment TEXT,
        category TEXT,
        topic TEXT,
        language TEXT,
        translated_review TEXT,
        source TEXT,
        review_date TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(app_reference) REFERENCES apps(id)
    )
    """)

    _migrate_reviews_remove_unique_constraint(cursor)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_app_reference ON reviews(app_reference)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_app_reference_review ON reviews(app_reference, review)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_category ON reviews(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reviews_review_date ON reviews(review_date)")

    conn.commit()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='feedback'")
    if cursor.fetchone():
        migrate_feedback_to_reviews(cursor)

    conn.commit()
    conn.close()


def migrate_feedback_to_reviews(cursor):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='feedback'")
    if not cursor.fetchone():
        return

    cursor.execute("SELECT id, source, review, rating, sentiment, category, created_at FROM feedback")
    rows = cursor.fetchall()
    for row_id, source, review, rating, sentiment, category, created_at in rows:
        app_reference = get_or_create_app("imported-feedback", app_name="Imported Feedback")
        cursor.execute(
            """
            INSERT OR IGNORE INTO reviews (
                app_reference,
                review,
                rating,
                sentiment,
                category,
                topic,
                language,
                translated_review,
                source,
                review_date,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                app_reference,
                review,
                rating,
                sentiment,
                category,
                _infer_topic(review, category),
                "en",
                None,
                source,
                created_at,
                created_at,
            ),
        )

    cursor.execute("SELECT COUNT(*) FROM feedback")
    if cursor.fetchone()[0] > 0:
        cursor.execute("DROP TABLE feedback")


def review_exists(review, app_reference=None, app_id=None):
    conn = _get_connection(check_same_thread=False)
    try:
        cursor = conn.cursor()

        if app_reference is not None:
            cursor.execute(
                "SELECT id FROM reviews WHERE app_reference = ? AND review = ?",
                (app_reference, review),
            )
        elif app_id:
            cursor.execute(
                "SELECT r.id FROM reviews r LEFT JOIN apps a ON a.id = r.app_reference WHERE a.app_id = ? AND r.review = ?",
                (app_id, review),
            )
        else:
            cursor.execute(
                "SELECT id FROM reviews WHERE review = ?",
                (review,),
            )

        result = cursor.fetchone()
        return result is not None
    finally:
        conn.close()


def get_or_create_app(app_id, app_name=None, developer=None, icon_url=None, playstore_category=None, last_fetched=None):
    if not app_id:
        raise ValueError("app_id is required")

    app_name = app_name or app_id

    conn = _get_connection(check_same_thread=False)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM apps WHERE app_id = ?", (app_id,))
        row = cursor.fetchone()
        if row:
            app_ref = row[0]
            cursor.execute(
                "UPDATE apps SET app_name = ?, developer = ?, icon_url = ?, playstore_category = ?, last_fetched = ? WHERE id = ?",
                (app_name, developer, icon_url, playstore_category, last_fetched, app_ref),
            )
            conn.commit()
            return app_ref

        cursor.execute(
            """
            INSERT INTO apps (app_id, app_name, developer, icon_url, playstore_category, last_fetched)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (app_id, app_name, developer, icon_url, playstore_category, last_fetched),
        )
        app_ref = cursor.lastrowid
        conn.commit()
        return app_ref
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def list_apps():
    conn = _get_connection(check_same_thread=False)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, app_id, app_name, developer, icon_url, playstore_category, last_fetched, created_at,
                   (SELECT COUNT(*) FROM reviews WHERE app_reference = apps.id) AS review_count
            FROM apps
            ORDER BY app_name ASC
            """
        )
        rows = cursor.fetchall()
        columns = ["id", "app_id", "app_name", "developer", "icon_url", "playstore_category", "last_fetched", "created_at", "review_count"]
        return [dict(zip(columns, row)) for row in rows]
    finally:
        conn.close()


def save_feedback_batch(
    source,
    reviews,
    app_id=None,
    app_name=None,
    developer=None,
    icon_url=None,
    playstore_category=None,
):
    if not app_id:
        raise ValueError("app_id is required")
    if not reviews:
        return 0, 0

    app_reference = get_or_create_app(
        app_id,
        app_name=app_name,
        developer=developer,
        icon_url=icon_url,
        playstore_category=playstore_category,
    )

    conn = _get_connection(check_same_thread=False)
    try:
        cursor = conn.cursor()
        conn.execute("BEGIN IMMEDIATE")

        inserted = 0
        skipped = 0
        seen_reviews = set()

        for item in reviews:
            review_text = (item.get("review") or "").strip()
            if not review_text:
                continue

            if review_text in seen_reviews:
                skipped += 1
                continue

            seen_reviews.add(review_text)

            cursor.execute(
                "SELECT 1 FROM reviews WHERE app_reference = ? AND review = ? LIMIT 1",
                (app_reference, review_text),
            )
            if cursor.fetchone():
                skipped += 1
                continue

            cursor.execute(
                """
                INSERT OR IGNORE INTO reviews (
                    app_reference,
                    review,
                    rating,
                    sentiment,
                    category,
                    topic,
                    language,
                    translated_review,
                    source,
                    review_date,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    app_reference,
                    review_text,
                    item.get("rating"),
                    item.get("sentiment"),
                    item.get("category"),
                    item.get("topic") or _infer_topic(review_text, item.get("category")),
                    item.get("language") or "en",
                    item.get("translated_review"),
                    source,
                    item.get("review_date"),
                    item.get("review_date") or None,
                ),
            )
            if cursor.rowcount == 1:
                inserted += 1
            else:
                skipped += 1

        conn.commit()
        return inserted, skipped
    except sqlite3.IntegrityError:
        conn.rollback()
        return inserted, skipped
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def save_feedback(
    source,
    review,
    rating,
    sentiment,
    category,
    app_id=None,
    app_name=None,
    developer=None,
    icon_url=None,
    playstore_category=None,
    topic=None,
    language=None,
    translated_review=None,
    review_date=None,
):
    if not app_id:
        raise ValueError("app_id is required")

    try:
        app_reference = get_or_create_app(
            app_id,
            app_name=app_name,
            developer=developer,
            icon_url=icon_url,
            playstore_category=playstore_category,
        )

        if review_exists(review, app_reference=app_reference):
            return False

        conn = _get_connection(check_same_thread=False)
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO reviews (
                    app_reference,
                    review,
                    rating,
                    sentiment,
                    category,
                    topic,
                    language,
                    translated_review,
                    source,
                    review_date,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    app_reference,
                    review,
                    rating,
                    sentiment,
                    category,
                    topic or _infer_topic(review, category),
                    language or "en",
                    translated_review,
                    source,
                    review_date,
                    review_date or None,
                )
            )
            conn.commit()
            return True
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    except Exception:
        raise


def get_all_feedback():
    conn = _get_connection(check_same_thread=False)
    try:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT r.id, r.review, r.rating, r.sentiment, r.category, r.source, r.created_at, a.app_id, a.app_name
        FROM reviews r
        LEFT JOIN apps a ON a.id = r.app_reference
        ORDER BY r.created_at DESC
        """)
        rows = cursor.fetchall()
        return rows
    finally:
        conn.close()


def get_feedback_dataframe(app_id=None):
    conn = _get_connection(check_same_thread=False)
    try:
        query = """
        SELECT r.review AS review,
               r.rating AS rating,
               r.sentiment AS sentiment,
               r.category AS category,
               r.topic AS topic,
               r.source AS source,
               r.created_at AS created_at,
               r.review_date AS review_date,
               a.app_id AS app_id,
               a.app_name AS app_name
        FROM reviews r
        LEFT JOIN apps a ON a.id = r.app_reference
        """
        params = []
        if app_id and app_id != "all":
            query += " WHERE a.app_id = ?"
            params.append(app_id)

        df = pd.read_sql_query(query, conn, params=params)
        return df
    finally:
        conn.close()


def get_reviews_paginated(
    search=None,
    rating=None,
    sentiment=None,
    category=None,
    source=None,
    start_date=None,
    end_date=None,
    app_id=None,
    sort_by="created_at",
    sort_order="DESC",
    page=1,
    page_size=10,
):
    conn = _get_connection(check_same_thread=False)
    cursor = conn.cursor()

    query = """
    SELECT r.id, r.review, r.rating, r.sentiment, r.category, r.topic, r.language, r.translated_review,
           r.source, r.review_date, r.created_at, a.app_id, a.app_name
    FROM reviews r
    LEFT JOIN apps a ON a.id = r.app_reference
    WHERE 1=1
    """
    params = []

    if app_id and app_id != "all":
        query += " AND a.app_id = ?"
        params.append(app_id)

    if search:
        query += " AND r.review LIKE ?"
        params.append(f"%{search}%")

    if rating is not None:
        query += " AND r.rating = ?"
        params.append(rating)

    if sentiment:
        query += " AND r.sentiment = ?"
        params.append(sentiment)

    if category:
        query += " AND r.category = ?"
        params.append(category)

    if source:
        query += " AND r.source = ?"
        params.append(source)

    if start_date:
        query += " AND date(r.created_at) >= date(?)"
        params.append(start_date)

    if end_date:
        query += " AND date(r.created_at) <= date(?)"
        params.append(end_date)

    allowed_sort = ["id", "source", "review", "rating", "sentiment", "category", "created_at", "review_date", "app_name"]
    if sort_by not in allowed_sort:
        sort_by = "created_at"

    if sort_order.upper() not in ["ASC", "DESC"]:
        sort_order = "DESC"

    count_query = query.replace(
        "SELECT r.id, r.review, r.rating, r.sentiment, r.category, r.topic, r.language, r.translated_review,\n           r.source, r.review_date, r.created_at, a.app_id, a.app_name",
        "SELECT COUNT(*)",
    )
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()[0]

    query += f" ORDER BY r.{sort_by} {sort_order}" if sort_by in ["id", "source", "review", "rating", "sentiment", "category", "created_at", "review_date"] else f" ORDER BY a.app_name {sort_order}"
    query += " LIMIT ? OFFSET ?"
    params.extend([page_size, (page - 1) * page_size])

    cursor.execute(query, params)
    rows = cursor.fetchall()

    columns = ["id", "review", "rating", "sentiment", "category", "topic", "language", "translated_review", "source", "review_date", "created_at", "app_id", "app_name"]
    reviews = [dict(zip(columns, row)) for row in rows]

    conn.close()
    return reviews, total_count


def get_setting(key, default=None):
    conn = _get_connection(check_same_thread=False)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row[0] if row else default
    finally:
        conn.close()


def set_setting(key, value):
    conn = _get_connection(check_same_thread=False)
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
        conn.commit()
    finally:
        conn.close()