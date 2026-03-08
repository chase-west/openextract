"""
Call history extraction from CallHistory.storedata.
"""

import sqlite3
from typing import Optional
from messages import apple_date_to_iso


class CallExtractor:
    """Extracts call history from iOS backups."""

    CALL_HISTORY_PATH = "Library/CallHistoryDB/CallHistory.storedata"

    def list_calls(self, backup, contacts: dict,
                   offset: int = 0, limit: int = 100) -> dict:
        """List call history records."""
        db_path = backup.get_file(self.CALL_HISTORY_PATH, domain="HomeDomain")
        if not db_path:
            return {"calls": [], "error": "CallHistory.storedata not found"}

        calls = []
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row

            # The schema varies by iOS version - try the newer format first
            try:
                rows = conn.execute("""
                    SELECT
                        Z_PK,
                        ZADDRESS AS address,
                        ZDATE AS date,
                        ZDURATION AS duration,
                        ZCALLTYPE AS call_type,
                        ZORIGINATED AS originated,
                        ZANSWERED AS answered
                    FROM ZCALLRECORD
                    ORDER BY ZDATE DESC
                    LIMIT ? OFFSET ?
                """, (limit, offset)).fetchall()

                total = conn.execute("SELECT COUNT(*) FROM ZCALLRECORD").fetchone()[0]
            except Exception:
                # Try older iOS format
                rows = conn.execute("""
                    SELECT
                        ROWID AS Z_PK,
                        address,
                        date,
                        duration,
                        flags AS call_type,
                        read AS answered
                    FROM call
                    ORDER BY date DESC
                    LIMIT ? OFFSET ?
                """, (limit, offset)).fetchall()
                total = conn.execute("SELECT COUNT(*) FROM call").fetchone()[0]

            for row in rows:
                address = row["address"] or ""
                contact_name = contacts.get(address, address)

                originated = row.get("originated")
                answered = row["answered"] if "answered" in row.keys() else None

                # Determine call direction and status
                if originated is not None:
                    direction = "outgoing" if originated else "incoming"
                else:
                    direction = "unknown"

                if answered is not None:
                    status = "answered" if answered else "missed"
                else:
                    status = "unknown"

                calls.append({
                    "call_id": row["Z_PK"],
                    "address": address,
                    "contact_name": contact_name,
                    "date": apple_date_to_iso(row["date"]),
                    "duration": row["duration"],
                    "direction": direction,
                    "status": status,
                })

            conn.close()
        except Exception:
            pass

        return {
            "calls": calls,
            "total": total if 'total' in dir() else len(calls),
            "offset": offset,
            "limit": limit,
        }
