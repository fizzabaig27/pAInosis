import bcrypt
import getpass
from modules.database import get_db_connection

def rotate_admin():
    print("=== Painsosis — Admin Rotation Tool ===\n")
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Show existing admins so you can see their IDs
    cursor.execute("SELECT id, username, email FROM users WHERE role = 'admin'")
    existing = cursor.fetchall()
    
    if existing:
        print("Current admin accounts:")
        for row in existing:
            print(f"  - ID: {row['id']} | Username: {row['username']} | Email: {row['email']}")
        print("-" * 50)
    else:
        print("No existing admins found! Please use seed_admin.py instead.")
        cursor.close()
        conn.close()
        return

    old_id = input("\nEnter the ID of the old admin you want to DELETE: ").strip()
    
    print("\nEnter details for the NEW admin:")
    username = input("New Admin username: ").strip()
    email = input("New Admin email: ").strip()
    full_name = input("New Admin full name: ").strip()
    password = getpass.getpass("New Admin password: ")
    password_confirm = getpass.getpass("Confirm password: ")

    if password != password_confirm:
        print("\nPasswords do not match. Aborted.")
        cursor.close()
        conn.close()
        return

    if len(password) < 8:
        print("\nPassword must be at least 8 characters. Aborted.")
        cursor.close()
        conn.close()
        return

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    try:
        # 1. Insert the new admin
        cursor.execute(
            """INSERT INTO users 
            (username, email, password_hash, full_name, role, is_approved, is_active) 
            VALUES (%s, %s, %s, %s, 'admin', TRUE, TRUE)""",
            (username, email, password_hash, full_name)
        )
        
        # 2. Delete the old admin by ID
        cursor.execute("DELETE FROM users WHERE id = %s AND role = 'admin'", (old_id,))

        # Commit changes if both queries succeed
        conn.commit()
        print(f"\n✓ Successfully created new admin '{username}' and removed old admin (ID: {old_id}).")

    except Exception as e:
        conn.rollback()
        print(f"\n✗ Failed to rotate admin: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    rotate_admin()