from services.database_service import save_feedback

save_feedback(
    "test123",
    "This app is awesome",
    5,
    "2026-06-13",
    "Positive",
    "UI"
)

print("Inserted")