import React from 'react';
import {
  Download,
  BookOpen,
  Network,
  PackageCheck,
  FolderArchive,
  RotateCcw
} from 'lucide-react';
import { ScriptFile } from '../../types/script';

interface HeaderProps {
  scripts: ScriptFile[];
  onOpenReference: () => void;
  onOpenArchitecture: () => void;
  onDownloadAllZip: () => void;
  onReloadFromRepo: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  scripts,
  onOpenReference,
  onOpenArchitecture,
  onDownloadAllZip,
  onReloadFromRepo,
}) => {
  return (
    <header className="h-14 border-b border-neutral-800 bg-neutral-900/90 px-5 flex items-center justify-between shrink-0">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black font-mono text-sm shadow-inner">
          BP
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-neutral-100 tracking-tight">
              Boiling Point Reforger
            </span>
            <span className="text-[10px] font-mono text-amber-400/90 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
              Enforce Script
            </span>
          </div>
          <p className="text-[10px] text-neutral-500">
            Arma Reforger Mission Script Development
          </p>
        </div>
      </div>

      {/* Zone 2: Navigation & Helpers */}
      <nav className="hidden md:flex items-center gap-4 text-xs">
        <button
          onClick={onOpenArchitecture}
          className="flex items-center gap-1.5 text-neutral-400 hover:text-amber-400 transition-colors py-1 px-2 rounded-md hover:bg-neutral-800/50"
        >
          <Network className="w-3.5 h-3.5" />
          <span>Architektur-Pipeline</span>
        </button>

        <button
          onClick={onOpenReference}
          className="flex items-center gap-1.5 text-neutral-400 hover:text-amber-400 transition-colors py-1 px-2 rounded-md hover:bg-neutral-800/50"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Regeln & Enforce Docs</span>
        </button>
      </nav>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onReloadFromRepo}
          title="Web-App mit dem neuesten Skript-Stand aus dem Repository synchronisieren"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium transition-colors border border-neutral-700/60 shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
          <span>Skripte synchronisieren</span>
        </button>

        <button
          onClick={onDownloadAllZip}
          title="Alle Skripte als .ZIP mit Ordnerstruktur herunterladen"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition-colors border border-neutral-700/60 shadow-sm"
        >
          <FolderArchive className="w-3.5 h-3.5 text-amber-400" />
          <span>Alle Skripte (.zip)</span>
        </button>
      </div>
    </header>
  );
};
