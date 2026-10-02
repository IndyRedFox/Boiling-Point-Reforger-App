import React from 'react';
import { X, BookOpen, ExternalLink, ShieldCheck, Code, CheckCircle } from 'lucide-react';

interface ReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReferenceModal: React.FC<ReferenceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-2xl max-h-[85vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-neutral-100">
                Enforce Script & BPR Modding Leitfaden
              </h2>
              <p className="text-[11px] text-neutral-500">
                Konventionen und Dokumentationen für Boiling Point Reforger
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
          {/* Hungarian Notation Table */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <ShieldCheck className="w-4 h-4" />
              <h3>Ungarische Notation (Strikte Typ-Präfixe)</h3>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              Variablennamen sollen kurz, aber selbsterklärend und voll ausgeschrieben sein (keine kryptischen Abkürzungen).
            </p>

            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="py-2 px-3">Präfix</th>
                    <th className="py-2 px-3">Datentyp</th>
                    <th className="py-2 px-3">Beispiel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 bg-neutral-900/50">
                  <tr>
                    <td className="py-2 px-3 text-amber-400 font-bold">i</td>
                    <td className="py-2 px-3 text-neutral-300">Integer</td>
                    <td className="py-2 px-3 text-sky-300">int iCount, int iHealth</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-amber-400 font-bold">f</td>
                    <td className="py-2 px-3 text-neutral-300">Float</td>
                    <td className="py-2 px-3 text-sky-300">float fDistance, float fSpeed</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-amber-400 font-bold">s</td>
                    <td className="py-2 px-3 text-neutral-300">String</td>
                    <td className="py-2 px-3 text-sky-300">string sText, string sCaller</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-amber-400 font-bold">b</td>
                    <td className="py-2 px-3 text-neutral-300">Boolean</td>
                    <td className="py-2 px-3 text-sky-300">bool bIsEnabled, bool bIsAlive</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-amber-400 font-bold">v</td>
                    <td className="py-2 px-3 text-neutral-300">Vector</td>
                    <td className="py-2 px-3 text-sky-300">vector vPosition, vector vSpawn</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-amber-400 font-bold">a</td>
                    <td className="py-2 px-3 text-neutral-300">Array</td>
                    <td className="py-2 px-3 text-sky-300">ref array&lt;int&gt; aScores, ref array&lt;string&gt; aNames</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-amber-400 font-bold">m</td>
                    <td className="py-2 px-3 text-neutral-300">Map / Dict</td>
                    <td className="py-2 px-3 text-sky-300">ref map&lt;string, int&gt; mPlayerIDs</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-amber-400 font-bold">e</td>
                    <td className="py-2 px-3 text-neutral-300">Enum</td>
                    <td className="py-2 px-3 text-sky-300">SCR_EGameModeState eCurrentState</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg">
              <strong className="text-amber-300 block mb-1">Klassenvariablen (Member-Variablen):</strong>
              <p className="text-neutral-300 text-[11px]">
                Immer das Präfix <code className="font-mono text-amber-300">m_</code> gefolgt vom Typ-Präfix verwenden, z.B.:
                <code className="block mt-1 font-mono text-sky-300">
                  int m_iHealth; vector m_vSpawnPoint; ref array&lt;ref SW_BaseClass&gt; m_aInventory;
                </code>
              </p>
            </div>
          </div>

          {/* Enforce Script vs SQF */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <Code className="w-4 h-4" />
              <h3>Enforce Script (Enfusion) vs. SQF (Arma 3)</h3>
            </div>
            <ul className="space-y-1.5 text-neutral-400 list-disc list-inside">
              <li>Kein altes SQF mehr! Enforce Script ist objektorientiert (OOP), typisiert und kompiliert.</li>
              <li>Alle Missionsklassen verwenden das Präfix <strong className="text-neutral-200">BPR_</strong>.</li>
              <li>Immer nur den notwendigen Code schreiben: <code className="font-mono text-neutral-300">owner</code> nur übergeben wenn er benötigt wird, gleiches für Getter.</li>
            </ul>
          </div>

          {/* Official Documentation Links */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
              <ExternalLink className="w-4 h-4" />
              <h3>Offizielle Bohemia Interactive Dokumentationen</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a
                href="https://community.bistudio.com/wiki/Category:Arma_Reforger"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 transition-colors"
              >
                <span>Arma Reforger Haupt-Wiki</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
              </a>
              <a
                href="https://community.bistudio.com/wiki/Category:Arma_Reforger/Modding/Scripting"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 transition-colors"
              >
                <span>Scripting & Modding Guide</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
              </a>
              <a
                href="https://community.bistudio.com/wiki/Category:Arma_Reforger/Modding/Official_Tools"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 transition-colors"
              >
                <span>Workbench Tools</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
              </a>
              <a
                href="https://community.bistudio.com/wikidata/external-data/arma-reforger/EnfusionScriptAPIPublic/index.html"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 transition-colors"
              >
                <span>Enfusion Script API Public</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
              </a>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
