'use client';
import { useState, useEffect, useRef } from 'react';
import { T } from '@/lib/theme';

interface SearchResult {
  id: string;
  task_name: string;
  urgency: string;
  start_time: string;
  date: string;
}

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const d = await r.json();
        setResults(d.results || []);
      } catch { setResults([]); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const PRIORITY_COLOR: Record<string, string> = {
    red: '#e54d4d', amber: '#d4920a', green: '#2ea84e',
    class: T.teal, gym: '#0B8043', work: '#F4511E', break: T.textMuted,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '15vh',
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 520, margin: '0 16px',
        background: 'rgba(243,237,225,0.98)', borderRadius: 20,
        boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        animation: 'springIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke={T.textMuted} strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search tasks…"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: T.text, outline: 'none' }} />
          {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 18 }}>×</button>}
        </div>
        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: results.length > 0 ? '8px 0' : 0 }}>
          {loading && <div style={{ padding: '16px', textAlign: 'center', color: T.textMuted, fontSize: 12 }}>Searching…</div>}
          {!loading && query && results.length === 0 && (
            <div style={{ padding: '24px 18px', textAlign: 'center', color: T.textMuted, fontSize: 13 }}>No tasks found for &quot;{query}&quot;</div>
          )}
          {results.map(r => {
            const color = PRIORITY_COLOR[r.urgency] || T.teal;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', cursor: 'pointer', borderBottom: `1px solid ${T.border}` }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{r.task_name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{r.date} {r.start_time && `· ${r.start_time}`}</div>
                </div>
              </div>
            );
          })}
        </div>
        {!query && (
          <div style={{ padding: '20px 18px', textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
            Type to search across all your tasks
          </div>
        )}
      </div>
    </div>
  );
}
