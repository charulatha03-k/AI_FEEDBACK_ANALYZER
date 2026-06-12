from services.groq_service import ask_groq

def generate_summary(reviews):

    combined_reviews = "\n".join(reviews)

    prompt = f"""
    You are an AI business analyst.

    Analyze the following customer reviews and generate a structured report.

    Return output in this format:

    1. Overall Summary
    2. Major Complaints
    3. Key Strengths
    4. Business Improvement Suggestions

    Reviews:
    {combined_reviews}
    """

    result = ask_groq(prompt)

    return result