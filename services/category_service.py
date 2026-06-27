from services.groq_service import ask_groq


def get_category(review):

    prompt = f"""
    Classify the following customer review into ONE category only.

    Categories:
    - Product Quality
    - Delivery
    - Pricing
    - Customer Support
    - Website Experience
    - Other

    Return ONLY the category name.

    Review:
    {review}
    """

    result = ask_groq(prompt).strip()

    # Normalize response
    result_lower = result.lower()

    if "product" in result_lower:
        return "Product Quality"
    elif "delivery" in result_lower:
        return "Delivery"
    elif "pricing" in result_lower or "price" in result_lower:
        return "Pricing"
    elif "support" in result_lower:
        return "Customer Support"
    elif "website" in result_lower or "ui" in result_lower or "app" in result_lower:
        return "Website Experience"
    elif "other" in result_lower:
        return "Other"

    # Rule-based fallback if parsing the LLM response fails or if there is an error
    review_lower = review.lower()
    if "delivery" in review_lower or "shipping" in review_lower or "late" in review_lower or "delay" in review_lower or "arrive" in review_lower:
        return "Delivery"
    elif "price" in review_lower or "pricing" in review_lower or "cost" in review_lower or "expensive" in review_lower or "cheap" in review_lower or "money" in review_lower:
        return "Pricing"
    elif "support" in review_lower or "service" in review_lower or "help" in review_lower or "agent" in review_lower or "chat" in review_lower:
        return "Customer Support"
    elif "ui" in review_lower or "website" in review_lower or "app" in review_lower or "button" in review_lower or "slow" in review_lower or "crash" in review_lower or "navigation" in review_lower:
        return "Website Experience"
    elif "quality" in review_lower or "item" in review_lower or "product" in review_lower or "damage" in review_lower or "broken" in review_lower or "defect" in review_lower:
        return "Product Quality"
    else:
        return "Other"