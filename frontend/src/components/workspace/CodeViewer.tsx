"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeViewerProps {
  content: string;
  language?: string;
}

const EXT_TO_LANG: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  json: "json",
  html: "html",
  css: "css",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
};

export function guessLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] || "text";
}

export default function CodeViewer({ content, language = "text" }: CodeViewerProps) {
  return (
    <div className="h-full overflow-auto">
      <SyntaxHighlighter
        style={oneLight}
        language={language}
        showLineNumbers
        lineNumberStyle={{ color: "#94a3b8", fontSize: "10px", minWidth: "2.5em" }}
        customStyle={{
          margin: 0,
          padding: "1rem",
          fontSize: "12px",
          background: "transparent",
          minHeight: "100%",
        }}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
}
