from ..core.supabase_client import supabase
from app.models import SignupRequest, ProfileUpdateRequest, CreateMeetingPayload, GenericSavePayload, UpdateMeetingPayload, RecordUpdatePayload, StatusUpdatePayload, MeetingUpdatePayload, MeetingDetailsUpdatePayload, MeetingSavePayload
from app.auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request

router = APIRouter()

@router.get("/email_exists/")
async def email_exists(email: str, current_user=Depends(get_current_user)):
    """
    Check if an email exists in the profiles table.
    Returns {"exists": True/False}.
    """
    try:
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
    Signup a new user: check if email exists, then create user in Supabase Auth.
    """
    try:
        email_check = await email_exists(email=request.email)
        if email_check["exists"]:
            return {
                "status": "exists",
                "message": "This email is already registered. Please log in instead."
            }
        
        # Create new user in Supabase Auth
        auth_res = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {"data": {"full_name": request.full_name},
                        "email_redirect_to": f'{request.origin}/'}
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
    try:
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
    Update the current user's profile.
    """
    if not profile_data.name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")

    try:
        # Update profile table
        profile_res = supabase.table("profiles").update(
            {
                "id": current_user.id,
                "name": profile_data.name,
                "email": profile_data.email,
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
    Save translation/summary/conversation for authenticated user
    """
    try:
        table_map = {
            "translation": "translations",
            "summary": "summaries",
            "conversation": "conversations",
        }
        table_name = table_map[payload.type]

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

def get_table(record_type: str):
    table = record_type
    if not table:
        raise HTTPException(status_code=400, detail="Invalid record type")
    return table

# GET record
@router.get("/records/{record_type}/{record_id}")
async def get_record(record_type: str, record_id: str, current_user=Depends(get_current_user)):
    try:
        table = get_table(record_type)
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
    try:
        table = get_table(record_type)

        updates = {}
        if payload.input_text is not None:
            updates["input_text"] = payload.input_text
        if payload.output_text is not None:
            updates["output_text"] = payload.output_text
        if payload.input_lang is not None:
            updates["input_lang"] = payload.input_lang
        if payload.output_lang is not None:
            updates["output_lang"] = payload.output_lang
        
        if updates : 
            updates["updated_at"] = "now()"

        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")

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
    try:
        table = get_table(record_type)

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
    Save meeting record into meeting_details_individual for authenticated user.
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
    """
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
    Create a new meeting with participants for the authenticated user
    """
    try:
        # 1. Insert meeting
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
    """
    try : 
        result = supabase.rpc("get_host_names", {"host_ids": [host_id]}).execute()
        if not result or not result.data:
            raise HTTPException(status_code=404, detail="Host not found")
        return {"host": result.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    """
    Fetch a single meeting info and its participants by meeting ID.
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
async def update_meeting(
    meeting_id: str,
    payload: UpdateMeetingPayload,
    current_user=Depends(get_current_user)
):
    """
    Update an existing meeting. Only the host can update.
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
    Update the status of a meeting (e.g., 'ongoing', 'past').
    Only the host can update.
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
    Host-only update for meeting_details table.
    """
    try:
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

        # Build updates dictionary
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

        # Merge dicts: meeting_details takes precedence
        combined = {**meeting, **meeting_details}

        return combined

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error fetching meeting details: {e}")

@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user=Depends(get_current_user)):
    """
    Delete a meeting. Only the host can delete.
    """
    try:
        # Fetch meeting
        meeting_res = supabase.table("meetings").select("*").eq("id", meeting_id).execute()
        if not meeting_res.data:
            raise HTTPException(status_code=404, detail="Meeting not found")

        meeting = meeting_res.data[0]

        # Verify host
        if meeting["host_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only the host can delete the meeting")

        # Delete participants first
        supabase.table("meeting_participants").delete().eq("meeting_id", meeting_id).execute()

        # Delete the meeting
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
    Update translation-related fields for a user's meeting record.
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
    Delete user account (all related rows + profile + auth user)
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
