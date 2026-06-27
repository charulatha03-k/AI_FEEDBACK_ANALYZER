from groq import Groq
from dotenv import load_dotenv
import os

load_dotenv()

def get_groq_client():
    from services.database_service import get_setting
    api_key = get_setting("groq_api_key")
    if not api_key or api_key.strip() == "":
        api_key = os.getenv("GROQ_API_KEY")
    
    if not api_key or api_key.strip() == "" or api_key == "YOUR_GROQ_API_KEY":
        return None
    try:
        return Groq(api_key=api_key)
    except Exception:
        return None

def ask_groq(prompt):
    from services.database_service import get_setting
    client = get_groq_client()
    if client is None:
        return "Error: GROQ_API_KEY is not configured. Please set it in the Settings page or in the .env file."
        
    model = get_setting("ai_model", "llama-3.3-70b-versatile")
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {str(e)}"