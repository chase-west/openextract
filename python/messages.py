"""
Message extraction from sms.db.
Handles iMessage, SMS, MMS conversations with contact resolution.
"""

import sqlite3
import base64
import os
import plistlib
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

# Apple Cocoa epoch: Jan 1, 2001
APPLE_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)
NANOSECOND_THRESHOLD = 1_000_000_000_000  # Dates above this are in nanoseconds

def parse_attributed_body(data: bytes) -> str:
    """Extract plain text from an NSAttributedString (NSKeyedArchiver BLOB or TypedStream)."""
    if not data:
        return ""
    
    # 1. Try NSKeyedArchiver (bplist00)
    if data.startswith(b'bplist00'):
        try:
            plist = plistlib.loads(data)
            objects = plist.get("$objects", [])
            candidate = ""
            for obj in objects:
                # Find the longest string that isn't a known Apple structural class
                if isinstance(obj, str) and obj not in ("NSString", "NSMutableString", "NSAttributedString", "NSMutableAttributedString", "NSObject", "NSDictionary", "NSMutableDictionary"):
                    # Skip internal Apple attribute names and UUIDs
                    if "kIMFileTransferGUID" in obj or "kIMMessagePart" in obj or re.match(r'^\$?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$', obj, re.IGNORECASE):
                        continue
                    # Skip common attachment filenames
                    if re.search(r'[\d_A-Fa-f\-]+(\.fullsizerender)*\.(jpeg|jpg|heic|heif|png|gif|mov|mp4|m4a|caf|pdf|doc|docx)', obj, re.IGNORECASE):
                        continue
                    if len(obj) > len(candidate):
                        candidate = obj
            if candidate:
                return candidate
        except Exception:
            pass

    # 2. Try TypedStream (or corrupted bplist) fallback
    try:
        # Decode as utf-8, replacing invalid chars to preserve emojis and text
        text = data.decode('utf-8', errors='replace')
        
        # Clean Apple internal identifiers and UUIDs
        text = re.sub(r'__kIM\w+', '', text)
        text = re.sub(r'\$?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}', '', text, flags=re.IGNORECASE)
        # remove attachment filenames
        text = re.sub(r'[\d_A-Fa-f\-]+(\.fullsizerender)*\.(jpeg|jpg|heic|heif|png|gif|mov|mp4|m4a|caf|pdf|doc|docx)', '', text, flags=re.IGNORECASE)

        # Remove common Apple class names from the raw stream
        classes = ["NSMutableAttributedString", "NSAttributedString", "NSString", "NSMutableString", "NSDictionary", "NSMutableDictionary", "NSObject"]
        for c in classes:
            text = text.replace(c, "")
            
        # Split by control characters EXCEPT newline (\x0a) and carriage return (\x0d)
        # This breaks the binary payload into readable string blocks
        parts = re.split(r'[\x00-\x08\x0b\x0c\x0e-\x1f]+', text)
        
        candidate = ""
        for p in parts:
            p = p.strip()
            p = p.replace('\ufffc', '').replace('\ufffd', '').strip()
            
            # Check length to avoid picking up random 1-2 char binary artifacts
            if p and len(p) > len(candidate) and len(p) > 1:
                candidate = p
                
        return candidate
    except Exception:
        pass
        
    return ""


def apple_date_to_iso(apple_timestamp) -> Optional[str]:
    """Convert Apple Cocoa timestamp to ISO 8601 string."""
    if apple_timestamp is None or apple_timestamp == 0:
        return None
    try:
        ts = float(apple_timestamp)
        # Detect nanosecond timestamps (iOS 14+)
        if ts > NANOSECOND_THRESHOLD:
            ts = ts / 1_000_000_000
        dt = APPLE_EPOCH + timedelta(seconds=ts)
        return dt.isoformat()
    except (ValueError, OverflowError):
        return None


class MessageExtractor:
    """Extracts messages and conversations from iOS sms.db."""

    SMS_DB_PATH = "Library/SMS/sms.db"

    def _get_sms_db(self, backup) -> Optional[str]:
        """Get path to the sms.db file from the backup."""
        return backup.get_file(self.SMS_DB_PATH, domain="HomeDomain")

    def list_conversations(self, backup, contacts: dict) -> dict:
        """List all conversations with preview info."""
        db_path = self._get_sms_db(backup)
        if not db_path:
            return {"conversations": [], "error": "sms.db not found"}

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        conversations = []
        try:
            rows = conn.execute("""
                SELECT
                    c.ROWID AS chat_id,
                    c.chat_identifier,
                    c.display_name,
                    c.service_name,
                    COUNT(cmj.message_id) AS message_count,
                    MAX(m.date) AS last_message_date,
                    (SELECT coalesce(m2.text, '[Message contents hidden]') FROM message m2
                     INNER JOIN chat_message_join cmj2 ON cmj2.message_id = m2.ROWID
                     WHERE cmj2.chat_id = c.ROWID
                     ORDER BY m2.date DESC LIMIT 1) AS last_message_text
                FROM chat c
                JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
                JOIN message m ON m.ROWID = cmj.message_id
                GROUP BY c.ROWID
                ORDER BY last_message_date DESC
            """).fetchall()

            for row in rows:
                chat_identifier = row["chat_identifier"] or ""
                display_name = row["display_name"] or ""

                # Resolve contact name
                if not display_name and chat_identifier in contacts:
                    display_name = contacts[chat_identifier]

                conversations.append({
                    "chat_id": row["chat_id"],
                    "chat_identifier": chat_identifier,
                    "display_name": display_name or chat_identifier,
                    "service": row["service_name"] or "iMessage",
                    "message_count": row["message_count"],
                    "last_message_date": apple_date_to_iso(row["last_message_date"]),
                    "last_message_preview": (row["last_message_text"] or "")[:100],
                    "is_group": "chat" in chat_identifier.lower(),
                })
        finally:
            conn.close()

        return {"conversations": conversations}

    def get_messages(self, backup, chat_id: int, contacts: dict,
                     offset: int = 0, limit: int = 100) -> dict:
        """Get paginated messages from a conversation."""
        db_path = self._get_sms_db(backup)
        if not db_path:
            return {"messages": [], "error": "sms.db not found"}

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        messages = []
        try:
            try:
                # Try iOS 14+ schema with attributedBody
                rows = conn.execute("""
                    SELECT
                        m.ROWID AS message_id,
                        m.text,
                        m.attributedBody,
                        m.date,
                        m.date_read,
                        m.date_delivered,
                        m.is_from_me,
                        m.is_read,
                        m.cache_has_attachments,
                        m.associated_message_type,
                        m.group_title,
                        h.id AS handle_id_str,
                        h.uncanonicalized_id
                    FROM message m
                    LEFT JOIN handle h ON h.ROWID = m.handle_id
                    INNER JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
                    WHERE cmj.chat_id = ?
                    ORDER BY m.date DESC
                    LIMIT ? OFFSET ?
                """, (chat_id, limit, offset)).fetchall()
                has_attributed_body = True
            except sqlite3.OperationalError:
                # Fallback to iOS 13- schema
                rows = conn.execute("""
                    SELECT
                        m.ROWID AS message_id,
                        m.text,
                        m.date,
                        m.date_read,
                        m.date_delivered,
                        m.is_from_me,
                        m.is_read,
                        m.cache_has_attachments,
                        m.associated_message_type,
                        m.group_title,
                        h.id AS handle_id_str,
                        h.uncanonicalized_id
                    FROM message m
                    LEFT JOIN handle h ON h.ROWID = m.handle_id
                    INNER JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
                    WHERE cmj.chat_id = ?
                    ORDER BY m.date DESC
                    LIMIT ? OFFSET ?
                """, (chat_id, limit, offset)).fetchall()
                has_attributed_body = False

            # Reverse the descending array so it renders top to bottom in chronological order
            rows = list(rows)[::-1]

            for row in rows:
                handle = row["handle_id_str"] or ""
                sender_name = handle
                if handle in contacts:
                    sender_name = contacts[handle]
                elif row["uncanonicalized_id"] and row["uncanonicalized_id"] in contacts:
                    sender_name = contacts[row["uncanonicalized_id"]]

                # Resolve message text using attributedBody fallback if it exists in the row
                msg_text = row["text"]
                if not msg_text and has_attributed_body and row["attributedBody"]:
                    msg_text = parse_attributed_body(row["attributedBody"])

                if msg_text:
                    # Clean up Apple object replacement characters and attachment identifiers
                    msg_text = msg_text.replace('\ufffc', '').replace('\ufffd', '').strip()
                    msg_text = re.sub(r'__kIM\w+', '', msg_text)
                    msg_text = re.sub(r'\$?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}', '', msg_text, flags=re.IGNORECASE)
                    msg_text = re.sub(r'[\d_A-Fa-f\-]+(\.fullsizerender)*\.(jpeg|jpg|heic|heif|png|gif|mov|mp4|m4a|caf|pdf|doc|docx)', '', msg_text, flags=re.IGNORECASE)
                    
                    # Remove junk wrapper quotes, spaces, or newlines left from stripping
                    msg_text = re.sub(r'^[ \n"\uFFFD\uFFFC]+', '', msg_text)
                    msg_text = re.sub(r'[ \n"\uFFFD\uFFFC]+$', '', msg_text)
                    msg_text = msg_text.strip()
                    
                if not msg_text:
                    msg_text = "[Attachment]" if bool(row["cache_has_attachments"]) else "[no content]"

                msg = {
                    "message_id": row["message_id"],
                    "text": msg_text,
                    "date": apple_date_to_iso(row["date"]),
                    "is_from_me": bool(row["is_from_me"]),
                    "sender": "me" if row["is_from_me"] else sender_name,
                    "sender_handle": handle,
                    "has_attachments": bool(row["cache_has_attachments"]),
                    "is_reaction": row["associated_message_type"] is not None and row["associated_message_type"] != 0,
                }

                # Get attachments if any
                if msg["has_attachments"]:
                    msg["attachments"] = self._get_message_attachments(conn, row["message_id"])

                messages.append(msg)

            # Get total count
            total = conn.execute(
                "SELECT COUNT(*) FROM chat_message_join WHERE chat_id = ?",
                (chat_id,)
            ).fetchone()[0]

        finally:
            conn.close()

        return {
            "messages": messages,
            "total": total,
            "offset": offset,
            "limit": limit,
        }

    def _get_message_attachments(self, conn, message_id: int) -> list:
        """Get attachment metadata for a message."""
        attachments = []
        try:
            rows = conn.execute("""
                SELECT
                    a.ROWID AS attachment_id,
                    a.filename,
                    a.mime_type,
                    a.transfer_name,
                    a.total_bytes
                FROM attachment a
                JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
                WHERE maj.message_id = ?
            """, (message_id,)).fetchall()

            for row in rows:
                attachments.append({
                    "attachment_id": row["attachment_id"],
                    "filename": row["filename"],
                    "mime_type": row["mime_type"],
                    "transfer_name": row["transfer_name"],
                    "total_bytes": row["total_bytes"],
                })
        except Exception:
            pass

        return attachments

    def get_attachment(self, backup, attachment_id: int) -> dict:
        """Extract and return an attachment file as base64."""
        db_path = self._get_sms_db(backup)
        if not db_path:
            return {"error": "sms.db not found"}

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        try:
            row = conn.execute(
                "SELECT filename, mime_type, transfer_name FROM attachment WHERE ROWID = ?",
                (attachment_id,)
            ).fetchone()

            if not row or not row["filename"]:
                return {"error": "Attachment not found"}

            # The filename in sms.db starts with ~/
            # e.g. "~/Library/SMS/Attachments/ab/12/IMG_1234.jpeg"
            relative_path = row["filename"]
            if relative_path.startswith("~/"):
                relative_path = relative_path[2:]

            # Try to extract from backup
            # Attachments are in MediaDomain
            file_path = backup.get_file(relative_path, domain="MediaDomain")
            if not file_path:
                # Also try HomeDomain
                file_path = backup.get_file(relative_path, domain="HomeDomain")

            if not file_path or not os.path.exists(file_path):
                return {"error": "Attachment file not found in backup"}

            with open(file_path, "rb") as f:
                raw_data = f.read()

            mime_type = row["mime_type"]
            filename_lower = (row["filename"] or "").lower()
            if mime_type in ("image/heic", "image/heif") or filename_lower.endswith(".heic") or filename_lower.endswith(".heif"):
                try:
                    import io
                    import pillow_heif
                    from PIL import Image
                    pillow_heif.register_heif_opener()
                    img = Image.open(io.BytesIO(raw_data))
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG")
                    raw_data = buf.getvalue()
                    mime_type = "image/jpeg"
                except Exception as e:
                    pass

            data = base64.b64encode(raw_data).decode("ascii")

            return {
                "data": data,
                "mime_type": mime_type,
                "filename": row["transfer_name"] or os.path.basename(row["filename"]),
            }
        finally:
            conn.close()

    def search_messages(self, backup, query: str, contacts: dict,
                        chat_id: Optional[int] = None) -> dict:
        """Search messages by text content."""
        db_path = self._get_sms_db(backup)
        if not db_path:
            return {"results": []}

        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        results = []
        try:
            sql = """
                SELECT
                    m.ROWID AS message_id,
                    m.text,
                    m.date,
                    m.is_from_me,
                    h.id AS handle_id_str,
                    cmj.chat_id
                FROM message m
                LEFT JOIN handle h ON h.ROWID = m.handle_id
                INNER JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
                WHERE m.text LIKE ?
            """
            params = [f"%{query}%"]

            if chat_id:
                sql += " AND cmj.chat_id = ?"
                params.append(chat_id)

            sql += " ORDER BY m.date DESC LIMIT 50"

            rows = conn.execute(sql, params).fetchall()
            for row in rows:
                handle = row["handle_id_str"] or ""
                results.append({
                    "message_id": row["message_id"],
                    "text": row["text"],
                    "date": apple_date_to_iso(row["date"]),
                    "is_from_me": bool(row["is_from_me"]),
                    "sender": "me" if row["is_from_me"] else contacts.get(handle, handle),
                    "chat_id": row["chat_id"],
                })
        finally:
            conn.close()

        return {"results": results, "query": query}

    def export_conversation(self, backup, chat_id: int, contacts: dict,
                            fmt: str, output_dir: str) -> dict:
        """Export a conversation to the specified format."""
        # Get all messages (no pagination for export)
        all_messages = []
        offset = 0
        while True:
            batch = self.get_messages(backup, chat_id, contacts, offset, 500)
            all_messages.extend(batch["messages"])
            if offset + 500 >= batch["total"]:
                break
            offset += 500

        if fmt == "txt":
            return self._export_txt(all_messages, chat_id, output_dir)
        elif fmt == "csv":
            return self._export_csv(all_messages, chat_id, output_dir)
        elif fmt == "html":
            return self._export_html(all_messages, chat_id, output_dir)
        else:
            return {"error": f"Unsupported format: {fmt}"}

    def _export_txt(self, messages, chat_id, output_dir):
        filename = f"conversation_{chat_id}.txt"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            for msg in messages:
                date = msg["date"] or "Unknown date"
                sender = msg["sender"]
                text = msg["text"] or "[Attachment]"
                f.write(f"[{date}] {sender}: {text}\n")
        return {"file": filepath, "message_count": len(messages)}

    def _export_csv(self, messages, chat_id, output_dir):
        import csv
        filename = f"conversation_{chat_id}.csv"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Date", "Sender", "Text", "Is From Me", "Has Attachments"])
            for msg in messages:
                writer.writerow([
                    msg["date"], msg["sender"], msg["text"],
                    msg["is_from_me"], msg["has_attachments"]
                ])
        return {"file": filepath, "message_count": len(messages)}

    def _export_html(self, messages, chat_id, output_dir):
        filename = f"conversation_{chat_id}.html"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Conversation Export</title>
<style>
body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
.msg { margin: 8px 0; padding: 10px 14px; border-radius: 18px; max-width: 75%; clear: both; }
.sent { background: #007AFF; color: white; float: right; border-bottom-right-radius: 4px; }
.received { background: #E9E9EB; color: black; float: left; border-bottom-left-radius: 4px; }
.meta { font-size: 11px; color: #888; clear: both; text-align: center; margin: 12px 0 4px; }
.sender { font-size: 11px; color: #666; margin-bottom: 2px; }
</style></head><body>
""")
            for msg in messages:
                css_class = "sent" if msg["is_from_me"] else "received"
                text = msg["text"] or "[Attachment]"
                date = msg["date"] or ""
                f.write(f'<div class="meta">{date}</div>\n')
                if not msg["is_from_me"]:
                    f.write(f'<div class="sender">{msg["sender"]}</div>\n')
                f.write(f'<div class="msg {css_class}">{text}</div>\n')
            f.write("</body></html>")
        return {"file": filepath, "message_count": len(messages)}
