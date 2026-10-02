import React, { useState } from 'react';
import { X, FileCode, PlusCircle } from 'lucide-react';
import { STANDARD_FOLDERS } from '../../data/initialScripts';
import { ScriptFile } from '../../types/script';

interface NewScriptModalProps {
  isOpen: boolean;
  preselectedFolder?: string;
  onClose: () => void;
  onCreateScript: (newScript: ScriptFile) => void;
}

export const NewScriptModal: React.FC<NewScriptModalProps> = ({
  isOpen,
  preselectedFolder = 'Mission',
  onClose,
  onCreateScript,
}) => {
  const [name, setName] = useState('');
  const [folder, setFolder] = useState(preselectedFolder);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanedName = name.trim();

    if (!cleanedName) {
      setError('Bitte gib einen Dateinamen an.');
      return;
    }

    if (!cleanedName.endsWith('.c')) {
      cleanedName += '.c';
    }

    if (!cleanedName.startsWith('BPR_')) {
      cleanedName = 'BPR_' + cleanedName;
    }

    const className = cleanedName.replace(/\.c$/, '');
    const path = `${folder}/${cleanedName}`;

    const templateContent = `// ============================================================================
// Project: Boiling Point Reforger (BPR)
// File: ${cleanedName}
// Author: Indy & AI Assistant
// Description: ${description || 'BPR mission module.'}
// ============================================================================

class ${className}
{
	const static string CALLER_ID = "${className.replace('BPR_', '')}";

	protected bool m_bIsInitialized;

	//------------------------------------------------------------------------------------------------
	//! Initializes ${className} logic
	void Init()
	{
		if (m_bIsInitialized)
			return;

		m_bIsInitialized = true;
		
		DebugLog.Info(CALLER_ID, "Initializing ${className} ...");

		// Module logic here
		
		DebugLog.Info(CALLER_ID, "${className} initialized.");
	}
};`;

    const newFile: ScriptFile = {
      id: 'script_' + Date.now(),
      name: cleanedName,
      path,
      folder,
      status: 'new',
      description: description || `Neues Skript in ${folder}`,
      content: templateContent,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };

    onCreateScript(newFile);
    setName('');
    setDescription('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-neutral-100">
              Neues Enforce-Skript erstellen
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-200 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 text-xs text-rose-300 bg-rose-950/60 border border-rose-800/80 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Zielordner
            </label>
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-amber-500/60"
            >
              {STANDARD_FOLDERS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Skript-Name (Klassenpräfix BPR_ wird automatisch ergänzt)
            </label>
            <div className="flex items-center">
              <span className="bg-neutral-800 border border-r-0 border-neutral-800 text-neutral-400 px-2.5 py-2 text-xs font-mono rounded-l-lg">
                BPR_
              </span>
              <input
                type="text"
                placeholder="WeatherManager oder MissionTracker"
                value={name.replace(/^BPR_/, '').replace(/\.c$/, '')}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-r-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-amber-500/60"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              Ergibt: <code className="font-mono text-amber-400">BPR_{name.replace(/^BPR_/, '').replace(/\.c$/, '') || '...'}.c</code>
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Beschreibung & Aufgabe
            </label>
            <textarea
              rows={3}
              placeholder="Was übernimmt dieses Modul in Boiling Point Reforger?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs text-neutral-400 hover:text-neutral-200 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Skript generieren</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
