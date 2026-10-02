import React from 'react';

interface EnforceSyntaxHighlighterProps {
  code: string;
}

// Exact Arma Reforger Workbench Script Editor Color Theme (Enfusion Engine)
const WORKBENCH_COLORS = {
  bg: '#1e1e1e',
  gutterBg: '#1e1e1e',
  gutterText: '#858585',
  gutterBorder: '#2b2b2b',
  lineHover: 'rgba(255, 255, 255, 0.04)',
  comment: '#608b4e',      // Classic Enforce script green
  docComment: '#6a9955',   // //! documentation comment
  keyword: '#569cd6',      // Workbench keyword blue
  type: '#4ec9b0',         // Core types and classes teal
  method: '#dcdcaa',       // Function / method call yellow
  variable: '#9cdcfe',     // Member variables (m_...) and Hungarian identifiers
  constant: '#4fc1ff',     // Uppercase constants (CALLER_ID, PREFIX)
  string: '#ce9178',       // Terracotta / peach string literals
  number: '#b5cea8',       // Light sage green numbers
  attribute: '#d7ba7d',    // [ComponentEditorProps(...)] khaki/gold
  attributeBracket: '#808080',
  punctuation: '#d4d4d4',  // Operators and brackets
  defaultText: '#d4d4d4',
};

export const EnforceSyntaxHighlighter: React.FC<EnforceSyntaxHighlighterProps> = ({ code }) => {
  const lines = code.split('\n');

  // Tokenize an individual line according to Reforger Workbench syntax rules
  const renderWorkbenchLine = (line: string, lineIndex: number) => {
    if (!line) {
      return <span key={lineIndex} className="inline-block h-5">&nbsp;</span>;
    }

    const trimmed = line.trimStart();

    // 1. Full line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      const isDoc = trimmed.startsWith('//!');
      return (
        <span
          key={lineIndex}
          style={{ color: isDoc ? WORKBENCH_COLORS.docComment : WORKBENCH_COLORS.comment }}
          className="italic"
        >
          {line}
        </span>
      );
    }

    // 2. Full line Attributes like [ComponentEditorProps(...)]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return (
        <span key={lineIndex}>
          <span style={{ color: WORKBENCH_COLORS.attributeBracket }}>[</span>
          <span style={{ color: WORKBENCH_COLORS.attribute }} className="font-medium">
            {line.trim().slice(1, -1)}
          </span>
          <span style={{ color: WORKBENCH_COLORS.attributeBracket }}>]</span>
        </span>
      );
    }

    // 3. Line Tokenizer with strict precedence:
    // Comments -> Strings -> Keywords -> Core Types -> Custom Classes -> Methods -> Members & Hungarian Vars -> Constants -> Numbers -> Operators
    const tokenRegex = /(?:\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|\b(?:class|override|void|ref|static|const|protected|private|public|new|super|return|if|else|while|for|switch|case|break|continue|default|true|false|null|extends|autoptr|out|inout|notnull|sealed|typedef)\b|\b(?:int|float|string|bool|vector|array|map|set|Managed|IEntity|GenericEntity|World|RplMode|RplSession|SCR_Global|System|LogLevel|typename)\b|\b(?:BPR_[A-Za-z0-9_]+|SCR_[A-Za-z0-9_]+)\b|\b(?:m_[a-zA-Z0-9_]+)\b|\b(?:[ifsbvamep][A-Z][a-zA-Z0-9_]*)\b|\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()|\b(?:[A-Z][A-Z0-9_]{2,})\b|\b\d+(?:\.\d+)?f?\b|[\[\]{}();,.<>=!+\-*/&|:])/g;

    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    const KEYWORDS = new Set([
      'class', 'override', 'void', 'ref', 'static', 'const', 'protected',
      'private', 'public', 'new', 'super', 'return', 'if', 'else', 'while',
      'for', 'switch', 'case', 'break', 'continue', 'default', 'true', 'false',
      'null', 'extends', 'autoptr', 'out', 'inout', 'notnull', 'sealed', 'typedef'
    ]);

    const CORE_TYPES = new Set([
      'int', 'float', 'string', 'bool', 'vector', 'array', 'map', 'set',
      'Managed', 'IEntity', 'GenericEntity', 'World', 'RplMode', 'RplSession',
      'SCR_Global', 'System', 'LogLevel', 'typename'
    ]);

    while ((match = tokenRegex.exec(line)) !== null) {
      const matchIndex = match.index;
      const matchedText = match[0];

      // Text before match
      if (matchIndex > lastIdx) {
        parts.push(
          <span
            key={`gap-${lineIndex}-${lastIdx}`}
            style={{ color: WORKBENCH_COLORS.defaultText }}
          >
            {line.slice(lastIdx, matchIndex)}
          </span>
        );
      }

      // Format token based on type
      if (matchedText.startsWith('//') || matchedText.startsWith('/*')) {
        const isDoc = matchedText.startsWith('//!');
        parts.push(
          <span
            key={`comm-${lineIndex}-${matchIndex}`}
            style={{ color: isDoc ? WORKBENCH_COLORS.docComment : WORKBENCH_COLORS.comment }}
            className="italic"
          >
            {matchedText}
          </span>
        );
      } else if (matchedText.startsWith('"')) {
        parts.push(
          <span
            key={`str-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.string }}
          >
            {matchedText}
          </span>
        );
      } else if (KEYWORDS.has(matchedText)) {
        parts.push(
          <span
            key={`kw-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.keyword }}
            className="font-medium"
          >
            {matchedText}
          </span>
        );
      } else if (CORE_TYPES.has(matchedText) || matchedText.startsWith('BPR_') || matchedText.startsWith('SCR_')) {
        parts.push(
          <span
            key={`type-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.type }}
          >
            {matchedText}
          </span>
        );
      } else if (matchedText.startsWith('m_')) {
        // Hungarian member variables (e.g. m_bIsInitialized, m_pGlobalMissionManager)
        parts.push(
          <span
            key={`mem-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.variable }}
          >
            {matchedText}
          </span>
        );
      } else if (/^[ifsbvamep][A-Z][a-zA-Z0-9_]*$/.test(matchedText)) {
        // Hungarian local variables / parameters (e.g. sCaller, sMessage, iHour)
        parts.push(
          <span
            key={`var-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.variable }}
          >
            {matchedText}
          </span>
        );
      } else if (match[1]) {
        // Function / Method invocation (e.g. Init(), GetTimestamp(), Info(), Format())
        parts.push(
          <span
            key={`fn-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.method }}
          >
            {matchedText}
          </span>
        );
      } else if (/^[A-Z][A-Z0-9_]{2,}$/.test(matchedText)) {
        // Uppercase constants (e.g. CALLER_ID, PREFIX, MISSION_NAME)
        parts.push(
          <span
            key={`const-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.constant }}
          >
            {matchedText}
          </span>
        );
      } else if (/^\d/.test(matchedText)) {
        // Numbers
        parts.push(
          <span
            key={`num-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.number }}
          >
            {matchedText}
          </span>
        );
      } else {
        // Operators & standard punctuation
        parts.push(
          <span
            key={`punc-${lineIndex}-${matchIndex}`}
            style={{ color: WORKBENCH_COLORS.punctuation }}
          >
            {matchedText}
          </span>
        );
      }

      lastIdx = tokenRegex.lastIndex;
    }

    if (lastIdx < line.length) {
      parts.push(
        <span
          key={`tail-${lineIndex}-${lastIdx}`}
          style={{ color: WORKBENCH_COLORS.defaultText }}
        >
          {line.slice(lastIdx)}
        </span>
      );
    }

    return (
      <span key={lineIndex} className="inline-block min-w-full">
        {parts}
      </span>
    );
  };

  return (
    <div
      className="font-mono text-[13px] leading-6 select-text"
      style={{ backgroundColor: WORKBENCH_COLORS.bg }}
    >
      {lines.map((line, idx) => (
        <div
          key={idx}
          className="flex transition-colors group"
          style={{
            minHeight: '24px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = WORKBENCH_COLORS.lineHover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {/* Gutter Line Number */}
          <span
            className="w-12 shrink-0 select-none text-right pr-4 font-mono text-xs tabular-nums border-r pt-0.5"
            style={{
              color: WORKBENCH_COLORS.gutterText,
              borderColor: WORKBENCH_COLORS.gutterBorder,
              backgroundColor: WORKBENCH_COLORS.gutterBg,
            }}
          >
            {idx + 1}
          </span>

          {/* Code Text */}
          <div className="flex-1 overflow-x-auto whitespace-pre pl-4 pr-4">
            {renderWorkbenchLine(line, idx)}
          </div>
        </div>
      ))}
    </div>
  );
};
