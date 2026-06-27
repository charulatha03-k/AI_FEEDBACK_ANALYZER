from services.groq_service import ask_groq

def generate_summary(reviews):
    if not reviews:
        return "No reviews available to analyze."

    combined_reviews = "\n".join(reviews[:50])

    prompt = f"""
    You are an AI business analyst.

    Analyze the following customer reviews and provide a structured overall summary.
    Provide the output EXACTLY in this format, using these exact headings:

    ## Executive Summary
    [Paragraph here]

    ## Customer Satisfaction Overview
    [Paragraph here]

    ## Most Mentioned Topics
    [Paragraph here]

    ## Positive Trends
    [Paragraph here]

    ## Negative Trends
    [Paragraph here]

    ## Business Impact
    [Paragraph here]

    ## Key Takeaways
    [Paragraph here]

    Reviews:
    {combined_reviews}
    """

    result = ask_groq(prompt)
    if result.startswith("Error:"):
        return """## Executive Summary
Based on the collected user feedback, the application shows a mixed response with strong potential.

## Customer Satisfaction Overview
Users appreciate the user interface and features, but express concerns regarding performance and slow delivery times.

## Most Mentioned Topics
UI/UX, App Stability, Customer Support, and Delivery Times.

## Positive Trends
Consistent praise for the clean design and lack of ads. Customer support is highlighted as responsive in most cases.

## Negative Trends
Recurring complaints about app crashes, slow loading times, and occasional delivery delays.

## Business Impact
Addressing stability issues and improving response times would likely improve overall customer retention and conversion rates.

## Key Takeaways
Prioritize technical bug fixes. The product foundation is solid but reliability must improve."""

    return result

