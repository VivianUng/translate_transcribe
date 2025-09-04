from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from typing import Optional
from app.db.models import User
from app.db.database import database
import os

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

SECRET_KEY = os.getenv("SECRET_KEY", "some-secret-key")
ALGORITHM = "HS256"

async def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    query = User.__table__.select().where(User.id == user_id)
    user = await database.fetch_one(query)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme)):
    if not token:  #  no error if token missing
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    query = User.__table__.select().where(User.id == user_id)
    user = await database.fetch_one(query)
    return user




# # backend/app/api/dependencies.py

# from fastapi import Depends, HTTPException, status
# from fastapi.security import OAuth2PasswordBearer
# from jose import jwt, JWTError
# from typing import Optional
# from app.db.models import User
# from app.db.database import database
# import os

# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# SECRET_KEY = os.getenv("SECRET_KEY", "some-secret-key")
# ALGORITHM = "HS256"

# async def get_current_user(token: str = Depends(oauth2_scheme)):
#     credentials_exception = HTTPException(
#         status_code=status.HTTP_401_UNAUTHORIZED,
#         detail="Could not validate credentials",
#         headers={"WWW-Authenticate": "Bearer"},
#     )
#     try:
#         payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
#         user_id: int = payload.get("sub")
#         if user_id is None:
#             raise credentials_exception
#     except JWTError:
#         raise credentials_exception

#     query = User.__table__.select().where(User.id == user_id)
#     user = await database.fetch_one(query)
#     if user is None:
#         raise credentials_exception
#     return user

# async def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme)):
#     if not token:
#         return None
#     try:
#         payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
#         user_id: int = payload.get("sub")
#         if user_id is None:
#             return None
#     except JWTError:
#         return None

#     query = User.__table__.select().where(User.id == user_id)
#     user = await database.fetch_one(query)
#     return user