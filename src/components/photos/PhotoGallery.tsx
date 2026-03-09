import { useState, useEffect, useRef, useCallback } from 'react';
import { BackupInfo } from '../../hooks/useBackup';
import { usePhotos } from '../../hooks/usePhotos';
import { PhotoAlbum } from '../../types';
import PhotoThumbnail from './PhotoThumbnail';
import PhotoLightbox from './PhotoLightbox';
import ExportDialog from './ExportDialog';

interface Props {
  backup: BackupInfo;
}

const KIND_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'photo', label: 'Photos' },
  { value: 'video', label: 'Videos' },
  { value: 'live_photo', label: 'Live Photos' },
  { value: 'screenshot', label: 'Screenshots' },
];

export default function PhotoGallery({ backup }: Props) {
  const {
    albums, photos, selectedAlbum, loading, loadingMore, hasMore, total, error,
    selectAlbum, loadMore, getThumbnail, getFullPhoto, exportPhotos,
  } = usePhotos(backup.udid);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Infinite scroll trigger
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 400;
      if (nearBottom && hasMore && !loadingMore) loadMore();
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [hasMore, loadingMore, loadMore]);

  const filteredPhotos = photos.filter(p => {
    if (search && !p.filename.toLowerCase().includes(search.toLowerCase())) return false;
    if (kindFilter !== 'all' && p.kind !== kindFilter) return false;
    return true;
  });

  const handleAlbumClick = useCallback((album: PhotoAlbum) => {
    const isActive = selectedAlbum?.id === album.id;
    selectAlbum(isActive ? null : album);
  }, [selectedAlbum, selectAlbum]);

  return (
    <div className="flex h-full bg-gray-900 text-gray-100 overflow-hidden">
      {/* Album sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
        <p className="text-[11px] uppercase tracking-wider text-gray-600 px-3 pt-3 pb-1 flex-shrink-0">
          Albums
        </p>
        <div className="flex-1 overflow-y-auto py-1">
          {albums.map(album => {
            const active = selectedAlbum?.id === album.id;
            return (
              <button
                key={album.id}
                onClick={() => handleAlbumClick(album)}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span className="truncate flex-1">{album.title}</span>
                <span className={`text-[11px] flex-shrink-0 ${active ? 'text-blue-200' : 'text-gray-600'}`}>
                  {album.asset_count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 flex-shrink-0 bg-gray-900">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search filename…"
            className="bg-gray-800 text-gray-200 text-sm px-3 py-1.5 rounded border border-gray-700 w-44 focus:outline-none focus:border-blue-500 placeholder-gray-600"
          />
          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value)}
            className="bg-gray-800 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-700 focus:outline-none"
          >
            {KIND_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-xs text-gray-600 ml-1">
            {filteredPhotos.length.toLocaleString()}
            {total > photos.length && ` of ${total.toLocaleString()}`}
          </span>
          <button
            onClick={() => setShowExport(true)}
            className="ml-auto bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded transition-colors"
          >
            Export…
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 mt-2 px-3 py-2 bg-red-900/40 border border-red-800 rounded text-sm text-red-300 flex-shrink-0">
            {error}
          </div>
        )}

        {/* Photo grid */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
          {loading && photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-600">
              <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin mb-3" />
              <p className="text-sm">Loading photos…</p>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-600">
              <p className="text-sm">{photos.length === 0 ? 'No photos in backup' : 'No results'}</p>
            </div>
          ) : (
            <>
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
              >
                {filteredPhotos.map((photo, i) => (
                  <PhotoThumbnail
                    key={photo.uuid || photo.file_hash}
                    photo={photo}
                    size={200}
                    onClick={() => setLightboxIndex(i)}
                    getThumbnail={getThumbnail}
                  />
                ))}
              </div>

              {/* Load more spinner */}
              {loadingMore && (
                <div className="flex justify-center py-5">
                  <div className="w-6 h-6 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}

              {/* End-of-list indicator */}
              {!hasMore && filteredPhotos.length > 0 && (
                <p className="text-center text-gray-700 text-xs py-4">
                  All {filteredPhotos.length.toLocaleString()} items loaded
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={filteredPhotos}
          initialIndex={lightboxIndex}
          getFullPhoto={getFullPhoto}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* Export dialog */}
      {showExport && (
        <ExportDialog
          onClose={() => setShowExport(false)}
          onExport={exportPhotos}
        />
      )}
    </div>
  );
}
