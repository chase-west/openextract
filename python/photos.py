"""
Photo extraction from CameraRollDomain.
Handles photo listing, thumbnail generation, and export.
"""

import os
import base64
import io
from typing import Optional

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


class PhotoExtractor:
    """Extracts photos and videos from iOS backups."""

    PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".gif", ".tiff", ".bmp"}
    VIDEO_EXTENSIONS = {".mov", ".mp4", ".m4v", ".avi"}

    def list_photos(self, backup, offset: int = 0, limit: int = 50) -> dict:
        """List photos in the backup with metadata."""
        files = backup.list_files(
            domain="CameraRollDomain",
            path_like="Media/DCIM/%"
        )

        # Filter to known media types
        media_files = []
        for f in files:
            ext = os.path.splitext(f["path"])[1].lower()
            if ext in self.PHOTO_EXTENSIONS:
                f["type"] = "photo"
                media_files.append(f)
            elif ext in self.VIDEO_EXTENSIONS:
                f["type"] = "video"
                media_files.append(f)

        # Sort by path (which typically includes date-based folder names)
        media_files.sort(key=lambda x: x["path"], reverse=True)

        total = len(media_files)
        page = media_files[offset:offset + limit]

        return {
            "photos": [
                {
                    "file_hash": p["hash"],
                    "path": p["path"],
                    "filename": os.path.basename(p["path"]),
                    "type": p["type"],
                    "extension": os.path.splitext(p["path"])[1].lower(),
                }
                for p in page
            ],
            "total": total,
            "offset": offset,
            "limit": limit,
        }

    def get_thumbnail(self, backup, file_hash: str, size: int = 200) -> dict:
        """Generate and return a thumbnail as base64."""
        if not HAS_PIL:
            return {"error": "Pillow not installed for thumbnail generation"}

        # Find the file in the backup
        file_path = self._resolve_file(backup, file_hash)
        if not file_path:
            return {"error": "Photo not found"}

        try:
            img = Image.open(file_path)
            img.thumbnail((size, size))

            # Convert to JPEG for consistent output
            buf = io.BytesIO()
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(buf, format="JPEG", quality=80)
            data = base64.b64encode(buf.getvalue()).decode("ascii")

            return {
                "data": data,
                "mime_type": "image/jpeg",
                "width": img.width,
                "height": img.height,
            }
        except Exception as e:
            return {"error": f"Failed to generate thumbnail: {e}"}

    def get_photo(self, backup, file_hash: str) -> dict:
        """Return full-resolution photo as base64."""
        file_path = self._resolve_file(backup, file_hash)
        if not file_path:
            return {"error": "Photo not found"}

        try:
            with open(file_path, "rb") as f:
                data = base64.b64encode(f.read()).decode("ascii")

            ext = os.path.splitext(file_path)[1].lower()
            mime_map = {
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png", ".gif": "image/gif",
                ".heic": "image/heic", ".heif": "image/heif",
                ".mov": "video/quicktime", ".mp4": "video/mp4",
            }

            return {
                "data": data,
                "mime_type": mime_map.get(ext, "application/octet-stream"),
                "filename": os.path.basename(file_path),
            }
        except Exception as e:
            return {"error": f"Failed to read photo: {e}"}

    def export_photos(self, backup, output_dir: str,
                      include_videos: bool = True) -> dict:
        """Export all photos to organized folders."""
        os.makedirs(output_dir, exist_ok=True)

        files = backup.list_files(
            domain="CameraRollDomain",
            path_like="Media/DCIM/%"
        )

        exported = 0
        errors = 0
        for f in files:
            ext = os.path.splitext(f["path"])[1].lower()
            is_photo = ext in self.PHOTO_EXTENSIONS
            is_video = ext in self.VIDEO_EXTENSIONS

            if not is_photo and not (is_video and include_videos):
                continue

            try:
                # Preserve DCIM folder structure
                relative = f["path"]
                if relative.startswith("Media/"):
                    relative = relative[6:]  # Strip "Media/" prefix

                dest = os.path.join(output_dir, relative)
                os.makedirs(os.path.dirname(dest), exist_ok=True)

                source = self._resolve_file(backup, f["hash"])
                if source and os.path.exists(source):
                    import shutil
                    shutil.copy2(source, dest)
                    exported += 1
                else:
                    errors += 1
            except Exception:
                errors += 1

        return {
            "exported": exported,
            "errors": errors,
            "output_dir": output_dir,
        }

    def _resolve_file(self, backup, file_hash: str) -> Optional[str]:
        """Resolve a file hash to an actual file path."""
        # For unencrypted backups, the file is at backup_dir/XX/XXXX...
        source = os.path.join(backup.backup_dir, file_hash[:2], file_hash)
        if os.path.exists(source):
            return source

        # For encrypted backups, we need to extract via the backup object
        # Look up the path in Manifest.db and extract
        manifest = backup.get_manifest_db()
        if manifest:
            import sqlite3
            conn = sqlite3.connect(manifest)
            row = conn.execute(
                "SELECT domain, relativePath FROM Files WHERE fileID = ?",
                (file_hash,)
            ).fetchone()
            conn.close()

            if row:
                extracted = backup.get_file(row[1], domain=row[0])
                if extracted:
                    return extracted

        return None
