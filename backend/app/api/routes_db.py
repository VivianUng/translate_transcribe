# backend/app/api/routes_db.py
"""
This module defines the FastAPI router for database-related operations 
in the AI-Enhanced Live Transcription & Translation System. 

It includes FastAPI endpoints that interact with the Supabase database for:
- User profile management (signup, update, delete)
- Generic record saving, updating, deleting (translations, transcriptions, summaries)
- Meeting management
- Access to Supabase Custom RPC functions

All routes in this module typically:
- Use Supabase as the main database interface
- Depend on user authentication via get_current_user
- Handle structured request models defined in app.models
"""
from ..core.supabase_client import supabase # Supabase client instance for DB interaction
from app.models import (
    SignupRequest, 
    ProfileUpdateRequest, 
    CreateMeetingPayload, 
    GenericSavePayload, 
    UpdateMeetingPayload, 
    RecordUpdatePayload, 
    StatusUpdatePayload, 
    MeetingUpdatePayload, 
    MeetingDetailsUpdatePayload, 
    MeetingSavePayload)
from app.auth import get_current_user  # Authentication dependency for protected routes
from fastapi import APIRouter, Depends, HTTPException

# Initialize router for all database-related API endpoints
router = APIRouter()

@router.get("/email_exists/")
async def email_exists(email: str, current_user=Depends(get_current_user)):
    """
    Check if a given email address already exists in the user profiles table.
    This endpoint uses a Supabase stored procedure (RPC) named 'email_exists'
    which checks for the existence of the email in the database.

    Parameters:
    - email (str): The email address to check.
    - current_user: The currently authenticated user (validated via dependency).

    Returns:
    - dict: {"exists": True} if the email exists, {"exists": False} otherwise.
    """
    try:
        # Call the Supabase procedure to check if the email exists
        res = supabase.rpc("email_exists", {"check_email": email}).execute()

        exists = False
        if res.data :
            exists = True

        return {"exists": exists}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/signup")
async def signup(request: SignupRequest):
    """
    Register a new user account in the system.
    Signup a new user: check if email exists, then create user in Supabase Auth and profiles table.

    Parameters:
    - request (SignupRequest): A Pydantic model containing `email`, `password`,
      `full_name`, and `origin` for redirect configuration.

    Returns:
    - dict: A JSON object containing:
        - "status": "success" | "exists"
        - "message": Explanation of the result
        - "user_id": Newly created user ID if successful

    Raises:
    - HTTPException(500): If Supabase authentication or database operation fails.
    """
    try:
        # 1. Check if email already exists
        email_check = await email_exists(email=request.email)
        if email_check["exists"]:
            return {
                "status": "exists",
                "message": "This email is already registered. Please log in instead."
            }
        
        # 2. Create new user in Supabase Auth
        auth_res = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {"data": {"full_name": request.full_name},  # Save user’s name in metadata
                        "email_redirect_to": f'{request.origin}/'} # Redirect link in email confirmation
            }
        )

        if not auth_res:
            raise HTTPException(status_code=500, detail="Failed to create user.")

        return {
            "status": "success",
            "message": "User created successfully",
            "user_id": auth_res.user.id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profile")
async def get_profile(current_user=Depends(get_current_user)):
    """
    Retrieve the profile information of the currently authenticated user.

    Returns:
    - dict: User profile data from the database.
    """
    try:
        # Query the user's profile from Supabase
        result = (
            supabase.table("profiles")
            .select("*")
            .eq("id", current_user.id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail=f"Profile not found")

        return result.data

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching profile: {e}")

@router.put("/profile")
async def update_profile(
    profile_data: ProfileUpdateRequest,
    current_user=Depends(get_current_user),
):
    """
    Update the authenticated user's profile information.

    Steps:
    1. Validate required fields (e.g., name cannot be empty).
    2. Update the 'profiles' table with new preferences and settings.
    3. Sync updated name with Supabase Auth user metadata (full_name).

    Parameters:
    - profile_data (ProfileUpdateRequest): Object containing fields to update,
      including preferences and default language.
    - current_user: Automatically retrieved authenticated user object.

    Returns:
    - dict: Confirmation message indicating successful update.
    """
    # Validate name before proceeding
    if not profile_data.name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")

    try:
        # Update profile fields in the 'profiles' table
        profile_res = supabase.table("profiles").update(
            {
                "name": profile_data.name,
                "auto_save_translations": profile_data.auto_save_translations,
                "auto_save_summaries": profile_data.auto_save_summaries,
                "auto_save_conversations": profile_data.auto_save_conversations,
                "auto_save_meetings": profile_data.auto_save_meetings,
                "default_language": profile_data.default_language,
                "updated_at": "now()",
            }
        ).eq("id", current_user.id).execute()

        if not profile_res.data:
            raise HTTPException(status_code=404, detail=f"Profile not found")

        # Update Supabase Auth user metadata (full_name)
        auth_res = supabase.auth.admin.update_user_by_id(
            current_user.id,
            {"user_metadata": {"full_name": profile_data.name}}
        )

        return {"message": "Profile updated successfully"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_item(payload: GenericSavePayload, current_user=Depends(get_current_user)):
    """
    Save a translation, summary, or conversation record for the authenticated user.

    Parameters:
    - payload (GenericSavePayload): Contains input and output text and language details.
    - current_user: The currently authenticated user.

    Returns:
    - dict: Confirmation message indicating the record has been saved.

    Raises:
    - HTTPException(400): If an error occurs during database insertion.
    """
    try:
        # Map record types to actual database tables
        table_map = {
            "translation": "translations",
            "summary": "summaries",
            "conversation": "conversations",
        }
        table_name = table_map[payload.type]

        # Insert record into respective table
        result = (
            supabase.table(table_name)
            .insert({
                "user_id": current_user.id,
                "input_text": payload.input_text,
                "output_text": payload.output_text,
                "input_lang": payload.input_lang,
                "output_lang": payload.output_lang,
                "created_at": "now()",
            })
            .execute()
        )

        return {"message": f"{payload.type.capitalize()} saved successfully!"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save {payload.type}: {e}")

# Allowed record types mapping to actual table names
ALLOWED_RECORD_TYPES = {
    "translations": "translations",
    "conversations": "conversations",
    "summaries": "summaries",
    "meeting_details_individual": "meeting_details_individual",
}

def get_table(record_type: str):
    """
    Validate and return the database table name for a given record type.

    Raises:
    - HTTPException(400): If the record type is not supported.
    """
    table = ALLOWED_RECORD_TYPES.get(record_type)
    if not table:
        raise HTTPException(status_code=400, detail="Invalid record type")
    return table

# GET record
@router.get("/records/{record_type}/{record_id}")
async def get_record(record_type: str, record_id: str, current_user=Depends(get_current_user)):
    """
    Retrieve a specific record (translation, summary, conversation, or meeting detail)
    for the authenticated user by record ID.

    Parameters:
    - record_type (str): Type of record
    - record_id (str): Unique record ID.
    - current_user: The authenticated user.

    Returns:
    - dict: The requested record data.

    Raises:
    - HTTPException(404): If the record does not exist.
    - HTTPException(400): If there is an error fetching the record.
    """
    try:
        table = get_table(record_type)
        # Retrieve record from Supabase
        result = (
            supabase.table(table)
            .select("*")
            .eq("id", record_id)
            .eq("user_id", current_user.id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail=f"{record_type[:-1].capitalize()} not found")

        return result.data

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching {record_type}: {e}")


# UPDATE record
@router.put("/records/{record_type}/{record_id}")
async def update_record(
    record_type: str,
    record_id: str,
    payload: RecordUpdatePayload,
    current_user=Depends(get_current_user)
):
    """
    Update an existing record (translation, summary, or conversation).

    Parameters:
    - record_type (str): Type of record
    - record_id (str): Unique record ID.
    - payload (RecordUpdatePayload): Fields to update.
    - current_user: Authenticated user.

    Returns:
    - dict: Updated record data.

    Raises:
    - HTTPException(400): If no updates are provided or any error occurs.
    - HTTPException(404): If the record does not exist.
    """
    try:
        table = get_table(record_type)
        # Collect updated fields dynamically
        updates = {}
        if payload.input_text is not None:
            updates["input_text"] = payload.input_text
        if payload.output_text is not None:
            updates["output_text"] = payload.output_text
        if payload.input_lang is not None:
            updates["input_lang"] = payload.input_lang
        if payload.output_lang is not None:
            updates["output_lang"] = payload.output_lang
        # Include timestamp if updates exist
        if updates : 
            updates["updated_at"] = "now()"

        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        # Perform database update
        result = (
            supabase.table(table)
            .update(updates)
            .eq("id", record_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail=f"{record_type[:-1].capitalize()} not found")

        return result.data[0]

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error updating {record_type}: {e}")


# DELETE record
@router.delete("/records/{record_type}/{record_id}")
async def delete_record(record_type: str, record_id: str, current_user=Depends(get_current_user)):
    """
    Delete a specific record belonging to the authenticated user.

    Steps:
    1. Validate record type and resolve its table name.
    2. Delete the record from the corresponding table if it exists and belongs to the user.
    3. Return a confirmation message upon successful deletion.

    Parameters:
    - record_type (str): Type of record
    - record_id (str): Unique record ID.
    - current_user: Authenticated user.

    Returns:
    - dict: Success message confirming deletion.

    Raises:
    - HTTPException(404): If the record is not found.
    - HTTPException(400): If any deletion error occurs.
    """
    try:
        table = get_table(record_type)

        # Delete the record from Supabase
        result = (
            supabase.table(table)
            .delete()
            .eq("id", record_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail=f"{record_type[:-1].capitalize()} not found")

        return {"message": f"{record_type[:-1].capitalize()} deleted successfully"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error deleting {record_type}: {e}")


@router.post("/save-meeting")
async def save_meeting(
    payload: MeetingSavePayload,
    current_user=Depends(get_current_user),
):
    """
    Save meeting record into the `meeting_details_individual` table for an authenticated user.

    Steps:
    - Validates the meeting and its details.
    - Combines general meeting data with user-specific translation and summary.
    - Saves a personalized meeting record for the user.

    Parameters:
    - payload (MeetingSavePayload): Contains all meeting details.
    - current_user: The currently authenticated user.

    Returns:
    - dict: Success message confirming deletion.

    Raises:
    - HTTPException(400): If any save error occurs.
    """
    try:
        # Fetch base meeting info (meeting_name, host_id) from meetings table
        meeting_res = (
            supabase.table("meetings")
            .select("id, name, host_id")
            .eq("id", payload.meeting_id)
            .single()
            .execute()
        )
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")

        meeting_data = meeting_res.data

        # Fetch details from meeting_details table
        details_res = (
            supabase.table("meeting_details")
            .select(
                "transcription, transcription_lang, en_summary, "
                "actual_start_time, actual_end_time"
            )
            .eq("meeting_id", payload.meeting_id)
            .single()
            .execute()
        )
        if not details_res.data:
            raise HTTPException(status_code=404, detail="Meeting details not found")

        details_data = details_res.data

        # Build insert data for meeting_details_individual
        insert_data = {
            "user_id": current_user.id,
            "meeting_id": meeting_data["id"],
            "meeting_name": meeting_data["name"],
            "host_id": meeting_data["host_id"],
            "original_transcription": details_data.get("transcription"),
            "original_summary": details_data.get("en_summary"),
            "actual_start_time": details_data.get("actual_start_time"),
            "actual_end_time": details_data.get("actual_end_time"),
            "transcription_lang": details_data.get("transcription_lang"),
            # User-specific fields
            "translation": payload.translation,
            "translated_lang": payload.translated_lang,
            "translated_summary": payload.translated_summary,
        }

        # Save to meeting_details_individual
        result = (
            supabase.table("meeting_details_individual")
            .insert(insert_data)
            .execute()
        )

        return {"message": "Meeting saved successfully!"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save meeting: {e}")

    
@router.get("/user-history")
async def get_user_history(current_user=Depends(get_current_user)):
    """
    Fetch translations, conversations, and summaries for the logged-in user.
    Used to populate the History Page for logged in users

    Parameters:
    - current_user: The currently authenticated user.

    Returns:
    - dict containing list of translations, conversations, summaries, and meetings
    """
    # Get user id to ensure only fetch records belonging to the user
    user_id = current_user.id

    try:
        # Fetch translations
        translations = supabase.table("translations").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        # Fetch conversations
        conversations = supabase.table("conversations").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        # Fetch summaries
        summaries = supabase.table("summaries").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        # Fetch meetings
        meetings = supabase.table("meeting_details_individual").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()

        # Return all history data in a structured format
        return {
            "translations": translations.data or [],
            "conversations": conversations.data or [],
            "summaries": summaries.data or [],
            "meetings": meetings.data or []
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch user history: {e}")


@router.post("/create-meeting")
async def create_meeting(payload: CreateMeetingPayload, current_user=Depends(get_current_user)):
    """
    Create a new meeting and associate participants for the authenticated user.

    Steps
    1. Insert a new meeting record into the `meetings` table.
    2. Retrieve participant profile IDs using a Supabase RPC (`get_profiles_for_emails`).
    3. Insert participant entries into the `meeting_participants` table.

    Parameters
    - `payload` (CreateMeetingPayload): Contains meeting name, date, time, and participant emails.
    - `current_user` (Depends): The currently authenticated user, retrieved via dependency injection.

    Returns
    - `dict`: A success message containing the created meeting record and participant details.
    """
    try:
        # 1. Insert meeting into 'meetings' table
        meeting_result = supabase.table("meetings").insert({
            "name": payload.meeting_name,
            "date": payload.date,
            "start_time": payload.start_time,
            "end_time": payload.end_time,
            "host_id": current_user.id
        }).execute()

        # Check for errors
        if not meeting_result.data:
            raise HTTPException(status_code=400, detail=meeting_result["error"]["message"])

        meeting = meeting_result.data[0]  # first inserted row

        # 2. Get participant profiles using RPC
        profiles_result = supabase.rpc("get_profiles_for_emails", {"emails": payload.participants}).execute()
        if not profiles_result.data:
            raise HTTPException(status_code=400, detail=profiles_result["error"]["message"])

        participant_rows = [{"meeting_id": meeting["id"], "participant_id": p["id"]} for p in profiles_result.data]

        # 3. Insert participants into meeting_participants
        participant_result = supabase.table("meeting_participants").insert(participant_rows).execute()
        if not participant_result.data:
            raise HTTPException(status_code=400, detail=participant_result["error"]["message"])

        return {"message": "Meeting created successfully!", "meeting": meeting, "participants": participant_rows}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hosts/names/{host_id}")
async def get_host_name(host_id: str, current_user=Depends(get_current_user)):
    """
    Fetch host names for a single host ID using the Supabase RPC.

    Parameters
    - `host_id` (str): The unique identifier of the host whose name needs to be retrieved.
    - `current_user` (Depends): The currently authenticated user (used for authorization).

    Returns
    - `dict`: A dictionary containing the host's name, formatted as `{"host": <host_data>}`.
    """
    try : 
        # 1. Execute Supabase RPC to fetch host name
        result = supabase.rpc("get_host_names", {"host_ids": [host_id]}).execute()
        if not result or not result.data:
            raise HTTPException(status_code=404, detail="Host not found")
        return {"host": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    """
    Retrieve full details for a specific meeting, including participants and host info.

    Steps:
    1. Fetch meeting details from the "meetings" table using meeting_id.
    2. Retrieve all participant IDs linked to that meeting.
    3. Use RPC function ("get_profiles_for_ids") to get participant email addresses.
    4. Fetch the host's email and name using their ID.
    5. Return the complete meeting info, including host and participants.

    Parameters:
        meeting_id (str): The unique identifier of the meeting to fetch.
        current_user (object): Automatically injected authenticated user object from Depends(get_current_user).

    Returns:
        dict: {
            "meeting": { ...full meeting info including host_email and host_name... },
            "participants": [list of participant emails]
        }

    Raises:
        HTTPException(404): If the meeting or related data is not found.
        HTTPException(500): For any unexpected errors during data retrieval.
    """
    try:
        # Fetch the meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        meeting = meeting_res.data[0]

        # Fetch participant emails
        participant_res = (
            supabase.table("meeting_participants")
            .select("participant_id")
            .eq("meeting_id", meeting_id)
            .execute()
        )
        participant_ids = [p["participant_id"] for p in participant_res.data]

        profiles_res = supabase.rpc("get_profiles_for_ids", {"ids": participant_ids}).execute()
        participants = [p["email"] for p in profiles_res.data]

        # Add host email
        host_res = supabase.table("profiles").select("email,name").eq("id", meeting["host_id"]).single().execute()
        host_email = host_res.data["email"] if host_res.data else "Unknown"
        meeting["host_email"] = host_email

        # Fetch host name via RPC
        host_data = await get_host_name(meeting["host_id"], current_user=current_user)
        meeting["host_name"] = host_data["host"]["name"] if host_data.get("host") else "Unknown"

        return {"meeting": meeting, "participants": participants}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, payload: UpdateMeetingPayload,current_user=Depends(get_current_user)):
    """
    Update an existing meeting and its participants.
    This endpoint allows the host of a meeting to update meeting details such as 
    the name, date, start and end times, and participant list. Only the host who 
    created the meeting can perform this action.

    Parameters
    - `meeting_id` (str): The unique identifier of the meeting to be updated.
    - `payload` (UpdateMeetingPayload): The new meeting details and updated list of participant emails.
    - `current_user` (User): The authenticated user obtained via dependency injection using `Depends(get_current_user)`.

    Returns
    - JSON object containing:
        - `"message"` (str): Confirmation message indicating successful update.
        - `"meeting"` (dict): The updated meeting record.
        - `"participants"` (list): List of new participant records linked to the meeting.
    """
    try:
        # 1. Fetch the existing meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        meeting = meeting_res.data[0]

        # 2. Check if the current user is the host
        if meeting["host_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only the host can update the meeting")

        # 3. Update meeting info
        update_res = supabase.table("meetings").update({
            "name": payload.meeting_name,
            "date": payload.date,
            "start_time": payload.start_time,
            "end_time": payload.end_time
        }).eq("id", meeting_id).execute()

        if not update_res.data:
            raise HTTPException(status_code=400, detail=update_res["error"]["message"])

        updated_meeting = update_res.data[0]

        # 4. Update participants: delete old, insert new
        supabase.table("meeting_participants").delete().eq("meeting_id", meeting_id).execute()

        # Fetch participant profiles using RPC
        profiles_res = supabase.rpc("get_profiles_for_emails", {"emails": payload.participants}).execute()
        if not profiles_res.data:
            raise HTTPException(status_code=400, detail=profiles_res["error"]["message"])

        participant_rows = [{"meeting_id": meeting_id, "participant_id": p["id"]} for p in profiles_res.data]

        participant_insert_res = supabase.table("meeting_participants").insert(participant_rows).execute()
        if not participant_insert_res.data:
            raise HTTPException(status_code=400, detail=participant_insert_res["error"]["message"])

        return {"message": "Meeting updated successfully!", "meeting": updated_meeting, "participants": participant_rows}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.put("/meetings/{meeting_id}/status")
async def update_meeting_status(
    meeting_id: str,
    payload: StatusUpdatePayload,
    current_user=Depends(get_current_user)
):
    """
    Update the status of a meeting (ongoing / past)
    This endpoint allows the host of a meeting to update its status 
    (eg., from 'upcoming' --> 'ongoing' or 'past'). Only the host 
    who created the meeting is authorized to perform this action.

    Parameters
    - `meeting_id` (str): The unique identifier of the meeting to be updated.
    - `payload` (StatusUpdatePayload): Contains the new status value for the meeting.
    - `current_user` (User): The authenticated user obtained through dependency injection via `Depends(get_current_user)`.

    Returns
    - JSON object containing:
        - `"message"` (str): Confirmation message indicating successful status update.
        - `"meeting"` (dict): The updated meeting record with the new status.
    """
    try:
        status = payload.status
        # 1. Fetch the existing meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        meeting = meeting_res.data[0]

        # 2. Check if the current user is the host
        if meeting["host_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only the host can update the meeting")

        # 3. Update only the status column
        update_res = (
            supabase.table("meetings")
            .update({"status": status})
            .eq("id", meeting_id)
            .execute()
        )

        if not update_res.data:
            raise HTTPException(status_code=400, detail="Failed to update meeting status")

        return {
            "message": f"Meeting status updated to '{status}' successfully!",
            "meeting": update_res.data[0],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

# UPDATE meeting_details table
@router.put("/update-meeting-details/{meeting_id}")
async def update_meeting_details(
    meeting_id: str,
    payload: MeetingDetailsUpdatePayload,
    current_user=Depends(get_current_user)
):
    """
    Update specific meeting details (host-only access).
    This endpoint allows the host of a meeting to update transcription, 
    language, and summary-related fields in the `meeting_details` table.
    Only the meeting host has permission to perform this update.

    Steps
    1. Retrieve the host ID of the specified meeting.
    2. Verify that the authenticated user is the meeting host.
    3. Dynamically build an update dictionary based on provided payload fields.
    4. Update the `meeting_details` table with new values.
    5. Return the updated record.

    Parameters
    - `meeting_id` (str): The unique identifier of the meeting whose details are being updated.
    - `payload` (MeetingDetailsUpdatePayload): Object containing the fields to update (eg., transcription, summary, translation).
    - `current_user` (User): The authenticated user, injected through dependency `Depends(get_current_user)`.

    Returns
    - `dict`: The updated meeting details record.
    """
    try:
        # 1. Verify host ownership
        meeting_res = (
            supabase.table("meetings")
            .select("host_id")
            .eq("id", meeting_id)
            .maybe_single()
            .execute()
        )
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        if meeting_res.data["host_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only host can update this meeting")

        # 2. Build updates dictionary
        updates = {}
        if payload.transcription is not None:
            updates["transcription"] = payload.transcription
        if payload.transcription_lang is not None:
            updates["transcription_lang"] = payload.transcription_lang
        if payload.en_summary is not None:
            updates["en_summary"] = payload.en_summary
        if payload.translated_summary is not None:
            updates["translated_summary"] = payload.translated_summary

        if updates:
            updates["updated_at"] = "now()"

        # 3. Ensure at least one field is provided
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        # Execute update
        result = (
            supabase.table("meeting_details")
            .update(updates)
            .eq("meeting_id", meeting_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Meeting details not found")

        return result.data[0]

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error updating meeting details: {e}")

# GET from meeting and meeting_details by meeting_id
@router.get("/meetings/{meeting_id}/details")
async def get_meeting_details(meeting_id: str, current_user=Depends(get_current_user)):
    """
    Retrieve detailed information for a specific meeting, including host info, 
    meeting metadata, and meeting details.
    This endpoint retrieves meeting data from both the `meetings` and 
    `meeting_details` tables, combining them into a single structured response.  
    It also checks whether the authenticated user has saved this meeting in 
    their individual meeting history (for past meetings only).

    Parameters
    - `meeting_id` (str): The unique identifier of the meeting.
    - `current_user` (User): The authenticated user, injected via `Depends(get_current_user)`.

    Returns
    - `dict`: A combined dictionary containing:
        - General meeting info (`name`, `date`, `host_name`, etc.)
        - Meeting details (`transcription`, `summary`, etc.)
        - A boolean field `is_saved` indicating if the user saved this meeting.

    **Raises:**
    - `HTTPException(404)`: If the meeting or meeting details are not found.
    - `HTTPException(400)`: For database or request processing errors.
    """
    try:
        # Fetch meeting info from meetings table
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")
        meeting = meeting_res.data[0]

        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting Info not found")
        
        # Fetch host name via RPC
        host_data = await get_host_name(meeting["host_id"], current_user=current_user)
        meeting["host_name"] = host_data["host"]["name"] if host_data.get("host") else "Unknown"

        # Fetch the row from meeting_details table using meeting_id
        result = (
            supabase.table("meeting_details")
            .select("*")
            .eq("meeting_id", meeting_id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Meeting details not found")

        meeting_details = result.data

        is_saved = False

        # Check if user saved this meeting (only if past)
        if meeting_details.get("status") == "past":
            saved_check = (
                supabase.table("meeting_details_individual")
                .select("id", count="exact", head=True)
                .eq("meeting_id", meeting_id)
                .eq("user_id", current_user.id)
                .execute()
            )
            is_saved = bool(saved_check.count and saved_check.count > 0)

        # Combine everything
        combined = {
            **meeting,
            **meeting_details,
            "is_saved": is_saved,
        }

        return combined

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching meeting details: {e}")

@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    """
    Delete an upcoming meeting. (not yet in meeting_details table)
    This endpoint allows the meeting host to permanently delete a meeting 
    and its associated participant records. Only the meeting host is authorized 
    to perform this action.

    Steps
    1. Retrieve the meeting record from the `meetings` table using `meeting_id`.
    2. Verify that the authenticated user is the host of the meeting.
    3. Delete all related participants from the `meeting_participants` table.
    4. Delete the meeting record itself from the `meetings` table.
    5. Return a success message upon successful deletion.

    Parameters
    - `meeting_id` (str): The unique identifier of the meeting to be deleted.
    - `current_user` (User): The currently authenticated user, injected via `Depends(get_current_user)`.

    Returns
    - `dict`: A success message confirming the meeting deletion.  
    """
    try:
        # 1. Fetch meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")

        meeting = meeting_res.data[0]

        # 2. Verify host
        if meeting["host_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only the host can delete the meeting")

        # 3. Delete participants first
        supabase.table("meeting_participants").delete().eq("meeting_id", meeting_id).execute()

        # 4. Delete the meeting
        delete_res = supabase.table("meetings").delete().eq("id", meeting_id).execute()
        if not delete_res.data:
            raise HTTPException(status_code=400, detail="Failed to delete meeting")

        return {"message": "Meeting deleted successfully!"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# UPDATE meeting_details_individual
@router.put("/update-meeting/{record_id}")
async def update_meeting(
    record_id: str,
    payload: MeetingUpdatePayload,
    current_user=Depends(get_current_user)
):
    """
    Update translation-related fields for a user's meeting record. (meeting_details_individual)

    Parameters
    - record_id (str): Unique identifier of the meeting record to update.
    - payload (MeetingUpdatePayload): Pydantic model containing update fields.
    - current_user: Authenticated user obtained via dependency injection.

    Returns:
    - Updated meeting record (dict) containing the latest translation-related data.
    """
    try:
        # Build updates dictionary
        updates = {}
        if payload.translation is not None:
            updates["translation"] = payload.translation
        if payload.translated_lang is not None:
            updates["translated_lang"] = payload.translated_lang
        if payload.translated_summary is not None:
            updates["translated_summary"] = payload.translated_summary
        
        if updates:
            updates["updated_at"] = "now()"

        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

        # Execute update
        result = (
            supabase.table("meeting_details_individual")
            .update(updates)
            .eq("id", record_id)
            .eq("user_id", current_user.id)
            .execute()
        )

        # Handle empty result
        if not result.data:
            raise HTTPException(status_code=404, detail="Meeting record not found for user")

        return result.data[0]

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error updating meeting: {e}")


@router.get("/meetings")
async def get_user_meetings(current_user=Depends(get_current_user)):
    """
    Retrieve all meetings associated with the current user
    including those the user hosts and participates in.

    Steps:
    1. Fetch meetings where the current user is the host.
    2. Fetch meetings where the current user is a participant.
    3. Combine both sets of meetings and remove duplicates.
    4. Retrieve host names for all meetings using an RPC function.
    5. For meetings with status 'past' or 'ongoing', fetch corresponding details 
       (actual start and end times) from the `meeting_details` table.
    6. Sort all meetings chronologically by date and start time before returning.

    Parameters:
    - current_user: The authenticated user object obtained via dependency injection.

    Returns:
    - List[dict]: A list of all meetings (hosted and participated) with host names 
      and additional details if applicable.
    """
    try:
        # 1. Meetings where user is host
        host_result = supabase.table("meetings").select("*").eq("host_id", current_user.id).execute()
        if not host_result:
            print("Error fetching host meetings")
        host_meetings = host_result.data or []

        # 2. Meetings where user is participant
        participant_links = supabase.table("meeting_participants")\
            .select("meeting_id")\
            .eq("participant_id", current_user.id)\
            .execute()
        if not participant_links:
            print("Error fetching participant links")
        participant_links_data = participant_links.data or []

        participant_meeting_ids = [link["meeting_id"] for link in participant_links_data]
        participant_meetings = []
        if participant_meeting_ids:
            participant_result = supabase.table("meetings")\
                .select("*")\
                .in_("id", participant_meeting_ids)\
                .execute()
            if not participant_result:
                print("Error fetching participant meetings")
            participant_meetings = participant_result.data or []

        # 3. Combine meetings, remove duplicates
        all_meetings_dict = {m["id"]: m for m in host_meetings + participant_meetings}
        all_meetings = list(all_meetings_dict.values())

        # 4. Fetch host names via RPC
        host_map = {}
        if all_meetings:
            host_ids = list({m["host_id"] for m in all_meetings})
            for hid in host_ids:
                host_data = await get_host_name(hid, current_user=current_user)
                host = host_data["host"]
                host_map[host["host_id"]] = host["name"]

        # 5. Attach host_name and fetch meeting_details for past/ongoing
        for m in all_meetings:
            m["host_name"] = host_map.get(m["host_id"], "Unknown")

            status = (m.get("status") or "").lower()
            if status in ["past", "ongoing"]:
                # Fetch actual times from meeting_details
                detail_result = supabase.table("meeting_details")\
                    .select("*")\
                    .eq("meeting_id", m["id"])\
                    .single()\
                    .execute()
                details = detail_result.data
                if details:
                    if details.get("actual_start_time"):
                        m["actual_start_time"] = details["actual_start_time"]
                    if status == "past" and details.get("actual_end_time"):
                        m["actual_end_time"] = details["actual_end_time"]

        # 6. Sort meetings
        all_meetings.sort(key=lambda m: (m["date"], m["start_time"]))

        return all_meetings

    except Exception as e:
        print("Error fetching meetings:", e)
        return []





@router.post("/delete-account")
async def delete_account(current_user=Depends(get_current_user)):
    """
    Permanently delete the current user's account and all associated data.

    Steps:
    1. Delete all dependent records from related tables (translations, summaries, conversations,
       meeting details, participants, and hosted meetings) to ensure data consistency.
    2. Remove the user's profile entry from the 'profiles' table.
    3. Delete the user's authentication record from Supabase Auth.

    Parameters:
    - current_user: The authenticated user object obtained via dependency injection.

    Returns:
    - dict: A confirmation message indicating successful account deletion.
    """
    try:
        user_id = current_user.id

        # 1. Delete dependent rows (as fallback in case on delete cascade fails)
        supabase.table("translations").delete().eq("user_id", user_id).execute()
        supabase.table("summaries").delete().eq("user_id", user_id).execute()
        supabase.table("conversations").delete().eq("user_id", user_id).execute()
        supabase.table("meeting_details_individual").delete().eq("user_id", user_id).execute()
        supabase.table("meeting_participants").delete().eq("participant_id", user_id).execute()
        supabase.table("meetings").delete().eq("host_id", user_id).execute()

        # 2. Delete profile
        supabase.table("profiles").delete().eq("id", user_id).execute()

        # 3. Delete auth user
        supabase.auth.admin.delete_user(user_id)

        return {"message": "Account deleted successfully"}

    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to delete account: {str(e)}"
        )
