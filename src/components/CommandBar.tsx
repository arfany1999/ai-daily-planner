'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { T, DOMAINS, Density, applyDensity, getDensity } from '@/lib/theme';

type Mode = 'idle' | 'parsing' | 'ready' | 'executing' | 'error';

interface ParsedCommand {
  intent: 'schedule' | 'reschedule' | 'search' | 'ask' | 'jump' | 'focus' | 'delete' | 'complete' | 'unknown';
  title?: string;
  date?: string;        // ISO yyyy-mm-dd
  start_time?: string;  // HH:MM 24h
  end_time?: string;
  duration_min?: number;
  domain?: string;
  query?: string;
  route?: string;
  reasoning?: string;
  confidence?: number;
  raw: string;
}

interface Suggestion {
  label: string;
  hint?: string;
  domain?: string;
  run: () => void;
}

interface JumpTarget { id: string; label: string; route: string; icon?: string; }
const JUMPS: JumpTarget[] = [
  { id: 'home', label: 'Today', route: '/home', icon: '◈' },
  { id: 'cal', label: 'Calendar', route: '/calendar', icon: '▤' },
  { id: 'tomorrow', label: 'Tomorrow', route: '/tomorrow', icon: '→' },
  { id: 'focus', label: 'Focus', route: '/focus', icon: '◉' },
  { id: 'canvas', label: 'Canvas', route: '/canvas', icon: '✦' },
  { id: 'progress', label: 'Progress', route: '/progress', icon: '▦' },
  { id: 'settings', label: 'Settings', route: '/settings', icon: '⚙' },
];

const STARTER_SUGGESTIONS = [
  'Plan my tomorrow',
  'Schedule 90 min study for AT3 on Friday 2pm',
  'Move gym to 7pm tomorrow',
  'I have 45 min — what should I do?',
  'What deadlines am I risking this week?',
  "I'm tired, swap today for light blocks",
];

interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: unknown) => void;
  onerror: (e: unknown) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}
type SRCtor = new () => SRInstance;

const sr: SRCtor | undefined = (typeof window !== 'undefined'
  ? ((window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).SpeechRecognition
    ?? (window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor }).webkitSpeechRecognition)
  : undefined);

export default function CommandBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [parsed, setParsed] = useState<ParsedCommand | null>(null);
  const [executing, setExecuting] = useState(false);
  const [diff, setDiff] = useState<{ summary: string; proposal: string; reason?: string } | null>(null);
  const [streamText, setStreamText] = useState('');
  const [recording, setRecording] = useState(false);
  const [density, setDensityState] = useState<Density>('comfortable');
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SRInstance | null>(null);
  const parseCtrlRef = useRef<AbortController | null>(null);

  // Restore density on mount
  useEffect(() => { setDensityState(getDensity()); }, []);
  useEffect(() => { applyDensity(density); }, [density]);

  // Open/close handlers
  const openBar = useCallback(() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 40); }, []);
  const closeBar = useCallback(() => { setOpen(false); setQuery(''); setParsed(null); setDiff(null); setMode('idle'); setStreamText(''); }, []);

  // Hotkeys + global events
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openBar(); return; }
      if (e.key === 'Escape' && open) { e.preventDefault(); closeBar(); return; }
      // ⌘/Ctrl + . toggles density
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        const next: Density = density === 'comfortable' ? 'cozy' : density === 'cozy' ? 'compact' : 'comfortable';
        setDensityState(next);
      }
    };
    const onOpenEvent = () => openBar();
    window.addEventListener('keydown', onKey);
    window.addEventListener('cmd-open', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('cmd-open', onOpenEvent);
    };
  }, [density, open, openBar, closeBar]);

  // Debounced parse
  useEffect(() => {
    if (!query.trim() || query.trim().length < 3) { setParsed(null); setMode('idle'); return; }
    const t = setTimeout(() => runParse(query), 280);
    return () => clearTimeout(t);
  }, [query]);

  const runParse = async (q: string) => {
    parseCtrlRef.current?.abort();
    const ctrl = new AbortController();
    parseCtrlRef.current = ctrl;
    setMode('parsing');
    try {
      const res = await fetch('/api/command/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: q, page: pathname }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('parse-failed');
      const d = await res.json() as ParsedCommand;
      setParsed({ ...d, raw: q });
      setMode('ready');
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      setMode('error');
    }
  };

  // Voice input
  const toggleVoice = () => {
    if (!sr) { alert('Voice not supported in this browser. Try Chrome.'); return; }
    if (recording) { recRef.current?.stop(); return; }
    const R = new sr();
    R.lang = 'en-AU';
    R.continuous = false;
    R.interimResults = true;
    R.onresult = (e: unknown) => {
      const results = (e as { results: { [k: number]: { [k: number]: { transcript: string } } }; resultIndex: number }).results;
      let text = '';
      for (let i = 0; i < (Object.keys(results).length || 0); i++) text += results[i][0].transcript;
      setQuery(text);
    };
    R.onerror = () => setRecording(false);
    R.onend = () => setRecording(false);
    recRef.current = R;
    setRecording(true);
    R.start();
  };

  // Execute via agentic loop
  const execute = async () => {
    if (!parsed) return;
    if (parsed.intent === 'jump' && parsed.route) { router.push(parsed.route); closeBar(); return; }
    if (parsed.intent === 'reschedule') { proposeReschedule(parsed); return; }

    // Route everything else (schedule/delete/complete/ask/search) through the agent
    setExecuting(true);
    setMode('executing');
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: parsed.raw, source: 'commandbar' }),
      });
      const d = await res.json() as { text?: string; actions?: { tool: string; input: Record<string, unknown>; result: { ok: boolean; action?: string; error?: string } }[]; error?: string };
      if (d.error) {
        setStreamText(`Error: ${d.error}`);
        setMode('error');
      } else {
        const actionsText = (d.actions || [])
          .filter(a => a.result?.ok && a.result.action)
          .map(a => `✓ ${a.result.action}`)
          .join('\n');
        setStreamText([d.text || '', actionsText].filter(Boolean).join('\n\n'));
        setMode('ready');
        if (d.actions && d.actions.length > 0) {
          window.dispatchEvent(new CustomEvent('cmd-data-changed'));
        }
      }
    } catch (e) {
      setStreamText(`Network error: ${e instanceof Error ? e.message : 'unknown'}`);
      setMode('error');
    }
    setExecuting(false);
  };

  const proposeReschedule = async (p: ParsedCommand) => {
    setExecuting(true);
    try {
      const res = await fetch('/api/agent/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const d = await res.json() as { summary: string; proposal: string; reason?: string };
      setDiff(d);
    } catch {
      setMode('error');
    }
    setExecuting(false);
  };

  const applyReschedule = async () => {
    if (!parsed) return;
    setExecuting(true);
    try {
      await fetch('/api/agent/reschedule/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      closeBar();
      window.dispatchEvent(new CustomEvent('cmd-data-changed'));
    } catch { setMode('error'); }
    setExecuting(false);
  };

  const askInline = async (text: string) => {
    setStreamText('');
    setMode('executing');
    try {
      const res = await fetch('/api/ask/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, page_context: pathname?.replace('/', '') || 'home', conversation: [] }),
      });
      if (!res.ok || !res.body) { setMode('error'); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const p = JSON.parse(line.slice(6).trim()) as { delta?: string; finalMessage?: string; type?: string };
            if (p.delta) setStreamText(s => s + p.delta);
            if (p.type === 'done' && p.finalMessage) setStreamText(p.finalMessage);
          } catch {}
        }
      }
      setMode('ready');
    } catch {
      setMode('error');
    }
  };

  // Suggestions (jumps + starters + history)
  const suggestions: Suggestion[] = (() => {
    const q = query.trim().toLowerCase();
    const out: Suggestion[] = [];
    if (!q) {
      for (const s of STARTER_SUGGESTIONS) {
        out.push({ label: s, hint: 'Press Enter', run: () => setQuery(s) });
      }
      return out;
    }
    for (const j of JUMPS) {
      if (j.label.toLowerCase().includes(q) || j.id.includes(q)) {
        out.push({ label: `Jump to ${j.label}`, hint: j.route, run: () => { router.push(j.route); closeBar(); } });
      }
    }
    return out;
  })();

  // No FAB — BottomNav (mobile) and Sidebar (desktop) both provide an entry point.
  if (!open) return null;

  const domainChip = parsed?.domain ? DOMAINS.find(d => d.id === parsed.domain) : null;

  return (
    <div
      onClick={closeBar}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
        animation: 'fadeIn 0.18s ease both',
      }}
    >
      <div
        className="glass-hi anim-spring"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 620, margin: '0 16px',
          borderRadius: 18,
          boxShadow: 'var(--shadow-lg), 0 0 48px var(--teal-glow)',
          overflow: 'hidden',
        }}
      >
        {/* Input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke={mode === 'parsing' ? T.teal : T.textMuted} strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke={mode === 'parsing' ? T.teal : T.textMuted} strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); if (parsed) execute(); else askInline(query); }
            }}
            placeholder="Ask, schedule, or jump…  e.g. ‘study AT3 friday 2pm for 90 min’"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 16, color: T.text, fontWeight: 500, letterSpacing: '-0.01em',
            }}
          />
          <button
            onClick={toggleVoice}
            title={recording ? 'Stop recording' : 'Voice (Web Speech)'}
            style={{
              width: 30, height: 30, borderRadius: 9,
              background: recording ? 'var(--red)' : 'var(--surface)',
              border: '1px solid ' + (recording ? 'var(--red)' : 'var(--border)'),
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: recording ? 'pulse-dot 1s ease-in-out infinite' : 'none',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="12" rx="3" stroke={recording ? '#fff' : T.textSoft} strokeWidth="1.8"/>
              <path d="M5 11a7 7 0 0014 0M12 18v3" stroke={recording ? '#fff' : T.textSoft} strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
          <span className="mono" style={{ fontSize: 10, color: T.textFaint, background: 'var(--surface)', padding: '3px 6px', borderRadius: 5 }}>Esc</span>
        </div>

        {/* Parsed preview */}
        {parsed && mode === 'ready' && !diff && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: T.teal,
                padding: '3px 8px', background: 'var(--teal-glow)', border: '1px solid var(--teal-brd)', borderRadius: 5,
              }}>{parsed.intent}</span>
              {domainChip && (
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  padding: '3px 8px', borderRadius: 5,
                  background: domainChip.color + '20', color: domainChip.color,
                  border: `1px solid ${domainChip.color}40`,
                }}>{domainChip.icon} {domainChip.label}</span>
              )}
              {parsed.confidence !== undefined && (
                <span className="mono" style={{ fontSize: 9, color: T.textFaint, marginLeft: 'auto' }}>
                  conf {Math.round(parsed.confidence * 100)}%
                </span>
              )}
            </div>
            {parsed.title && (
              <div className="title-display" style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>{parsed.title}</div>
            )}
            <div className="mono" style={{ fontSize: 11, color: T.textSoft }}>
              {parsed.date && <span style={{ marginRight: 10 }}>📅 {parsed.date}</span>}
              {parsed.start_time && <span style={{ marginRight: 10 }}>⏱ {parsed.start_time}{parsed.end_time && `–${parsed.end_time}`}</span>}
              {parsed.duration_min && <span>{parsed.duration_min} min</span>}
            </div>
            {parsed.reasoning && (
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6, fontStyle: 'italic' }}>{parsed.reasoning}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={execute}
                disabled={executing}
                style={{
                  padding: '8px 16px',
                  background: `linear-gradient(135deg, var(--teal-dk), var(--teal-lt))`,
                  color: '#fff', border: 'none', borderRadius: 9,
                  fontSize: 12, fontWeight: 700, cursor: executing ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px var(--teal-glow)',
                  letterSpacing: '0.02em',
                }}
              >{executing ? 'Working…' : parsed.intent === 'reschedule' ? 'Propose diff' : 'Confirm ↵'}</button>
              <button onClick={() => { setParsed(null); setQuery(''); }}
                style={{ padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, color: T.textSoft, fontSize: 12, cursor: 'pointer' }}
              >Edit</button>
            </div>
          </div>
        )}

        {/* Reschedule diff */}
        {diff && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMuted, marginBottom: 8 }}>Proposed change</div>
            <div className="title-display" style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>{diff.summary}</div>
            <pre style={{ fontSize: 11.5, color: T.textSoft, background: 'var(--surface)', padding: 10, borderRadius: 8, border: '1px solid var(--border)', whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{diff.proposal}</pre>
            {diff.reason && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>{diff.reason}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={applyReschedule} disabled={executing}
                style={{ padding: '8px 16px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >Approve</button>
              <button onClick={() => setDiff(null)}
                style={{ padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, color: T.textSoft, fontSize: 12, cursor: 'pointer' }}
              >Undo</button>
            </div>
          </div>
        )}

        {/* Streaming answer */}
        {streamText && mode === 'executing' && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', maxHeight: 260, overflowY: 'auto' }}>
            <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.6 }}>
              {streamText}<span className="ai-cursor" />
            </div>
          </div>
        )}

        {/* Suggestions */}
        {!parsed && !diff && !streamText && (
          <div style={{ padding: '8px 8px 12px', maxHeight: '46vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textFaint, padding: '8px 10px 4px' }}>
              {query ? 'Actions' : 'Try'}
            </div>
            {suggestions.map((s, i) => (
              <button key={i} onClick={s.run}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '9px 12px', borderRadius: 9, border: 'none',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 18, height: 18, borderRadius: 5, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.teal, fontSize: 10, fontWeight: 700 }}>›</div>
                <span style={{ fontSize: 12.5, color: T.textSoft, flex: 1 }}>{s.label}</span>
                {s.hint && <span className="mono" style={{ fontSize: 10, color: T.textFaint }}>{s.hint}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '9px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--glass)',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 9.5, color: T.textFaint }}>
              <span style={{ color: T.textMuted }}>↵</span> run · <span style={{ color: T.textMuted }}>⌘.</span> density ({density})
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['comfortable','cozy','compact'] as Density[]).map(d => (
              <button key={d} onClick={() => setDensityState(d)}
                style={{
                  padding: '3px 8px', borderRadius: 5,
                  background: density === d ? 'var(--teal-glow)' : 'transparent',
                  border: '1px solid ' + (density === d ? 'var(--teal-brd)' : 'var(--border)'),
                  color: density === d ? T.teal : T.textMuted,
                  fontSize: 9, fontWeight: 600, cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >{d}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
