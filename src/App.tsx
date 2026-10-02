/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { INITIAL_SCRIPTS } from './data/initialScripts';
import { ScriptFile } from './types/script';
import { Header } from './components/Header/Header';
import { FileTree } from './components/Sidebar/FileTree';
import { CodeViewer } from './components/Viewer/CodeViewer';
import { NewScriptModal } from './components/Modals/NewScriptModal';
import { ReferenceModal } from './components/Modals/ReferenceModal';
import { ArchitectureModal } from './components/Modals/ArchitectureModal';

interface StoredDiffState {
  copiedIds?: string[];
  customScripts?: ScriptFile[];
  modifiedContents?: Record<string, string>;
}

const STORAGE_KEY = 'bpr_state_v5';

// Cleans up all legacy bloated keys (bpr_scripts_v1 ... v27) to free browser storage quota
function cleanupLegacyStorage() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('bpr_scripts_') || (key.startsWith('bpr_') && key !== STORAGE_KEY))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Could not clean legacy localStorage keys', err);
  }
}

function loadStoredScripts(): ScriptFile[] {
  cleanupLegacyStorage();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_SCRIPTS;

    const data: StoredDiffState = JSON.parse(raw);
    const copiedSet = new Set(data.copiedIds || []);
    const modifiedMap = data.modifiedContents || {};
    const custom = data.customScripts || [];

    const builtIns: ScriptFile[] = INITIAL_SCRIPTS.map((s) => ({
      ...s,
      content: modifiedMap[s.id] !== undefined ? modifiedMap[s.id] : s.content,
      isCopied: copiedSet.has(s.id),
      status: modifiedMap[s.id] !== undefined ? 'modified' : s.status,
    }));

    return [...builtIns, ...custom];
  } catch (e) {
    console.warn('Failed to parse saved scripts state', e);
    return INITIAL_SCRIPTS;
  }
}

function saveStoredScripts(scripts: ScriptFile[]) {
  try {
    const initialIds = new Set(INITIAL_SCRIPTS.map((s) => s.id));
    const initialContentMap = new Map(INITIAL_SCRIPTS.map((s) => [s.id, s.content]));

    const copiedIds: string[] = [];
    const modifiedContents: Record<string, string> = {};
    const customScripts: ScriptFile[] = [];

    for (const script of scripts) {
      if (script.isCopied) {
        copiedIds.push(script.id);
      }
      if (!initialIds.has(script.id)) {
        customScripts.push(script);
      } else {
        const origContent = initialContentMap.get(script.id);
        if (script.content !== origContent) {
          modifiedContents[script.id] = script.content;
        }
      }
    }

    const payload: StoredDiffState = {
      copiedIds,
      customScripts,
      modifiedContents,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save state to localStorage (quota or storage disabled)', err);
    cleanupLegacyStorage();
  }
}

export default function App() {
  const [scripts, setScripts] = useState<ScriptFile[]>(loadStoredScripts);

  const [selectedScriptId, setSelectedScriptId] = useState<string>(() => {
    return INITIAL_SCRIPTS[0]?.id || '';
  });

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [preselectedFolder, setPreselectedFolder] = useState<string>('Mission');
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);
  const [isArchModalOpen, setIsArchModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Save lightweight state (only copied flags, user edits, and custom scripts) to localStorage
  useEffect(() => {
    saveStoredScripts(scripts);
  }, [scripts]);

  // Selected script
  const selectedScript = scripts.find((s) => s.id === selectedScriptId) || scripts[0] || null;

  // Number of files currently marked as copied
  const copiedCount = scripts.filter((s) => s.isCopied).length;

  // Force sync from codebase
  const handleReloadFromRepo = () => {
    cleanupLegacyStorage();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setScripts(INITIAL_SCRIPTS);
    showToast('Web-App erfolgreich mit Codebase synchronisiert');
  };

  // Copy code to clipboard and mark as copied
  const handleCopyScript = async (script: ScriptFile, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(script.content);
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = script.content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setScripts((prev) =>
        prev.map((s) => (s.id === script.id ? { ...s, isCopied: true } : s))
      );

      showToast(`Code von ${script.name} kopiert!`);
    } catch (err) {
      console.error('Copy failed', err);
      showToast(`Kopieren fehlgeschlagen`);
    }
  };

  // Reset all copied flags
  const handleResetCopied = () => {
    setScripts((prev) => prev.map((s) => ({ ...s, isCopied: false })));
    showToast('Alle Kopiert-Markierungen wurden zurückgesetzt');
  };

  // Update content of a script
  const handleUpdateContent = (id: string, newContent: string) => {
    setScripts((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              content: newContent,
              status: 'modified',
              updatedAt: new Date().toISOString().split('T')[0],
            }
          : s
      )
    );
    showToast('Änderungen gespeichert');
  };

  // Create a new script
  const handleCreateScript = (newScript: ScriptFile) => {
    setScripts((prev) => [...prev, newScript]);
    setSelectedScriptId(newScript.id);
    showToast(`Skript ${newScript.name} erstellt`);
  };

  const handleOpenNewModal = (folder?: string) => {
    if (folder) setPreselectedFolder(folder);
    setIsNewModalOpen(true);
  };

  // Export all scripts as a zip file with folder structure
  const handleDownloadAllZip = async () => {
    const zip = new JSZip();

    scripts.forEach((script) => {
      zip.file(script.path, script.content);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BoilingPointReforger_Scripts_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Alle Skripte als ZIP heruntergeladen');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 font-sans text-neutral-100">
      {/* Top Header */}
      <Header
        scripts={scripts}
        onOpenReference={() => setIsRefModalOpen(true)}
        onOpenArchitecture={() => setIsArchModalOpen(true)}
        onDownloadAllZip={handleDownloadAllZip}
        onReloadFromRepo={handleReloadFromRepo}
      />

      {/* Main Workspace: Sidebar Tree + Code Viewer */}
      <div className="flex-1 flex overflow-hidden">
        <FileTree
          scripts={scripts}
          selectedScriptId={selectedScript?.id || null}
          onSelectScript={setSelectedScriptId}
          onCopyScript={handleCopyScript}
          onResetCopied={handleResetCopied}
          copiedCount={copiedCount}
          onOpenNewModal={handleOpenNewModal}
        />

        <CodeViewer
          script={selectedScript}
          onCopyScript={handleCopyScript}
          onUpdateContent={handleUpdateContent}
        />
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-neutral-800 text-neutral-100 border border-neutral-700 px-4 py-2.5 rounded-lg text-xs font-medium shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <NewScriptModal
        isOpen={isNewModalOpen}
        preselectedFolder={preselectedFolder}
        onClose={() => setIsNewModalOpen(false)}
        onCreateScript={handleCreateScript}
      />

      <ReferenceModal
        isOpen={isRefModalOpen}
        onClose={() => setIsRefModalOpen(false)}
      />

      <ArchitectureModal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
      />
    </div>
  );
}
