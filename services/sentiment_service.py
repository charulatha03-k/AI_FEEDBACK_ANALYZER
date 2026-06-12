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

    result = ask_groq(prompt)

    return result.strip()