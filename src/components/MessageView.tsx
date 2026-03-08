import { useEffect, useState, useRef } from 'react';
import { useMessages, Conversation, Message } from '../hooks/useMessages';
import { formatRelative, formatDateTime } from '../lib/dates';
import ChatBubble from './ChatBubble';

interface Props {
  udid: string;
}

export default function MessageView({ udid }: Props) {
  const {
    conversations,
    messages,
    activeChat,
    totalMessages,
    loading,
    loadConversations,
    loadMessages,
  } = useMessages(udid);

  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    // Scroll to bottom when messages load
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredConversations = searchQuery
    ? conversations.filter(
        (c) =>
          c.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.chat_identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.last_message_preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const activeConversation = conversations.find((c) => c.chat_id === activeChat);

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white flex-shrink-0">
        <div className="p-3 border-b border-gray-100">
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && conversations.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">Loading conversations...</div>
          )}
          {filteredConversations.map((conv) => (
            <button
              key={conv.chat_id}
              onClick={() => loadMessages(conv.chat_id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                activeChat === conv.chat_id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="font-medium text-sm text-gray-900 truncate flex-1">
                  {conv.display_name}
                  {conv.is_group && (
                    <span className="ml-1 text-xs text-gray-400">👥</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                  {formatRelative(conv.last_message_date)}
                </span>
              </div>
              <div className="text-xs text-gray-500 truncate mt-0.5">
                {conv.last_message_preview || 'No messages'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {conv.message_count} messages · {conv.service}
              </div>
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-gray-100 text-xs text-gray-400 text-center">
          {conversations.length} conversations
        </div>
      </div>

      {/* Message display */}
      <div className="flex-1 flex flex-col bg-white">
        {activeConversation ? (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <div className="font-medium text-gray-900">
                  {activeConversation.display_name}
                </div>
                <div className="text-xs text-gray-500">
                  {activeConversation.chat_identifier} · {totalMessages} messages
                </div>
              </div>
              <button className="text-sm text-blue-600 hover:text-blue-800">
                Export
              </button>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50">
              {loading && messages.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8">Loading messages...</div>
              )}
              <div className="space-y-1">
                {messages.map((msg) => (
                  <ChatBubble key={msg.message_id} message={msg} />
                ))}
              </div>
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3">💬</div>
              <p>Select a conversation to view messages</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
