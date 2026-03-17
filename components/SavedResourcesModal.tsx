'use client';

import { useState, useEffect } from 'react';
import { X, Trash2, BookOpen, GraduationCap } from 'lucide-react';

export interface SavedResource {
  id: string;
  type: 'evidence' | 'education';
  content: string;
  patientName: string;
  diagnosis: string;
  savedAt: string;
}

const STORAGE_KEY = 'ed-app-saved-resources';

export function getSavedResources(): SavedResource[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function addSavedResource(resource: Omit<SavedResource, 'id' | 'savedAt'>): void {
  const resources = getSavedResources();
  resources.unshift({
    ...resource,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(resources));
}

export function removeSavedResource(id: string): void {
  const resources = getSavedResources().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(resources));
}

/** Render text with markdown links [text](url) and bare URLs as clickable <a> tags */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        const mdMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
        if (mdMatch) {
          return (
            <a key={i} href={mdMatch[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
              {mdMatch[1]}
            </a>
          );
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

interface SavedResourcesModalProps {
  onClose: () => void;
}

export function SavedResourcesModal({ onClose }: SavedResourcesModalProps) {
  const [resources, setResources] = useState<SavedResource[]>([]);
  const [filter, setFilter] = useState<'all' | 'evidence' | 'education'>('all');

  useEffect(() => {
    setResources(getSavedResources());
  }, []);

  const filtered = filter === 'all' ? resources : resources.filter(r => r.type === filter);

  const handleDelete = (id: string) => {
    removeSavedResource(id);
    setResources(getSavedResources());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col ring-1 ring-black/10 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Saved Resources</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {(['all', 'evidence', 'education'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'evidence' ? 'Evidence' : 'Learning'}
            </button>
          ))}
        </div>

        {/* Resource list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">
              No saved resources yet. Click the bookmark icon on evidence or learning resources to save them.
            </p>
          )}
          {filtered.map((resource) => (
            <div
              key={resource.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {resource.type === 'evidence' ? (
                    <BookOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <GraduationCap className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  )}
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {resource.diagnosis || 'No diagnosis'}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {resource.patientName ? `(${resource.patientName})` : ''} {new Date(resource.savedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(resource.id)}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                <Linkified text={resource.content} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
