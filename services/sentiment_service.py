from services.groq_service import ask_groq

def get_sentiment(review):

    prompt = f"""
    Analyze the customer review below.

    Return ONLY one word:
    Positive
    Negative
    Neutral

    Review:
    {review}
    """

    result = ask_groq(prompt).strip()

    # Normalize result
    if result.startswith("Error:") or result not in ["Positive", "Negative", "Neutral"]:
        # Local keyword fallback
        review_lower = review.lower()
        pos_words = ["great", "awesome", "good", "love", "best", "perfect", "excellent", "happy", "satisfy", "fine"]
        neg_words = ["bad", "worst", "slow", "crash", "error", "fail", "expensive", "waste", "late", "damage", "poor", "hate", "issue", "bug"]
        
        pos_score = sum(1 for w in pos_words if w in review_lower)
        neg_score = sum(1 for w in neg_words if w in review_lower)
        
        if pos_score > neg_score:
            return "Positive"
        elif neg_score > pos_score:
            return "Negative"
        else:
            return "Neutral"

    return result