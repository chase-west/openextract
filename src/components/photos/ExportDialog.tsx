import { useState } from 'react';
import { ExportOptions } from '../../types';
import { selectFolder } from '../../lib/ipc';

interface Props {
  onClose: () => void;
  onExport: (outputDir: string, options: ExportOptions) => Promise<{ exported: number; errors: number }>;
}

const DEFAULTS: ExportOptions = {
  include_videos: true,
  include_live_photo_videos: true,
  format: 'original',
  jpeg_quality: 90,
  folder_structure: 'by_date',
  export_originals_if_edited: false,
  include_metadata_sidecar: false,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-gray-400 text-xs block mb-1">{label}</label>
      {children}
    </div>
  );
}

function StyledSelect({
  value, onChange, children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-gray-800 text-gray-200 text-sm px-3 py-1.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
    >
      {children}
    </select>
  );
}

function Toggle({
  label, description, checked, onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-blue-500 flex-shrink-0"
      />
      <span>
        <span className="text-gray-300 text-sm">{label}</span>
        {description && (
          <span className="block text-gray-600 text-xs mt-0.5">{description}</span>
        )}
      </span>
    </label>
  );
}

export default function ExportDialog({ onClose, onExport }: Props) {
  const [options, setOptions] = useState<ExportOptions>(DEFAULTS);
  const [outputDir, setOutputDir] = useState('');
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ exported: number; errors: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
    setOptions(o => ({ ...o, [key]: value }));

  const pickFolder = async () => {
    const dir = await selectFolder();
    if (dir) setOutputDir(dir);
  };

  const handleExport = async () => {
    if (!outputDir) return;
    setExporting(true);
    setExportError(null);
    try {
      const r = await onExport(outputDir, options);
      setResult(r);
    } catch (e: any) {
      setExportError(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="text-white font-medium">Export Photos</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">✕</button>
        </div>

        {result ? (
          /* Completion screen */
          <div className="px-5 py-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-white font-medium text-lg">Export Complete</p>
            <p className="text-gray-400 text-sm mt-2">
              {result.exported.toLocaleString()} items exported
              {result.errors > 0 && (
                <span className="text-yellow-500"> · {result.errors} errors</span>
              )}
            </p>
            <button
              onClick={onClose}
              className="mt-5 bg-blue-600 hover:bg-blue-500 text-white text-sm px-5 py-2 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Output folder */}
            <Field label="Output Folder">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={outputDir}
                  placeholder="Choose a destination folder…"
                  className="flex-1 bg-gray-800 text-gray-300 text-sm px-3 py-1.5 rounded border border-gray-600 placeholder-gray-600 focus:outline-none"
                />
                <button
                  onClick={pickFolder}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm px-3 py-1.5 rounded border border-gray-600 transition-colors flex-shrink-0"
                >
                  Browse
                </button>
              </div>
            </Field>

            {/* Folder structure */}
            <Field label="Folder Structure">
              <StyledSelect
                value={options.folder_structure}
                onChange={v => set('folder_structure', v as ExportOptions['folder_structure'])}
              >
                <option value="flat">Flat — all files in one folder</option>
                <option value="by_date">By Date — organised as YYYY/MM/</option>
                <option value="by_album">By Album</option>
              </StyledSelect>
            </Field>

            {/* Format */}
            <Field label="Photo Format">
              <StyledSelect
                value={options.format}
                onChange={v => set('format', v as ExportOptions['format'])}
              >
                <option value="original">Original — preserve HEIC/RAW</option>
                <option value="jpeg">Convert to JPEG</option>
              </StyledSelect>
            </Field>

            {/* JPEG quality slider */}
            {options.format === 'jpeg' && (
              <Field label={`JPEG Quality: ${options.jpeg_quality}`}>
                <input
                  type="range"
                  min={60}
                  max={100}
                  value={options.jpeg_quality}
                  onChange={e => set('jpeg_quality', Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-gray-600 text-[10px] mt-0.5">
                  <span>Smaller file</span>
                  <span>Higher quality</span>
                </div>
              </Field>
            )}

            {/* Toggle options */}
            <div className="space-y-3 pt-1">
              <Toggle
                label="Include Videos"
                checked={options.include_videos}
                onChange={v => set('include_videos', v)}
              />
              <Toggle
                label="Include Live Photo Videos"
                checked={options.include_live_photo_videos}
                onChange={v => set('include_live_photo_videos', v)}
              />
              <Toggle
                label="Export Original (if photo was edited)"
                description="Saves the unedited original alongside the edited version"
                checked={options.export_originals_if_edited}
                onChange={v => set('export_originals_if_edited', v)}
              />
              <Toggle
                label="Write Metadata Sidecar (.json)"
                description="Saves date, GPS, album info next to each file"
                checked={options.include_metadata_sidecar}
                onChange={v => set('include_metadata_sidecar', v)}
              />
            </div>

            {/* Error */}
            {exportError && (
              <p className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded px-3 py-2">
                {exportError}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1 border-t border-gray-800">
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-sm px-4 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={!outputDir || exporting}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {exporting ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
