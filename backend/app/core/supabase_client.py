# backend/app/core/supabase_client.py
"""
Supabase Client Initialization

This module is responsible for setting up and initializing the Supabase client
connection for backend operations such as database interaction, authentication,
and storage management.

Features:
- Loads Supabase project credentials from environment variables
- Creates a reusable Supabase client instance
- Provides centralized access for all database-related operations
"""

from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv()

# Reads Supabase project URL and Service Key from environment variables.
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# Create and configures a Supabase client instance for interacting with
# the Supabase backend (database, authentication, and storage).
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)