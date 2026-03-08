"""
Voicemail extraction from voicemail.db.
"""

import sqlite3
import os
import base64
from typing import Optional
from messages import apple_date_to_iso


class VoicemailExtractor:
    """Extracts voicemails from iOS backups."""

    VOICEMAIL_DB_PATH = "Library/Voicemail/voicemail.db"

    def list_voicemails(self, backup, contacts: dict) -> dict:
        """List all voicemails with metadata."""
        db_path = backup.get_file(self.VOICEMAIL_DB_PATH, domain="HomeDomain")
        if not db_path:
            return {"voicemails": [], "error": "voicemail.db not found"}

        voicemails = []
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            rows = conn.execute("""
                SELECT
                    ROWID,
                    sender,
                    date,
                    duration,
                    flags,
                    trashed_date,
                    token
                FROM voicemail
                WHERE trashed_date = 0 OR trashed_date IS NULL
                ORDER BY date DESC
            """).fetchall()

            for row in rows:
                sender = row["sender"] or ""
                caller_name = contacts.get(sender, sender)

                voicemails.append({
                    "voicemail_id": row["ROWID"],
                    "sender": sender,
                    "caller_name": caller_name,
                    "date": apple_date_to_iso(row["date"]),
                    "duration": row["duration"],
                    "is_read": bool(row["flags"] & 1) if row["flags"] else False,
                })

            conn.close()
        except Exception:
            pass

        return {"voicemails": voicemails}

    def get_audio(self, backup, voicemail_id: int) -> dict:
        """Extract voicemail audio file as base64."""
        # Voicemail audio files are stored as .amr files in Library/Voicemail/
        # The filename corresponds to the ROWID
        audio_path = f"Library/Voicemail/{voicemail_id}.amr"
        file_path = backup.get_file(audio_path, domain="HomeDomain")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"Voicemail audio not found: {voicemail_id}"}

        try:
            with open(file_path, "rb") as f:
                data = base64.b64encode(f.read()).decode("ascii")

            return {
                "data": data,
                "mime_type": "audio/amr",
                "voicemail_id": voicemail_id,
            }
        except Exception as e:
            return {"error": f"Failed to read voicemail: {e}"}
