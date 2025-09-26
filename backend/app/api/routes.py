# backend/app/api/routes.py
from .routes_db import router as db_router
from .routes_actions import router as actions_router
from fastapi import APIRouter

router = APIRouter()

router.include_router(db_router)
router.include_router(actions_router)