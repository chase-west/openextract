import { useState } from 'react';
import { BackupInfo } from '../hooks/useBackup';
import MessageView from './MessageView';
import PhotoGallery from './photos/PhotoGallery';
import VoicemailView from './voicemail/VoicemailView';
import CallsView from './calls/CallsView';
import ContactsView from './contacts/ContactsView';
import NotesView from './notes/NotesView';

type Tab = 'messages' | 'photos' | 'voicemail' | 'calls' | 'contacts' | 'notes';

interface Props {
  backup: BackupInfo;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'messages', label: 'Messages', icon: '💬' },
  { id: 'photos', label: 'Photos', icon: '📷' },
  { id: 'voicemail', label: 'Voicemail', icon: '📞' },
  { id: 'calls', label: 'Calls', icon: '📋' },
  { id: 'contacts', label: 'Contacts', icon: '👤' },
  { id: 'notes', label: 'Notes', icon: '📝' },
];

export default function Dashboard({ backup }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('messages');

  return (
    <div className="flex h-full">
      {/* Sidebar navigation */}
      <nav className="w-16 bg-gray-100 border-r border-gray-200 flex flex-col items-center py-4 gap-1 flex-shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center text-xs transition-colors ${activeTab === tab.id
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
            title={tab.label}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px] mt-0.5">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'messages' && <MessageView udid={backup.udid} />}
        {activeTab === 'photos' && <PhotoGallery backup={backup} />}
        {activeTab === 'voicemail' && <VoicemailView backup={backup} />}
        {activeTab === 'calls' && <CallsView backup={backup} />}
        {activeTab === 'contacts' && <ContactsView backup={backup} />}
        {activeTab === 'notes' && <NotesView backup={backup} />}
      </div>
    </div>
  );
}
