'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { T } from '@/lib/theme';

interface Action {
  type: string;
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  task_id?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  actions?: Action[];
}

const SUGGESTIONS = [
  "What's my most urgent task right now?",
  "What deadlines am I risking this week?",
  "What should I focus on after lunch?",
  "How am I tracking this semester?",
];

export default function AiBar() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Keyboard shortcut: ⌘K / Ctrl+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 80);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Auto-scroll to bottom as text streams in
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const pageContext = pathname?.replace('/', '') || 'home';

  const send = async (overrideMsg?: string) => {
    const text = (overrideMsg ?? msg).trim();
    if (!text || loading) return;

    setMsg('');
    setOpen(true);

    // Optimistic: push user bubble + empty assistant bubble immediately
    setChat(c => [
      ...c,
      { role: 'user', content: text },
      { role: 'assistant', content: '', streaming: true },
    ]);
    setLoading(true);

    try {
      const res = await fetch('/api/ask/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          page_context: pageContext,
          // snapshot of conversation before the two new messages above
          conversation: chat.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
        setChat(c => {
          const n = [...c];
          n[n.length - 1] = { role: 'assistant', content: errData.error || 'Something went wrong.' };
          return n;
        });
        setLoading(false);
        return;
      }

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
          const raw = line.slice(6).trim();

          try {
            const payload = JSON.parse(raw) as {
              delta?: string;
              error?: string;
              type?: string;
              finalMessage?: string;
              actions?: Action[];
            };

            if (payload.error) {
              setChat(c => {
                const n = [...c];
                n[n.length - 1] = { role: 'assistant', content: `Error: ${payload.error}` };
                return n;
              });
              break;
            }

            if (payload.delta) {
              // Append streamed token to last message
              setChat(c => {
                const n = [...c];
                const last = n[n.length - 1];
                n[n.length - 1] = { ...last, content: last.content + payload.delta! };
                return n;
              });
            }

            if (payload.type === 'done') {
              // Replace with finalMessage (cleaned of JSON wrapper) + attach actions
              setChat(c => {
                const n = [...c];
                n[n.length - 1] = {
                  role: 'assistant',
                  content: payload.finalMessage ?? n[n.length - 1].content,
                  streaming: false,
                  actions: payload.actions && payload.actions.length > 0 ? payload.actions : undefined,
                };
                return n;
              });
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch {
      setChat(c => {
        const n = [...c];
        n[n.length - 1] = { role: 'assistant', content: 'Network error — please try again.' };
        return n;
      });
    }

    setLoading(false);
  };

  const executeAction = async (action: Action, msgIndex: number) => {
    const key = `${msgIndex}-${action.type}`;
    setExecutingAction(key);
    try {
      const res = await fetch('/api/ask/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      setChat(c => [...c, {
        role: 'assistant',
        content: data.success
          ? `Done — ${action.type === 'schedule' ? `"${action.title}" added to ${action.date}` : `${action.type} completed`}.`
          : `Failed: ${data.error || 'Unknown error'}`,
      }]);
    } catch {
      setChat(c => [...c, { role: 'assistant', content: 'Failed to execute action.' }]);
    }
    setExecutingAction(null);
  };

  const isStreaming = loading && chat.length > 0 && chat[chat.length - 1].streaming;

  return (
    <div
      className="ai-bar-wrap"
      style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, zIndex: 100,
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          background: 'rgba(243,237,225,0.96)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.85)',
          borderLeft: '1px solid rgba(255,255,255,0.85)',
          borderRight: '1px solid rgba(255,255,255,0.85)',
          borderRadius: '16px 16px 0 0',
          maxHeight: '56vh', overflowY: 'auto',
          padding: '14px 14px 8px',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.1)',
        }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {/* Animated AI dot */}
              <div style={{
                width: 20, height: 20, borderRadius: 7,
                background: isStreaming
                  ? `linear-gradient(135deg, ${T.tealDk}, #a855f7, ${T.teal})`
                  : `linear-gradient(135deg,${T.tealDk},${T.teal})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 800, color: '#fff',
                boxShadow: isStreaming ? `0 0 12px ${T.tealGlow}` : `0 2px 6px ${T.tealGlow}`,
                transition: 'all 0.3s ease',
              }}>AI</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.teal, letterSpacing: '-0.2px' }}>
                Chief of Staff
              </span>
              <span style={{
                fontSize: 9, color: T.textMuted,
                background: 'rgba(0,0,0,0.06)', padding: '2px 7px', borderRadius: 5,
              }}>{pageContext}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                cursor: 'pointer', color: T.textMuted, fontSize: 14,
                width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, background: 'rgba(0,0,0,0.05)', border: 'none',
              }}
            >✕</button>
          </div>

          {/* Empty state */}
          {chat.length === 0 && (
            <div style={{
              padding: 14,
              background: 'rgba(255,255,255,0.55)',
              backdropFilter: 'blur(8px)',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.85)',
              marginBottom: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.75, marginBottom: 10 }}>
                I know your full schedule, Canvas deadlines, emails, and study load. Tell me what you need — I&apos;ll get straight to the point.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SUGGESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    style={{
                      padding: '5px 12px',
                      background: 'rgba(255,255,255,0.75)',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 20, fontSize: 11, color: T.textSoft, cursor: 'pointer',
                      fontWeight: 500, transition: 'background 0.15s',
                    }}
                  >{q}</button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {chat.map((m, i) => {
            const isLastStreaming = m.streaming && i === chat.length - 1 && loading;
            return (
              <div key={i}>
                <div style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 6,
                }}>
                  <div style={{
                    maxWidth: '84%',
                    padding: '10px 14px',
                    borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: m.role === 'user'
                      ? `linear-gradient(135deg,${T.tealDk},${T.teal})`
                      : 'rgba(255,255,255,0.78)',
                    color: m.role === 'user' ? '#fff' : T.text,
                    fontSize: 13, lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    boxShadow: m.role === 'user'
                      ? `0 3px 12px ${T.tealGlow}`
                      : '0 2px 8px rgba(0,0,0,0.06)',
                    border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.9)' : 'none',
                    minHeight: isLastStreaming && m.content === '' ? 38 : undefined,
                    display: 'flex', alignItems: isLastStreaming && m.content === '' ? 'center' : 'flex-start',
                  }}>
                    {m.content === '' && isLastStreaming ? (
                      // Thinking dots before first token arrives
                      <span className="ai-thinking">
                        <span /><span /><span />
                      </span>
                    ) : (
                      <>
                        {m.content}
                        {isLastStreaming && <span className="ai-cursor" />}
                      </>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                {m.actions && m.actions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, paddingLeft: 4 }}>
                    {m.actions.map((action, j) => {
                      const key = `${i}-${action.type}`;
                      const isExec = executingAction === key;
                      return (
                        <div key={j} style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => executeAction(action, i)}
                            disabled={isExec}
                            style={{
                              padding: '7px 14px',
                              background: T.teal + '18',
                              border: `1px solid ${T.tealBrd}`,
                              borderRadius: 10, color: T.teal, fontSize: 11, fontWeight: 600,
                              cursor: isExec ? 'wait' : 'pointer',
                              opacity: isExec ? 0.5 : 1,
                            }}
                          >{isExec ? 'Doing it…' : `Confirm: ${action.title || action.type}`}</button>
                          <button
                            onClick={() => setChat(c => [...c, { role: 'assistant', content: 'Dismissed.' }])}
                            style={{
                              padding: '7px 12px',
                              background: 'rgba(255,255,255,0.5)',
                              border: '1px solid rgba(0,0,0,0.08)',
                              borderRadius: 10, color: T.textMuted, fontSize: 11, cursor: 'pointer',
                            }}
                          >Dismiss</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div ref={chatEndRef} />
        </div>
      )}

      {/* ── Input bar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(243,237,225,0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(0,0,0,0.07)',
        padding: '8px 12px',
        display: 'flex', gap: 8,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
      }}>
        <input
          ref={inputRef}
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask your chief of staff…  ⌘K"
          disabled={loading}
          style={{
            flex: 1, padding: '11px 16px',
            background: 'rgba(255,255,255,0.65)',
            border: `1.5px solid ${msg ? T.tealBrd : 'rgba(0,0,0,0.08)'}`,
            borderRadius: 12, color: T.text, fontSize: 13, outline: 'none',
            opacity: loading ? 0.7 : 1,
            transition: 'border-color 0.2s, box-shadow 0.2s',
            boxShadow: msg ? `0 0 0 3px ${T.tealGlow}` : 'none',
          }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !msg.trim()}
          style={{
            padding: '11px 18px',
            background: msg.trim() && !loading
              ? `linear-gradient(135deg,${T.tealDk},${T.teal})`
              : 'rgba(0,0,0,0.07)',
            color: msg.trim() && !loading ? '#fff' : T.textMuted,
            border: 'none', borderRadius: 12,
            fontSize: 13, fontWeight: 600,
            cursor: msg.trim() && !loading ? 'pointer' : 'default',
            transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            transform: msg.trim() && !loading ? 'scale(1)' : 'scale(0.96)',
            boxShadow: msg.trim() && !loading ? `0 4px 14px ${T.tealGlow}` : 'none',
          }}
        >{loading ? '…' : 'Send'}</button>
      </div>
    </div>
  );
}
