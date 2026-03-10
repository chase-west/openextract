import { useState, useEffect } from 'react';
import { BackupInfo } from '../../hooks/useBackup';
import AmrPlayer from './AmrPlayer';

interface Voicemail {
    id: number;
    phone_number: string;
    contact_name: string;
    date_received: string;
    duration: number;
    is_read: boolean;
    transcript: string;
}

interface AudioInfo {
    data: string;
    mime_type: string;
    voicemail_id: number;
    file_path?: string;
}

interface Props {
    backup: BackupInfo;
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoicemailView({ backup }: Props) {
    const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [audioCache, setAudioCache] = useState<Record<number, AudioInfo>>({});
    const [loadingAudio, setLoadingAudio] = useState<number | null>(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        loadVoicemails();
    }, [backup.udid]);

    const [debugInfo, setDebugInfo] = useState<string>('');

    async function loadVoicemails() {
        setLoading(true);
        setError(null);
        try {
            const res = await window.openextract.call('list_voicemails', { udid: backup.udid });
            setDebugInfo(JSON.stringify(res, null, 2));
            if (!res.success) throw new Error(res.error);
            if (res.data?.error) throw new Error(res.data.error);

            setVoicemails(res.data?.voicemails || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load voicemails');
        } finally {
            setLoading(false);
        }
    }

    const [audioError, setAudioError] = useState<string | null>(null);

    async function expandVoicemail(id: number) {
        if (expandedId === id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(id);
        setAudioError(null);

        if (!audioCache[id]) {
            setLoadingAudio(id);
            try {
                const res = await window.openextract.call('get_voicemail_audio', {
                    udid: backup.udid,
                    voicemail_id: id
                });
                if (res.success && res.data && res.data.data) {
                    setAudioCache(prev => ({ ...prev, [id]: res.data }));
                } else {
                    setAudioError(JSON.stringify(res.data || res.error || res));
                }
            } catch (err: any) {
                console.error('Failed to load audio', err);
                setAudioError(err.message || 'Unknown error');
            } finally {
                setLoadingAudio(null);
            }
        }
    }

    async function handleBulkExport() {
        setExporting(true);
        try {
            const folder = await window.openextract.saveFolder();
            if (!folder) return; // User cancelled

            const res = await window.openextract.call('export_voicemails', {
                udid: backup.udid,
                output_dir: folder
            });

            if (!res.success || res.data.error) {
                throw new Error(res.error || res.data.error);
            }

            alert(`Successfully exported ${res.data.exported} voicemails to ${folder}`);
        } catch (err: any) {
            alert('Export failed: ' + err.message);
        } finally {
            setExporting(false);
        }
    }

    function handleExportSingle(vm: Voicemail, audio: AudioInfo) {
        if (!audio || !audio.data) return;
        const a = document.createElement('a');
        a.href = `data:${audio.mime_type};base64,${audio.data}`;
        const filename = `${vm.contact_name.replace(/\\s+/g, '_')}_${vm.date_received.split('T')[0]}.amr`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">Voicemails</h2>
                <button
                    onClick={handleBulkExport}
                    disabled={exporting || voicemails.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded shadow text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                    {exporting ? 'Exporting...' : 'Bulk Export CSV & Audio'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                {loading && <div className="text-center text-gray-500 py-10">Loading voicemails...</div>}
                {error && <div className="text-center text-red-500 py-10">{error}</div>}

                {!loading && voicemails.length === 0 && !error && (
                    <div className="text-center text-gray-500 py-10">
                        <p>No voicemails found in this backup.</p>
                        <pre className="text-xs text-left overflow-auto mt-4 p-2 bg-gray-200">{debugInfo}</pre>
                    </div>
                )}

                <div className="max-w-4xl mx-auto space-y-4">
                    {voicemails.map(vm => {
                        const isExpanded = expandedId === vm.id;
                        const audioData = audioCache[vm.id];

                        return (
                            <div
                                key={vm.id}
                                className={`bg-white rounded-lg shadow-sm border transition-all duration-200 overflow-hidden
                  ${vm.is_read ? 'border-gray-200' : 'border-blue-200 bg-blue-50'}
                  ${isExpanded ? 'shadow-md ring-1 ring-blue-500' : 'hover:shadow hover:border-blue-300'}`}
                            >
                                {/* Header row, clickable */}
                                <div
                                    className="p-4 flex flex-wrap items-center justify-between cursor-pointer select-none"
                                    onClick={() => expandVoicemail(vm.id)}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
                                        <span className="font-semibold text-gray-900 text-lg">
                                            {vm.contact_name}
                                        </span>
                                        {vm.contact_name !== vm.phone_number && vm.phone_number && (
                                            <span className="text-sm text-gray-500">{vm.phone_number}</span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-4 text-sm text-gray-600 mt-2 sm:mt-0">
                                        <span className="tabular-nums">
                                            {vm.date_received ? new Date(vm.date_received).toLocaleString() : 'Unknown date'}
                                        </span>
                                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">
                                            {formatDuration(vm.duration)}
                                        </span>
                                    </div>
                                </div>

                                {/* Expanded detail view */}
                                {isExpanded && (
                                    <div className="p-4 border-t border-gray-100 bg-gray-50/50 animate-in fade-in slide-in-from-top-2">

                                        {vm.transcript ? (
                                            <div className="mb-4">
                                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Transcript</h4>
                                                <p className="text-gray-700 italic border-l-2 border-blue-400 pl-3 py-1">
                                                    "{vm.transcript}"
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="mb-4 text-sm text-gray-400 italic">No transcript available</div>
                                        )}

                                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-4 pt-4 border-t border-gray-200">
                                            <div className="flex-1 min-w-[200px] flex items-center">
                                                {loadingAudio === vm.id ? (
                                                    <div className="text-xs text-blue-600 animate-pulse">Loading audio...</div>
                                                ) : audioData ? (
                                                    <AmrPlayer base64Data={audioData.data} mimeType={audioData.mime_type} />
                                                ) : (
                                                    <div className="text-xs text-red-500 max-w-sm overflow-auto">
                                                        {audioError ? `Error: ${audioError}` : 'Audio file not found'}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (audioData) handleExportSingle(vm, audioData);
                                                }}
                                                disabled={!audioData}
                                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded border border-gray-300 transition-colors disabled:opacity-50"
                                            >
                                                Export Audio
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
