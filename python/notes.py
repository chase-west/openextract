"""
Notes extraction from NoteStore.sqlite.
"""

import sqlite3
from typing import Optional
from messages import apple_date_to_iso


class NoteExtractor:
    """Extracts notes from iOS backups."""

    # iOS 9+ uses NoteStore.sqlite
    NOTES_DB_PATH = "Library/Notes/notes.sqlite"
    # iOS 11+ uses a different location
    NOTESTORE_PATH = "NoteStore.sqlite"

    def list_notes(self, backup) -> dict:
        """List all notes with content."""
        # Try newer NoteStore format first (iOS 9+)
        db_path = backup.get_file(self.NOTES_DB_PATH, domain="HomeDomain")

        notes = []

        if db_path:
            notes = self._parse_legacy_notes(db_path)

        if not notes:
            # Try the group container path for newer iOS
            files = backup.list_files(path_like="%NoteStore.sqlite")
            for f in files:
                extracted = backup.get_file(f["path"], domain=f["domain"])
                if extracted:
                    notes = self._parse_notestore(extracted)
                    if notes:
                        break

        return {"notes": notes}

    def _parse_legacy_notes(self, db_path: str) -> list:
        """Parse the older notes.sqlite format."""
        notes = []
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            rows = conn.execute("""
                SELECT
                    n.ROWID,
                    n.creation_date,
                    n.modification_date,
                    n.title,
                    nb.data AS body_data
                FROM note n
                LEFT JOIN note_bodies nb ON nb.note_id = n.ROWID
                ORDER BY n.modification_date DESC
            """).fetchall()

            for row in rows:
                body = ""
                if row["body_data"]:
                    if isinstance(row["body_data"], bytes):
                        body = row["body_data"].decode("utf-8", errors="replace")
                    else:
                        body = str(row["body_data"])

                notes.append({
                    "note_id": row["ROWID"],
                    "title": row["title"] or "Untitled",
                    "body": body[:5000],  # Truncate very long notes
                    "created": apple_date_to_iso(row["creation_date"]),
                    "modified": apple_date_to_iso(row["modification_date"]),
                })

            conn.close()
        except Exception:
            pass

        return notes

    def _parse_notestore(self, db_path: str) -> list:
        """Parse the newer NoteStore.sqlite format (iOS 11+)."""
        notes = []
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            rows = conn.execute("""
                SELECT
                    n.Z_PK,
                    n.ZTITLE1 AS title,
                    n.ZCREATIONDATE AS created,
                    n.ZMODIFICATIONDATE1 AS modified,
                    n.ZSNIPPET AS snippet,
                    nd.ZDATA AS body_data
                FROM ZICCLOUDSYNCINGOBJECT n
                LEFT JOIN ZICNOTEDATA nd ON nd.ZNOTE = n.Z_PK
                WHERE n.ZTITLE1 IS NOT NULL
                ORDER BY n.ZMODIFICATIONDATE1 DESC
            """).fetchall()

            for row in rows:
                body = row["snippet"] or ""
                if row["body_data"]:
                    # Body data is often gzipped protobuf - use snippet as fallback
                    pass

                notes.append({
                    "note_id": row["Z_PK"],
                    "title": row["title"] or "Untitled",
                    "body": body[:5000],
                    "created": apple_date_to_iso(row["created"]),
                    "modified": apple_date_to_iso(row["modified"]),
                })

            conn.close()
        except Exception:
            pass

        return notes
