import sqlite3
from services.database_service import create_table, get_or_create_app, save_feedback, DB_NAME

create_table()
get_or_create_app('com.whatsapp', app_name='WhatsApp Messenger', developer='Meta', icon_url='x', playstore_category='Communication')
get_or_create_app('com.instagram.android', app_name='Instagram', developer='Meta', icon_url='y', playstore_category='Social')
save_feedback('PlayStore', 'WhatsApp review sample', 5, 'Positive', 'Reliability', app_id='com.whatsapp', app_name='WhatsApp Messenger', developer='Meta', icon_url='x', playstore_category='Communication')
save_feedback('PlayStore', 'Instagram review sample', 4, 'Positive', 'Experience', app_id='com.instagram.android', app_name='Instagram', developer='Meta', icon_url='y', playstore_category='Social')

conn = sqlite3.connect(DB_NAME)
cur = conn.cursor()
cur.execute('SELECT id, app_id, app_name FROM apps ORDER BY id')
print('APPS', cur.fetchall())
cur.execute('SELECT app_reference, review FROM reviews ORDER BY id')
print('REVIEWS', cur.fetchall())
cur.execute('SELECT a.app_name, COUNT(*) AS total_reviews FROM reviews r JOIN apps a ON r.app_reference = a.id GROUP BY a.app_name')
print('COUNTS', cur.fetchall())
conn.close()
