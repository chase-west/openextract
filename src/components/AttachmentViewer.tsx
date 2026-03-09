import { useEffect, useState } from 'react';
import { sidecarCall } from '../lib/ipc';
import { Attachment } from '../hooks/useMessages';

interface Props {
    udid: string;
    attachment: Attachment;
}

export default function AttachmentViewer({ udid, attachment }: Props) {
    const [data, setData] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Only fetch if it's an image
        if (!attachment.mime_type?.startsWith('image/')) {
            return;
        }

        const fetchAttachment = async () => {
            setLoading(true);
            try {
                const result = await sidecarCall<{ data: string; mime_type: string; filename: string }>(
                    'get_attachment',
                    { udid, attachment_id: attachment.attachment_id }
                );
                setData(`data:${result.mime_type};base64,${result.data}`);
            } catch (err: any) {
                setError(err.message || 'Failed to load image');
            } finally {
                setLoading(false);
            }
        };

        fetchAttachment();
    }, [udid, attachment]);

    if (!attachment.mime_type?.startsWith('image/')) {
        return (
            <div className="flex items-center space-x-2 text-sm italic opacity-75">
                <span>📎</span>
                <span>{attachment.transfer_name || attachment.filename || 'Attachment'}</span>
            </div>
        );
    }

    if (loading) {
        return <div className="text-sm italic opacity-50">Loading image...</div>;
    }

    if (error) {
        return <div className="text-sm text-red-400 italic">Error: {error}</div>;
    }

    if (data) {
        return (
            <div className="mt-1 flex flex-col items-start max-w-sm">
                <img
                    src={data}
                    alt={attachment.transfer_name || 'Attachment'}
                    className="rounded-lg object-contain max-h-64 cursor-pointer border border-gray-200"
                    onClick={(e) => {
                        // Prevent triggering the bubble's click event for showing timestamp
                        e.stopPropagation();
                        // Could implement a lightbox or open in proper viewer here
                    }}
                />
            </div>
        );
    }

    return <div className="text-sm italic opacity-50">Unknown attachment</div>;
}
