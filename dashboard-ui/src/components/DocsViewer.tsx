import { useState, useEffect } from 'react';
import { Copy, Download, Check, FileText, Code2 } from 'lucide-react';
import { docs } from '../lib/api';
import { cn } from '../lib/utils';

type DocTab = 'markdown' | 'typescript';

export default function DocsViewer({ serverId, serverName }: { serverId: string; serverName: string }) {
  const [docTab, setDocTab] = useState<DocTab>('markdown');
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [tsTypes, setTsTypes] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    const fetcher = docTab === 'markdown' ? docs.markdown(serverId) : docs.types(serverId);
    fetcher
      .then((text) => {
        if (docTab === 'markdown') setMarkdown(text);
        else setTsTypes(text);
      })
      .catch(() => {
        if (docTab === 'markdown') setMarkdown('Failed to generate docs.');
        else setTsTypes('Failed to generate types.');
      })
      .finally(() => setLoading(false));
  }, [serverId, docTab]);

  const content = docTab === 'markdown' ? markdown : tsTypes;
  const ext = docTab === 'markdown' ? 'md' : 'ts';
  const filename = `${serverName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${ext}`;

  function handleCopy() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setDocTab('markdown')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
              docTab === 'markdown' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
            )}
          >
            <FileText className="w-3.5 h-3.5" /> API Docs
          </button>
          <button
            onClick={() => setDocTab('typescript')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors',
              docTab === 'typescript' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
            )}
          >
            <Code2 className="w-3.5 h-3.5" /> TypeScript Types
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={!content}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-40"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!content}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-zinc-500 text-center py-12">Generating...</div>
      ) : (
        <pre className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono text-zinc-300 overflow-auto max-h-[calc(100vh-280px)] whitespace-pre-wrap break-words leading-relaxed">
          {content ?? 'No content available.'}
        </pre>
      )}
    </div>
  );
}
