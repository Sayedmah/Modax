"""Create a local user without opening public signup. Run from repository root."""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from modax.api import Registration
from modax.config import Settings
from modax.store import Store, hash_password, uid

body = Registration(
    username=input("Username: ").strip(), password=getpass.getpass("Password (12+ characters): ")
)
settings = Settings()
store = Store(settings.data_dir / "modax.sqlite3")
store.execute(
    "INSERT INTO users VALUES(?,?,?)", (uid(), body.username.lower(), hash_password(body.password))
)
print("User created. Start the API and sign in.")
