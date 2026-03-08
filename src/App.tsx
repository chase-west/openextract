import { useState, useEffect } from 'react';
import { useBackup, BackupInfo } from './hooks/useBackup';
import BackupSelector from './components/BackupSelector';
import Dashboard from './components/Dashboard';

type Screen = 'select' | 'dashboard';

export default function App() {
  const [screen, setScreen] = useState<Screen>('select');
  const backup = useBackup();

  useEffect(() => {
    if (backup.activeBackup) {
      setScreen('dashboard');
    }
  }, [backup.activeBackup]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Title bar area */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-800">
            OpenExtract
          </h1>
          {backup.activeBackup && (
            <span className="text-sm text-gray-500">
              — {backup.activeBackup.device_name} (iOS {backup.activeBackup.product_version})
            </span>
          )}
        </div>
        {backup.activeBackup && (
          <button
            onClick={() => {
              backup.setActiveBackup(null);
              setScreen('select');
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ← Change Backup
          </button>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {screen === 'select' && (
          <BackupSelector
            backups={backup.backups}
            loading={backup.loading}
            error={backup.error}
            onRefresh={backup.listBackups}
            onOpen={backup.openBackup}
          />
        )}
        {screen === 'dashboard' && backup.activeBackup && (
          <Dashboard backup={backup.activeBackup} />
        )}
      </main>
    </div>
  );
}
