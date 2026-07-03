import sqlite3
import hashlib

conn = sqlite3.connect('c:\\Users\\matia\\OneDrive\\Desktop\\hermeticos\\hermes_backend\\hermes.db')
c = conn.cursor()
c.execute("SELECT id_hash FROM users")
hashes = c.fetchall()

print("Registered hashes:")
for h in hashes:
    print(h[0])

# Compute hash of "bob"
h_bob = hashlib.sha256("bob".encode()).hexdigest()
print(f"Hash of 'bob': {h_bob}")
