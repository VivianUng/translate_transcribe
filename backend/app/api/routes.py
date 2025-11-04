# backend/app/api/routes.py
"""
Main API routing configuration for the backend.

Description:
This file acts as the central router aggregator, combining multiple sub-routers 
to organize API endpoints logically. It ensures a clean and modular structure 
for route management across the backend.

Steps:
1. Import sub-routers from different modules:
   - routes_db: Handles all database-related operations (CRUD, fetch, update).
   - routes_actions: Handles processing related functions (translations, text extraction, etc).
2. Create a main APIRouter instance.
3. Include the sub-routers under the main router for unified route registration.

Returns:
- Combined FastAPI router instance that includes all registered routes.
"""

from .routes_db import router as db_router
from .routes_actions import router as actions_router
from fastapi import APIRouter

# Initialize the main API router
router = APIRouter()

# Include database-related routes
router.include_router(db_router)

# Include action-related routes
router.include_router(actions_router)