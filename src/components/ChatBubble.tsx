import { Message } from '../hooks/useMessages';
import { formatTime, formatDateTime } from '../lib/dates';
import { useState } from 'react';
import AttachmentViewer from './AttachmentViewer';

interface Props {
  message: Message;
  udid: string;
}

export default function ChatBubble({ message, udid }: Props) {
  const [showTimestamp, setShowTimestamp] = useState(false);

  // Skip reaction messages in the main flow
  if (message.is_reaction) return null;

  const isFromMe = message.is_from_me;
  const hasText = message.text && message.text.trim().length > 0;

  return (
    <div className={`flex flex-col ${isFromMe ? 'items-end' : 'items-start'} mb-1`}>
      {/* Sender name for received messages */}
      {!isFromMe && message.sender !== 'Unknown' && (
        <span className="text-xs text-gray-500 ml-3 mb-0.5">
          {message.sender}
        </span>
      )}

      <div
        onClick={() => setShowTimestamp(!showTimestamp)}
        className={`max-w-[75%] px-3 py-2 rounded-2xl cursor-pointer select-text ${isFromMe
            ? 'bg-imessage-blue text-white rounded-br-md'
            : 'bg-bubble-gray text-gray-900 rounded-bl-md'
          }`}
      >
        {hasText && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
        )}

        {message.has_attachments && message.attachments && (
          <div className={`flex flex-col space-y-2 ${hasText ? 'mt-2' : ''}`}>
            {message.attachments.map((attachment) => (
              <AttachmentViewer key={attachment.attachment_id} udid={udid} attachment={attachment} />
            ))}
          </div>
        )}

        {!hasText && !message.has_attachments && (
          <p className="text-sm italic opacity-50">[No content]</p>
        )}
      </div>

      {/* Timestamp (shown on click) */}
      {showTimestamp && (
        <span className="text-[10px] text-gray-400 mt-0.5 mx-3">
          {formatDateTime(message.date)}
        </span>
      )}
    </div>
  );
}
