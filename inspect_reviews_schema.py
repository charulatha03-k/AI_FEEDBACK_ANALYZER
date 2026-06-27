import sqlite3

conn = sqlite3.connect('feedback.db')
cur = conn.cursor()
cur.execute("SELECT type, name, sql FROM sqlite_master WHERE name LIKE 'reviews%' ORDER BY type, name")
rows = cur.fetchall()
for row in rows:
    print(row)
conn.close()
