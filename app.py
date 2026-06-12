import streamlit as st
import pandas as pd
import plotly.express as px

from services.sentiment_service import get_sentiment
from services.category_service import get_category
from services.summary_service import generate_summary

from services.database_service import (
    create_table,
    save_feedback,
    get_all_feedback
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
# Upload CSV
# ----------------------------------
uploaded_file = st.file_uploader(
    "Upload Reviews CSV",
    type=["csv"]
)

if uploaded_file:

    try:

        df = pd.read_csv(uploaded_file)

        if "review" not in df.columns:
            st.error("CSV must contain a 'review' column")

        else:

            df = df.dropna(subset=["review"])
            df["review"] = df["review"].astype(str)

            st.success(
                f"{len(df)} reviews loaded successfully"
            )

            st.subheader("Uploaded Reviews")
            st.dataframe(df)

            # ----------------------------------
            # Run Full Analysis
            # ----------------------------------
            if st.button("🚀 Run Full AI Analysis"):

                sentiments = []
                categories = []

                progress = st.progress(0)

                total = len(df)

                for i, row in df.iterrows():

                    review = row["review"]

                    sentiment = get_sentiment(review)
                    category = get_category(review)

                    sentiments.append(sentiment)
                    categories.append(category)

                    progress.progress(
                        (i + 1) / total
                    )

                df["sentiment"] = sentiments
                df["category"] = categories

                # ------------------------------
                # Save To SQLite
                # ------------------------------
                for _, row in df.iterrows():

                    save_feedback(
                        row["review"],
                        row["sentiment"],
                        row["category"]
                    )

                st.session_state["df"] = df

                st.success(
                    "Analysis Completed Successfully"
                )

    except Exception as e:

        st.error(str(e))

# ----------------------------------
# Dashboard
# ----------------------------------
if "df" in st.session_state:

    df = st.session_state["df"]

    tab1, tab2, tab3 = st.tabs(
        [
            "📊 Dashboard",
            "📈 Charts",
            "🧠 AI Summary"
        ]
    )

    # ----------------------------------
    # TAB 1 Dashboard
    # ----------------------------------
    with tab1:

        st.subheader("Analysis Results")

        st.dataframe(df)

        total_reviews = len(df)

        positive_reviews = len(
            df[df["sentiment"] == "Positive"]
        )

        negative_reviews = len(
            df[df["sentiment"] == "Negative"]
        )

        neutral_reviews = len(
            df[df["sentiment"] == "Neutral"]
        )

        c1, c2, c3, c4 = st.columns(4)

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
    # TAB 2 Charts
    # ----------------------------------
    with tab2:

        st.subheader("Sentiment Distribution")

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

        st.subheader("Category Distribution")

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

    # ----------------------------------
    # TAB 3 AI Summary
    # ----------------------------------
    with tab3:

        if st.button("Generate AI Summary"):

            with st.spinner(
                "Generating summary..."
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
                st.session_state["summary"]
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