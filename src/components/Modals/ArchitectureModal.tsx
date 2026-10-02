import React from 'react';
import { X, Network, Server, Monitor, Globe, ShieldAlert, Cpu } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-3xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Network className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-neutral-100">
                Boiling Point Reforger – Architektur & Ausführungs-Pipeline
              </h2>
              <p className="text-[11px] text-neutral-500">
                Wie deine Manager-Skripte in der Enfusion Engine gestartet werden
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-200 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-neutral-300">
          {/* Visual Diagram */}
          <div className="bg-neutral-950 p-5 rounded-xl border border-neutral-800 space-y-4 font-mono">
            {/* Stage 1: GameMode & Component */}
            <div className="p-3 bg-neutral-900/90 border border-amber-500/40 rounded-lg text-center">
              <div className="flex items-center justify-center gap-2 text-amber-300 font-bold text-xs mb-1">
                <Cpu className="w-4 h-4" />
                <span>SCR_BaseGameMode &rarr; BPR_MainMissionManagerComponent</span>
              </div>
              <p className="text-[11px] text-neutral-400 font-sans">
                Wird als Komponente an das GameMode-Entity im World Editor gehängt.
              </p>
            </div>

            {/* Down Arrow */}
            <div className="text-center text-neutral-500 text-base font-bold">&darr;</div>

            {/* Stage 2: World Post Process & Edit Mode Check */}
            <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg">
              <div className="flex items-center gap-2 text-sky-300 font-semibold mb-1">
                <ShieldAlert className="w-4 h-4 text-sky-400" />
                <span>1. OnWorldPostProcess(World world)</span>
              </div>
              <p className="text-[11px] text-neutral-400 font-sans">
                Wartet, bis alle Entities in der Welt geladen sind. Prüft <code className="text-amber-400">SCR_Global.IsEditMode()</code>, um unbeabsichtigte Ausführung im Editor zu verhindern.
              </p>
            </div>

            {/* Down Arrow */}
            <div className="text-center text-neutral-500 text-base font-bold">&darr;</div>

            {/* Stage 3: Global Manager */}
            <div className="p-3 bg-neutral-900/90 border border-purple-500/40 rounded-lg">
              <div className="flex items-center gap-2 text-purple-300 font-bold mb-1">
                <Globe className="w-4 h-4 text-purple-400" />
                <span>2. BPR_GlobalMissionManager.Init()</span>
              </div>
              <p className="text-[11px] text-neutral-400 font-sans">
                Läuft auf Server und Client gleichermaßen. Liest Version aus <code className="text-amber-400">BPR_VariablesConfig</code>.
              </p>
            </div>

            {/* Down Arrow */}
            <div className="text-center text-neutral-500 text-base font-bold">&darr; RplSession.Mode() Verzweigung</div>

            {/* Stage 4: Server & Client Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-neutral-900/80 border border-emerald-500/40 rounded-lg">
                <div className="flex items-center gap-2 text-emerald-300 font-bold mb-1">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <span>3a. BPR_ServerMissionManager</span>
                </div>
                <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
                  Startet, wenn <code className="text-emerald-400">Mode != Client</code> (Dedicated Server, Host). Zuständig für KI-Spawns, Server-Wetter, Missions-Zustände.
                </p>
              </div>

              <div className="p-3 bg-neutral-900/80 border border-sky-500/40 rounded-lg">
                <div className="flex items-center gap-2 text-sky-300 font-bold mb-1">
                  <Monitor className="w-4 h-4 text-sky-400" />
                  <span>3b. BPR_ClientMissionManager</span>
                </div>
                <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">
                  Startet, wenn <code className="text-sky-400">Mode != Dedicated</code> (Spieler-Client). Zuständig für Menüs, HUD, Audio, Kamera-Effekte.
                </p>
              </div>
            </div>
          </div>

          {/* Explanation Text */}
          <div className="space-y-2">
            <h4 className="font-semibold text-neutral-200">
              Vorteil dieses Aufbaus für dich als Anfänger:
            </h4>
            <p className="text-neutral-400 leading-relaxed">
              Jedes neue Feature, das du später baust (z.B. ein Spawnsystem oder ein HUD-Element), wird einfach als Submodul in den jeweiligen Manager (<code className="text-amber-300">Server</code>, <code className="text-sky-300">Client</code> oder <code className="text-purple-300">Global</code>) eingehängt. Dadurch bleibt jede Datei klein, modular und übersichtlich.
            </p>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition-colors"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
};
