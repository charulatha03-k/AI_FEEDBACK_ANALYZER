import streamlit as st
import pandas as pd
import plotly.express as px

from services.sentiment_service import get_sentiment
from services.category_service import get_category
from services.summary_service import generate_summary

from services.database_service import (
    create_table,
    save_feedback,
    review_exists,
    get_feedback_dataframe
)
from services.trend_service import (
    get_sentiment_trend,
    get_category_trend,
    get_source_trend,
    get_rating_trend,
    get_overall_metrics
)

trend_df = get_sentiment_trend()

from services.playstore_service import (
    fetch_playstore_reviews
)

# ----------------------------------
# Initialize Database
# ----------------------------------
create_table()

# ----------------------------------
# Streamlit Config
# ----------------------------------
st.set_page_config(
    page_title="AI Feedback Analyzer",
    layout="wide"
)

st.title("📊 AI Feedback Analyzer")

# ----------------------------------
# Select Data Source
# ----------------------------------
source = st.radio(
    "Select Data Source",
    [
        "CSV Upload",
        "Play Store Reviews"
    ]
)

# ==================================================
# CSV UPLOAD
# ==================================================
if source == "CSV Upload":

    uploaded_file = st.file_uploader(
        "Upload Reviews CSV",
        type=["csv"]
    )

    if uploaded_file:

        try:

            df = pd.read_csv(uploaded_file)

            if "review" not in df.columns:

                st.error(
                    "CSV must contain a 'review' column"
                )

            else:

                df = df.dropna(
                    subset=["review"]
                )

                df["review"] = (
                    df["review"]
                    .astype(str)
                )

                st.success(
                    f"{len(df)} reviews loaded successfully"
                )

                st.dataframe(df)

                if st.button(
                    "🚀 Run Full AI Analysis"
                ):

                    sentiments = []
                    categories = []

                    progress = st.progress(0)

                    total = len(df)

                    for i, row in df.iterrows():

                        review = row["review"]

                        sentiment = (
                            get_sentiment(review)
                        )

                        category = (
                            get_category(review)
                        )

                        sentiments.append(
                            sentiment
                        )

                        categories.append(
                            category
                        )

                        progress.progress(
                            (i + 1) / total
                        )

                    df["sentiment"] = sentiments
                    df["category"] = categories

                    # Save To Database
                    for _, row in df.iterrows():

                        save_feedback(
                            "CSV",
                            row["review"],
                            None,
                            row["sentiment"],
                            row["category"]
                        )

                    st.session_state[
                        "df"
                    ] = df

                    st.success(
                        "Analysis Completed Successfully"
                    )

        except Exception as e:

            st.error(str(e))

# ==================================================
# PLAY STORE REVIEWS
# ==================================================
elif source == "Play Store Reviews":

    st.subheader(
        "📱 Fetch Play Store Reviews"
    )

    app_id = st.text_input(
        "Enter App ID",
        value="com.whatsapp"
    )

    review_count = st.slider(
        "Number of Reviews",
        min_value=10,
        max_value=100,
        value=20
    )

    if st.button(
        "📥 Fetch Reviews"
    ):

        try:

            reviews = (
                fetch_playstore_reviews(
                    app_id,
                    review_count
                )
            )

            df = pd.DataFrame(
                reviews
            )

            sentiments = []
            categories = []

            new_reviews = 0
            existing_reviews = 0

            progress = st.progress(0)

            total = len(df)

            for i, row in df.iterrows():

                review = row["review"]

                # -------------------------
                # Duplicate Check
                # -------------------------
                if review_exists(review):

                    existing_reviews += 1

                    sentiments.append(
                        "Already Analyzed"
                    )

                    categories.append(
                        "Already Analyzed"
                    )

                    progress.progress(
                        (i + 1) / total
                    )

                    continue

                sentiment = (
                    get_sentiment(review)
                )

                category = (
                    get_category(review)
                )

                sentiments.append(
                    sentiment
                )

                categories.append(
                    category
                )

                save_feedback(
                    "PlayStore",
                    review,
                    row["rating"],
                    sentiment,
                    category
                )

                new_reviews += 1

                progress.progress(
                    (i + 1) / total
                )

            df["sentiment"] = sentiments
            df["category"] = categories

            st.session_state[
                "df"
            ] = df

            st.success(
                f"{new_reviews} new reviews analyzed"
            )

            st.info(
                f"{existing_reviews} reviews already existed"
            )

        except Exception as e:

            st.error(str(e))

# ==================================================
# DASHBOARD
# ==================================================
if "df" in st.session_state:

    df = st.session_state["df"]

    tab1, tab2, tab3, tab4 = st.tabs(
    [
        "📊 Dashboard",
        "📈 Charts",
        "📈 Trend Analyzer",
        "🧠 AI Summary"
    ]
)

    # ----------------------------------
    # Dashboard
    # ----------------------------------
    with tab1:

        st.subheader(
            "Analysis Results"
        )

        st.dataframe(df)

        total_reviews = len(df)

        positive_reviews = len(
            df[
                df["sentiment"]
                == "Positive"
            ]
        )

        negative_reviews = len(
            df[
                df["sentiment"]
                == "Negative"
            ]
        )

        neutral_reviews = len(
            df[
                df["sentiment"]
                == "Neutral"
            ]
        )

        c1, c2, c3, c4 = (
            st.columns(4)
        )

        c1.metric(
            "Total Reviews",
            total_reviews
        )

        c2.metric(
            "Positive",
            positive_reviews
        )

        c3.metric(
            "Negative",
            negative_reviews
        )

        c4.metric(
            "Neutral",
            neutral_reviews
        )

    # ----------------------------------
    # Charts
    # ----------------------------------
    with tab2:

        sentiment_counts = (
            df["sentiment"]
            .value_counts()
            .reset_index()
        )

        sentiment_counts.columns = [
            "Sentiment",
            "Count"
        ]

        fig1 = px.pie(
            sentiment_counts,
            names="Sentiment",
            values="Count",
            title="Sentiment Analysis"
        )

        st.plotly_chart(
            fig1,
            use_container_width=True
        )

        category_counts = (
            df["category"]
            .value_counts()
            .reset_index()
        )

        category_counts.columns = [
            "Category",
            "Count"
        ]

        fig2 = px.bar(
            category_counts,
            x="Category",
            y="Count",
            title="Feedback Categories"
        )

        st.plotly_chart(
            fig2,
            use_container_width=True
        )

    with tab3:
        st.subheader("📈 Trend Analyzer")

        metrics = get_overall_metrics()

        st.metric(
            "Total Reviews",
            metrics["total_reviews"]
        )

        st.metric(
            "Average Rating",
            metrics["avg_rating"]
        )
                # ----------------------------------
        # Sentiment Trend
        # ----------------------------------
        st.subheader(
            "😊 Sentiment Trend"
        )

        sentiment_data = (
            get_sentiment_trend()
        )

        fig_sentiment = px.bar(
            sentiment_data,
            x="Sentiment",
            y="Count",
            title="Sentiment Distribution"
        )

        st.plotly_chart(
            fig_sentiment,
            width="stretch"
        )

        # ----------------------------------
        # Category Trend
        # ----------------------------------
        st.subheader(
            "📂 Category Trend"
        )

        category_data = (
            get_category_trend()
        )

        fig_category = px.bar(
            category_data,
            x="Category",
            y="Count",
            title="Category Distribution"
        )

        st.plotly_chart(
            fig_category,
            width="stretch"
        )

        # ----------------------------------
        # Source Trend
        # ----------------------------------
        st.subheader(
            "📥 Review Source Trend"
        )

        source_data = (
            get_source_trend()
        )

        fig_source = px.pie(
            source_data,
            names="Source",
            values="Count",
            title="Feedback Source Analysis"
        )

        st.plotly_chart(
            fig_source,
            width="stretch"
        )

        # ----------------------------------
        # Rating Trend
        # ----------------------------------
        st.subheader(
            "⭐ Rating Trend"
        )

        rating_data = (
            get_rating_trend()
        )

        if not rating_data.empty:

            fig_rating = px.histogram(
                rating_data,
                x="rating",
                title="Rating Distribution"
            )

            st.plotly_chart(
                fig_rating,
                width="stretch"
            )

        else:

            st.info(
                "No ratings available yet."
            )

        # ----------------------------------
        # AI Summary
        # ----------------------------------
        with tab4:

            if st.button(
                "Generate AI Summary"
            ):

                summary = generate_summary(
                    df["review"].tolist()
                )

                st.session_state[
                    "summary"
                ] = summary

            if "summary" in st.session_state:

                st.subheader(
                    "Business Insights"
                )

                st.write(
                    st.session_state[
                        "summary"
                    ]
                )

    # ----------------------------------
    # Download Results
    # ----------------------------------
    st.download_button(
        "⬇ Download Results CSV",
        df.to_csv(index=False),
        file_name="feedback_results.csv",
        mime="text/csv"
    )
   