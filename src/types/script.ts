export type ScriptStatus = 'new' | 'modified' | 'clean';

export interface ScriptFile {
  id: string;
  name: string;
  path: string; // e.g. "Components/BPR_MainMissionManagerComponent.c"
  folder: string; // e.g. "Components"
  content: string;
  status: ScriptStatus;
  description: string;
  tags?: string[];
  isCopied?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FolderNode {
  name: string;
  path: string;
  isOpen: boolean;
  childrenFolders: FolderNode[];
  files: ScriptFile[];
}
