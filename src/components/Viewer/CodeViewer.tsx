import React, { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  Edit3,
  Save,
  X,
  FileCode,
  Info,
  CheckCircle2,
  AlertCircle,
  Terminal,
  ShieldCheck
} from 'lucide-react';
import { ScriptFile } from '../../types/script';
import { EnforceSyntaxHighlighter } from './EnforceSyntaxHighlighter';

interface CodeViewerProps {
  script: ScriptFile | null;
  onCopyScript: (script: ScriptFile) => void;
  onUpdateContent: (id: string, newContent: string) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  script,
  onCopyScript,
  onUpdateContent,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [activeTab, setActiveTab] = useState<'code' | 'docs'>('code');

  if (!script) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-neutral-500 bg-neutral-950">
        <FileCode className="w-16 h-16 mb-4 text-neutral-700 stroke-1" />
        <h3 className="text-base font-semibold text-neutral-300 mb-1">
          Keine Datei ausgewählt
        </h3>
        <p className="text-xs text-neutral-500 max-w-sm text-center">
          Wähle ein Skript aus der linken Hierarchie aus, um den Enforce-Code anzuzeigen, zu kopieren oder zu bearbeiten.
        </p>
      </div>
    );
  }

  const handleStartEdit = () => {
    setEditContent(script.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onUpdateContent(script.id, editContent);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleDownload = () => {
    const blob = new Blob([script.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = script.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const lines = script.content.split('\n');
  const lineCount = lines.length;
  const fileSizeKb = (new Blob([script.content]).size / 1024).toFixed(1);

  // Analyze variables for Hungarian notation audit
  const memberVars = script.content.match(/\bm_[a-zA-Z0-9_]+\b/g) || [];
  const uniqueMembers = Array.from(new Set(memberVars));

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-hidden">
      {/* File Header Bar */}
      <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-900/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-neutral-800 rounded-md border border-neutral-700/60">
            <FileCode className="w-4 h-4 text-amber-400" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500 font-mono">
                {script.folder} /
              </span>
              <h1 className="text-sm font-semibold font-mono text-neutral-100">
                {script.name}
              </h1>

              {script.status === 'new' && (
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded font-semibold tracking-wider">
                  NEU
                </span>
              )}
              {script.status === 'modified' && (
                <span className="text-[10px] px-1.5 py-0.5 bg-amber-950 text-amber-400 border border-amber-800 rounded font-semibold tracking-wider">
                  GEÄNDERT
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono mt-0.5">
              <span>{lineCount} Zeilen</span>
              <span>·</span>
              <span>{fileSizeKb} KB</span>
              <span>·</span>
              <span>Enforce Script (Arma Reforger)</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Code vs Docs Tab */}
          <div className="flex items-center bg-neutral-800 p-0.5 rounded-lg text-xs mr-2">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'code'
                  ? 'bg-neutral-900 text-white font-medium shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Code
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'docs'
                  ? 'bg-neutral-900 text-white font-medium shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Erklärung & Regeln
            </button>
          </div>

          {isEditing ? (
            <>
              <button
                onClick={handleSaveEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-medium transition-colors shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Speichern</span>
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-md text-xs transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Abbrechen</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border border-neutral-750 rounded-md text-xs transition-colors"
                title="Skript direkt im Browser bearbeiten"
              >
                <Edit3 className="w-3.5 h-3.5 text-neutral-400" />
                <span>Bearbeiten</span>
              </button>

              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border border-neutral-750 rounded-md text-xs transition-colors"
                title="Datei als .c herunterladen"
              >
                <Download className="w-3.5 h-3.5 text-neutral-400" />
                <span>Download</span>
              </button>

              {/* Big Primary Copy Button */}
              <button
                onClick={() => onCopyScript(script)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-all shadow-sm ${
                  script.isCopied
                    ? 'bg-emerald-600 text-white border border-emerald-500'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {script.isCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>In Zwischenablage kopiert!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Code kopieren</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'code' ? (
          isEditing ? (
            <div className="h-full flex flex-col">
              <div className="text-xs text-neutral-400 mb-2 flex items-center justify-between">
                <span className="font-mono text-amber-400">Enfusion Script Editor (Workbench)</span>
                <span className="text-[11px] text-neutral-400">
                  Präfixe: <code className="text-sky-300 font-mono">i, f, s, b, v, a, m, e</code> · Member: <code className="text-amber-300 font-mono">m_</code>
                </span>
              </div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 w-full p-4 font-mono text-[13px] leading-6 bg-[#1e1e1e] text-[#d4d4d4] border border-[#2d2d2d] rounded-lg focus:outline-none focus:border-amber-500/60 resize-none shadow-2xl"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg overflow-hidden shadow-2xl">
              {/* Workbench Tab bar */}
              <div className="bg-[#252526] border-b border-[#2d2d2d] px-4 py-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 bg-[#1e1e1e] border-t-2 border-amber-500 text-neutral-200 font-mono text-[12px] flex items-center gap-2 rounded-t">
                    <FileCode className="w-3.5 h-3.5 text-amber-400" />
                    <span>{script.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-neutral-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#569cd6]"></span>
                    <span>Workbench Theme</span>
                  </span>
                  <span>UTF-8</span>
                  <span>Tab: 4 Spaces</span>
                </div>
              </div>

              <EnforceSyntaxHighlighter code={script.content} />
            </div>
          )
        ) : (
          /* Docs / Explanation Tab */
          <div className="max-w-4xl space-y-6 text-sm text-neutral-300 pb-8">
            {/* Description Card */}
            <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-lg">
              <div className="flex items-center gap-2 mb-2 text-neutral-100 font-semibold">
                <Info className="w-4 h-4 text-amber-400" />
                <span>Rolle in der Mission & Funktionsweise</span>
              </div>
              <p className="text-neutral-300 leading-relaxed text-xs">
                {script.description}
              </p>
            </div>

            {/* Hungarian Notation Audit */}
            <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-lg">
              <div className="flex items-center gap-2 mb-3 text-neutral-100 font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Ungarische Notation Check (BPR-Regeln)</span>
              </div>
              {uniqueMembers.length > 0 ? (
                <div>
                  <p className="text-xs text-neutral-400 mb-3">
                    Erkannte Member-Variablen in <code className="font-mono text-amber-400">{script.name}</code>:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {uniqueMembers.map((v) => {
                      const prefixMatch = v.match(/^m_([ifsbvamep])/);
                      const prefix = prefixMatch ? prefixMatch[1] : '?';
                      const prefixType: Record<string, string> = {
                        i: 'Integer',
                        f: 'Float',
                        s: 'String',
                        b: 'Boolean',
                        v: 'Vector',
                        a: 'Array',
                        m: 'Map',
                        e: 'Enum',
                        p: 'Pointer/Objekt Ref',
                      };

                      return (
                        <div
                          key={v}
                          className="flex items-center justify-between p-2 rounded bg-neutral-950 border border-neutral-800/80 font-mono text-xs"
                        >
                          <span className="text-amber-300 font-medium">{v}</span>
                          <span className="text-[11px] text-neutral-400">
                            {prefixType[prefix] || 'Benutzerdefiniert'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">
                  Keine Member-Variablen in dieser Datei definiert (z.B. statische Hilfsklasse oder Konfiguration).
                </p>
              )}
            </div>

            {/* Enforce Script Technical Notes */}
            <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-neutral-100 font-semibold">
                <Terminal className="w-4 h-4 text-sky-400" />
                <span>Enforce Script Architektur-Hinweise</span>
              </div>
              <ul className="text-xs space-y-2 text-neutral-400 list-disc list-inside">
                <li>
                  <strong className="text-neutral-200">Kein SQF:</strong> Arma Reforger verwendet die Enfusion Engine. Alle Klassen werden strikt objektorientiert in modernem Enforce Script kompiliert.
                </li>
                <li>
                  <strong className="text-neutral-200">Klassenpräfix BPR_:</strong> Alle missionseigenen Klassen tragen das Projektkürzel, um Namenskollisionen mit BI-Core-Scripten (SCR_) zu vermeiden.
                </li>
                <li>
                  <strong className="text-neutral-200">RplSession & World Editor Schutz:</strong> Die Hauptkomponente prüft <code className="font-mono text-amber-300">SCR_Global.IsEditMode()</code>, damit Logik nicht versehentlich beim Bauen im World Editor losrennt.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
