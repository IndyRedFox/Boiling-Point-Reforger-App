import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Search,
  Plus,
  FolderTree,
  FilePlus,
  Sparkles
} from 'lucide-react';
import { ScriptFile } from '../../types/script';

interface FileTreeProps {
  scripts: ScriptFile[];
  selectedScriptId: string | null;
  onSelectScript: (id: string) => void;
  onCopyScript: (script: ScriptFile, e?: React.MouseEvent) => void;
  onResetCopied: () => void;
  copiedCount: number;
  onOpenNewModal: (preselectedFolder?: string) => void;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isFolder: boolean;
  file?: ScriptFile;
  children: { [key: string]: TreeNode };
}

export const FileTree: React.FC<FileTreeProps> = ({
  scripts,
  selectedScriptId,
  onSelectScript,
  onCopyScript,
  onResetCopied,
  copiedCount,
  onOpenNewModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    'Components': true,
    'BaseManagers': true,
    'Mission': true,
    'Server': true,
    'Client': true,
    'Utilities': true,
    'Utilities/Global': true,
    'Utilities/Server': true,
    'Utilities/Client': true,
    'Configs': true,
  });

  // Toggle folder open state
  const toggleFolder = (folderPath: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const expandAll = () => {
    const allOpen: Record<string, boolean> = {
      'Components': true,
      'BaseManagers': true,
      'Mission': true,
      'Server': true,
      'Client': true,
      'Utilities': true,
      'Utilities/Global': true,
      'Utilities/Server': true,
      'Utilities/Client': true,
      'Configs': true,
    };
    setOpenFolders(allOpen);
  };

  const collapseAll = () => {
    setOpenFolders({});
  };

  // Build tree from scripts and default folders
  const rootNode = useMemo(() => {
    const root: TreeNode = {
      name: 'root',
      fullPath: '',
      isFolder: true,
      children: {},
    };

    // Pre-populate standard folders
    const allFolderPaths = [
      'Components',
      'BaseManagers',
      'Mission',
      'Server',
      'Client',
      'Utilities',
      'Utilities/Global',
      'Utilities/Server',
      'Utilities/Client',
      'Configs',
    ];

    allFolderPaths.forEach((fPath) => {
      const parts = fPath.split('/');
      let current = root;
      let currPath = '';
      parts.forEach((part) => {
        currPath = currPath ? `${currPath}/${part}` : part;
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            fullPath: currPath,
            isFolder: true,
            children: {},
          };
        }
        current = current.children[part];
      });
    });

    // Add scripts to tree
    scripts.forEach((script) => {
      // Filter by search query if any
      if (
        searchQuery &&
        !script.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !script.path.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return;
      }

      const parts = script.path.split('/');
      let current = root;
      let currPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        currPath = currPath ? `${currPath}/${part}` : part;

        if (isFile) {
          current.children[part] = {
            name: part,
            fullPath: currPath,
            isFolder: false,
            file: script,
            children: {},
          };
        } else {
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              fullPath: currPath,
              isFolder: true,
              children: {},
            };
          }
          current = current.children[part];
        }
      }
    });

    return root;
  }, [scripts, searchQuery]);

  // Recursively render tree nodes
  const renderTree = (node: TreeNode, depth: number = 0) => {
    const entries = Object.values(node.children).sort((a, b) => {
      // Folders first, then files
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    return (
      <div className="space-y-0.5">
        {entries.map((child) => {
          if (child.isFolder) {
            const isOpen = openFolders[child.fullPath] ?? false;
            const childCount = Object.keys(child.children).length;
            const fileCount = Object.values(child.children).filter((c) => !c.isFolder).length;

            return (
              <div key={child.fullPath} className="select-none">
                <div
                  className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-neutral-800/60 cursor-pointer text-xs font-medium text-neutral-300 transition-colors group"
                  style={{ paddingLeft: `${depth * 14 + 8}px` }}
                  onClick={() => toggleFolder(child.fullPath)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-neutral-500 hover:text-neutral-300">
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </span>
                    {isOpen ? (
                      <FolderOpen className="w-4 h-4 text-amber-500/90 shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-amber-600/80 shrink-0" />
                    )}
                    <span className="truncate text-neutral-200 font-semibold">{child.name}</span>
                    {fileCount > 0 && (
                      <span className="text-[10px] text-neutral-500 font-mono">
                        ({fileCount})
                      </span>
                    )}
                  </div>

                  <button
                    title={`Neues Skript in ${child.fullPath} erstellen`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenNewModal(child.fullPath);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-amber-400 text-neutral-500 transition-opacity"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {isOpen && (
                  <div>
                    {childCount === 0 ? (
                      <div
                        className="py-1 text-[11px] text-neutral-600 italic flex items-center justify-between"
                        style={{ paddingLeft: `${(depth + 1) * 14 + 16}px` }}
                      >
                        <span>(Ordner leer)</span>
                        <button
                          onClick={() => onOpenNewModal(child.fullPath)}
                          className="text-amber-500/70 hover:text-amber-400 text-[10px] underline mr-2"
                        >
                          + Skript hinzufügen
                        </button>
                      </div>
                    ) : (
                      renderTree(child, depth + 1)
                    )}
                  </div>
                )}
              </div>
            );
          }

          // File Node
          const script = child.file!;
          const isSelected = selectedScriptId === script.id;
          const isCopied = script.isCopied;

          return (
            <div
              key={script.id}
              onClick={() => onSelectScript(script.id)}
              className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-all group ${
                isSelected
                  ? 'bg-neutral-800 text-white font-medium shadow-sm border-l-2 border-amber-500'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
              }`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <FileCode
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSelected ? 'text-amber-400' : 'text-neutral-500 group-hover:text-neutral-300'
                  }`}
                />
                <span className="truncate font-mono text-[12px]">{script.name}</span>

                {script.status === 'new' && (
                  <span className="text-[9px] px-1 py-0.2 bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 rounded font-semibold tracking-wider">
                    NEU
                  </span>
                )}
                {script.status === 'modified' && (
                  <span className="text-[9px] px-1 py-0.2 bg-amber-950/80 text-amber-400 border border-amber-800/60 rounded font-semibold tracking-wider">
                    GEÄNDERT
                  </span>
                )}
              </div>

              {/* Copy Button direct behind the file: Icon only (green checkmark when copied) */}
              <button
                onClick={(e) => onCopyScript(script, e)}
                title={isCopied ? 'Bereits kopiert' : 'Code kopieren'}
                className={`shrink-0 p-1 rounded transition-colors ${
                  isCopied
                    ? 'text-emerald-400 hover:bg-emerald-950/60'
                    : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/60'
                }`}
              >
                {isCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900/90 border-r border-neutral-800 w-80 shrink-0">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-neutral-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold tracking-wide uppercase text-neutral-300">
              Missions-Dateien
            </h2>
            <span className="text-[11px] text-neutral-500 font-mono">
              ({scripts.length})
            </span>
          </div>

          <button
            onClick={() => onOpenNewModal()}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 rounded transition-colors"
            title="Neues Enforce-Skript anlegen"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>Neu</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="Skript suchen (z.B. Manager)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950/80 border border-neutral-800 rounded px-2.5 pl-8 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {/* Tree Controls & Clear Copied Markings Button */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-400">
          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="hover:text-neutral-200 underline text-[11px]"
            >
              Alle auf
            </button>
            <span className="text-neutral-600">·</span>
            <button
              onClick={collapseAll}
              className="hover:text-neutral-200 underline text-[11px]"
            >
              Alle zu
            </button>
          </div>

          {/* Reset Copied Markings Button - Requested specifically by user */}
          <button
            onClick={onResetCopied}
            disabled={copiedCount === 0}
            title="Löscht alle 'Kopiert' Markierungen in der Dateiliste"
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
              copiedCount > 0
                ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40'
                : 'text-neutral-600 cursor-not-allowed'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Markierungen löschen ({copiedCount})</span>
          </button>
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {renderTree(rootNode)}
      </div>

      {/* Sidebar Footer Info */}
      <div className="p-3 border-t border-neutral-800/80 bg-neutral-950/50 text-[11px] text-neutral-500 flex items-center justify-between">
        <span>Präfix: <code className="text-amber-400/90 font-mono">BPR_</code></span>
        <span>Notation: <code className="text-sky-400 font-mono">i, f, s, b, v, a, m</code></span>
      </div>
    </div>
  );
};
