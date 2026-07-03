import sqlite3

conn = sqlite3.connect('hermes_backend/hermes.db')
c = conn.cursor()

# Get all tables
c.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = c.fetchall()

print("Clearing tables...")
for table in tables:
    table_name = table[0]
    if table_name != 'sqlite_sequence':
        print(f"Deleting data from {table_name}")
        c.execute(f"DELETE FROM {table_name}")

conn.commit()
conn.close()
print("Database cleared successfully.")
