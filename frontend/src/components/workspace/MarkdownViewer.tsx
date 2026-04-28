"use client";

import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownViewerProps {
  content: string;
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="prose prose-sm max-w-none overflow-auto p-4 prose-headings:text-slate-800 prose-p:text-slate-600 prose-a:text-blue-600 prose-code:text-pink-600">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeStr = String(children).replace(/\n$/, "");

            if (match) {
              return (
                <SyntaxHighlighter
                  style={oneLight}
                  language={match[1]}
                  PreTag="div"
                  className="rounded-md text-xs"
                >
                  {codeStr}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
