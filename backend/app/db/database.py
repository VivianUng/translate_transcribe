# backend/app/db/database.py

import databases
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/dbname")

database = databases.Database(DATABASE_URL)