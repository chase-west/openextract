import { useState, useEffect } from 'react';
import { BackupInfo } from '../../hooks/useBackup';
import { sidecarCall, saveFolder } from '../../lib/ipc';

interface Note {
    note_id: number | string;
    title: string;
    body: string;
    created: string;
    modified: string;
}

interface Props {
    backup: BackupInfo;
}

export default function NotesView({ backup }: Props) {
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedNoteId, setSelectedNoteId] = useState<number | string | null>(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        async function fetchNotes() {
            try {
                setLoading(true);
                setError(null);
                const res = await sidecarCall<any>('list_notes', { udid: backup.udid });
                setNotes(res.notes || []);
            } catch (err: any) {
                setError(err.message || 'Failed to load notes');
            } finally {
                setLoading(false);
            }
        }
        fetchNotes();
    }, [backup.udid]);

    const handleExport = async (format: 'txt' | 'pdf') => {
        if (!selectedNoteId) return;
        try {
            setExporting(true);
            const folder = await saveFolder();
            if (!folder) return;

            const res = await sidecarCall('export_notes', {
                udid: backup.udid,
                note_ids: [selectedNoteId],
                format: format,
                output_dir: folder
            });

            if (res.status === 'ok') {
                alert(`Exported successfully to: ${folder}`);
            } else {
                alert(`Export failed: ${res.message}`);
            }
        } catch (e: any) {
            alert(`Export error: ${e.message}`);
        } finally {
            setExporting(false);
        }
    };

    const filteredNotes = notes.filter((n) =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.body.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedNote = notes.find(n => n.note_id === selectedNoteId);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center bg-gray-50">
                <div className="text-gray-500 flex flex-col items-center">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    Loading notes...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center bg-red-50 text-red-500">
                <div className="text-center">
                    <p className="text-lg font-semibold mb-2">Error</p>
                    <p>{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full bg-white text-gray-800">
            {/* List Pane */}
            <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50 flex-shrink-0">
                {/* Header & Search */}
                <div className="p-4 border-b border-gray-200 bg-white shadow-sm z-10">
                    <h2 className="text-lg font-semibold mb-3">Notes ({filteredNotes.length})</h2>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                            🔍
                        </span>
                        <input
                            type="text"
                            placeholder="Search notes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                        />
                    </div>
                </div>

                {/* Note List */}
                <div className="flex-1 overflow-y-auto">
                    {filteredNotes.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            No notes found.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filteredNotes.map((note) => (
                                <div
                                    key={note.note_id}
                                    onClick={() => setSelectedNoteId(note.note_id)}
                                    className={`p-4 cursor-pointer hover:bg-white transition-colors block border-l-4 ${selectedNoteId === note.note_id
                                            ? 'bg-white border-blue-500 shadow-sm'
                                            : 'border-transparent'
                                        }`}
                                >
                                    <h3 className="font-semibold text-gray-900 truncate tracking-tight mb-1">
                                        {note.title}
                                    </h3>
                                    <div className="flex justify-between items-baseline mb-1">
                                        <p className="text-xs text-blue-600 font-medium tracking-wide">
                                            {new Date(note.modified).toLocaleDateString(undefined, {
                                                month: 'short', day: 'numeric', year: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                    <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                                        {note.body}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Pane */}
            <div className="flex-1 flex flex-col bg-white">
                {selectedNote ? (
                    <>
                        {/* Toolbar */}
                        <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-gray-50/50">
                            <div className="text-sm text-gray-500">
                                Created: {new Date(selectedNote.created).toLocaleString()}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleExport('txt')}
                                    disabled={exporting}
                                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    Export TXT
                                </button>
                                <button
                                    onClick={() => handleExport('pdf')}
                                    disabled={exporting}
                                    className="px-3 py-1.5 bg-blue-600 border border-transparent text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    Export PDF
                                </button>
                            </div>
                        </div>

                        {/* Note Content */}
                        <div className="flex-1 overflow-y-auto px-12 py-10">
                            <div className="max-w-3xl mx-auto">
                                <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-4 pb-4 border-b border-gray-100">
                                    {selectedNote.title}
                                </h1>
                                <div className="prose prose-blue max-w-none text-gray-700 leading-relaxed font-serif text-[1.05rem] whitespace-pre-wrap">
                                    {selectedNote.body}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50/30">
                        <div className="text-center">
                            <div className="text-6xl mb-4 opacity-50">📝</div>
                            <p className="text-lg font-medium text-gray-500">Select a note to view</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
