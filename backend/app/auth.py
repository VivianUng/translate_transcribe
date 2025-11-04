# backend/app/core/auth.py
"""
Authentication Utility Functions

This module provides helper functions for managing and validating
user authentication in API requests.

Functions:
- get_current_user(): Extracts and verifies the authenticated user
  from a JWT token in the Authorization header.
- get_token_from_header(): Extracts the raw JWT token.

Both functions are essential for routes requiring user authentication
and integrate directly with Supabase's authentication service.
"""

from fastapi import Request, HTTPException, status
from app.core.supabase_client import supabase

def get_current_user(request: Request):
    """
    Extract and verify the currently authenticated user from the Authorization header.

    Steps:
    1. Retrieve the Authorization header from the request.
    2. Validate that it starts with the "Bearer " prefix.
    3. Extract the JWT token from the header.
    4. Use Supabase Auth to verify the token and retrieve the user.
    5. Return the authenticated user object if valid; otherwise, raise an HTTP error.

    Parameters:
        request (Request): The FastAPI request object containing headers.

    Returns:
        user (object): The authenticated Supabase user object.

    Raises:
        HTTPException (401): If the token is missing, invalid, or user authentication fails.
    """
    # 1. Get the Authorization header from the request
    auth_header = request.headers.get("Authorization")
    
    # 2. Check if the header is missing or improperly formatted
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    # 3. Extract the token from the header (after 'Bearer ')
    token = auth_header.split(" ")[1]

    try:
        # 4. Verify the token and retrieve the associated user from Supabase
        user = supabase.auth.get_user(token).user
        
        # 5. If user is not found or invalid, raise an authentication error
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )

def get_token_from_header(request: Request):
    """Extract raw JWT from Authorization header"""
    # Retrieve the Authorization header
    auth_header = request.headers.get("Authorization")
    # Validate the presence and format of the Authorization header
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )
    # Extract and return the JWT token
    return auth_header.split(" ")[1]