
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

    # Normalize output (important for consistency)
    result_lower = result.lower()

    if "product" in result_lower:
        return "Product Quality"
    elif "delivery" in result_lower:
        return "Delivery"
    elif "pricing" in result_lower or "price" in result_lower:
        return "Pricing"
    elif "support" in result_lower:
        return "Customer Support"
    elif "website" in result_lower or "ui" in result_lower:
        return "Website Experience"
    else:
        return "Other"