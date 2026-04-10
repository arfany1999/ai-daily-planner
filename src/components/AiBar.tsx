'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { T } from '@/lib/theme';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: Action[];
}

interface Action {
  type: string;
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  task_id?: string;
}

export default function AiBar() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const pageContext = pathname?.replace('/', '') || 'home';

  const send = async () => {
    const text = msg.trim();
    if (!text || loading) return;

    setMsg('');
    setChat((c) => [...c, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          page_context: pageContext,
          conversation: chat.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setChat((c) => [...c, {
          role: 'assistant',
          content: data.message || 'No response.',
          actions: data.actions?.length > 0 ? data.actions : undefined,
        }]);
      } else {
        setChat((c) => [...c, {
          role: 'assistant',
          content: data.error === 'Rate limit exceeded. Maximum 30 messages per hour. Try again later.'
            ? data.error
            : `Error: ${data.message || data.error || 'Something went wrong.'}`,
        }]);
      }
    } catch {
      setChat((c) => [...c, { role: 'assistant', content: 'Network error. Please try again.' }]);
    }

    setLoading(false);
  };

  const executeAction = async (action: Action, index: number) => {
    const key = `${index}-${action.type}`;
    setExecutingAction(key);

    try {
      const res = await fetch('/api/ask/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (data.success) {
        setChat((c) => [...c, { role: 'assistant', content: `Done! ${action.type === 'schedule' ? `Created "${action.title}" on ${action.date}` : `Action "${action.type}" completed.`}` }]);
      } else {
        setChat((c) => [...c, { role: 'assistant', content: `Failed: ${data.error || 'Unknown error'}` }]);
      }
    } catch {
      setChat((c) => [...c, { role: 'assistant', content: 'Failed to execute action.' }]);
    }

    setExecutingAction(null);
  };

  const suggestions = ['When is my next deadline?', 'What should I study today?', 'Quiz me on BIOL2368', 'Schedule a study session'];

  return (
    <div style={{ position: 'fixed', bottom: 38, left: 0, right: 0, zIndex: 100 }}>
      {open && (
        <div style={{ background: T.bg2, borderTop: `1px solid ${T.tealBrd}`, maxHeight: '55vh', overflowY: 'auto', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 16, height: 16, borderRadius: 5,
                background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, fontWeight: 700, color: '#fff',
              }}>AI</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.teal }}>Ask AI</span>
              <span style={{ fontSize: 9, color: T.textMuted, background: T.bg3, padding: '2px 6px', borderRadius: 4 }}>{pageContext}</span>
            </div>
            <span onClick={() => setOpen(false)} style={{ cursor: 'pointer', color: T.textMuted, fontSize: 14 }}>✕</span>
          </div>

          {chat.length === 0 && (
            <div style={{ padding: 14, background: T.glass, borderRadius: 10, border: `1px solid ${T.glassBrd}`, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.7, fontWeight: 300, marginBottom: 10 }}>
                I have live access to your calendar, emails, Canvas, study materials, and all connections. Ask me anything.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {suggestions.map((q) => (
                  <button key={q} onClick={() => { setMsg(q); setTimeout(send, 50); }}
                    style={{
                      padding: '5px 12px', background: T.bg, border: `1px solid ${T.border}`,
                      borderRadius: 18, fontSize: 10, color: T.textSoft, cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {chat.map((m, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                <div style={{
                  maxWidth: '85%', padding: '9px 14px',
                  borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                  background: m.role === 'user' ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : T.bg3,
                  color: m.role === 'user' ? '#fff' : T.text, fontSize: 12, lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>{m.content}</div>
              </div>

              {/* Action buttons */}
              {m.actions && m.actions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, paddingLeft: 4 }}>
                  {m.actions.map((action, j) => {
                    const key = `${i}-${action.type}`;
                    const isExecuting = executingAction === key;
                    return (
                      <div key={j} style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => executeAction(action, i)}
                          disabled={isExecuting}
                          style={{
                            padding: '6px 12px', background: T.teal + '15', border: `1px solid ${T.tealBrd}`,
                            borderRadius: 8, color: T.teal, fontSize: 10, fontWeight: 600, cursor: isExecuting ? 'wait' : 'pointer',
                            opacity: isExecuting ? 0.5 : 1,
                          }}
                        >
                          {isExecuting ? 'Executing...' : `Confirm: ${action.title || action.type}`}
                        </button>
                        <button
                          onClick={() => setChat((c) => [...c, { role: 'assistant', content: 'Action dismissed.' }])}
                          style={{
                            padding: '6px 10px', background: 'transparent', border: `1px solid ${T.border}`,
                            borderRadius: 8, color: T.textMuted, fontSize: 10, cursor: 'pointer',
                          }}
                        >Dismiss</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 6 }}>
              <div style={{
                padding: '9px 14px', borderRadius: '12px 12px 12px 3px',
                background: T.bg3, color: T.textMuted, fontSize: 12,
              }}>Thinking...</div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      )}

      <div style={{ background: T.bg2, borderTop: `1px solid ${T.border}`, padding: '7px 10px', display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask AI anything...  ⌘K"
          disabled={loading}
          style={{
            flex: 1, padding: '10px 14px', background: T.bg,
            border: `1px solid ${T.tealBrd}`, borderRadius: 10,
            color: T.text, fontSize: 12, outline: 'none',
            opacity: loading ? 0.6 : 1,
          }}
        />
        <button onClick={send} disabled={loading || !msg.trim()} style={{
          padding: '10px 16px',
          background: msg.trim() && !loading ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : '#333',
          color: msg.trim() && !loading ? '#fff' : '#666',
          border: 'none', borderRadius: 10,
          fontSize: 12, fontWeight: 600, cursor: msg.trim() && !loading ? 'pointer' : 'default',
        }}>Send</button>
      </div>
    </div>
  );
}
