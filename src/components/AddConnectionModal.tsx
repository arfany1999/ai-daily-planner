'use client';

import { useState, useEffect, useCallback } from 'react';
import { T, ACCENT_COLORS } from '@/lib/theme';

const CONN_TYPES = [
  { id: 'public', label: 'Public website', icon: '🌐', desc: 'Any webpage — no login needed', examples: 'News sites, job boards, crypto trackers, Reddit' },
  { id: 'rss', label: 'RSS / Atom feed', icon: '📡', desc: 'Blog, news, YouTube, podcast feeds', examples: 'YouTube channels, subreddits (/r/X/.rss), blogs' },
  { id: 'api_key', label: 'API with key', icon: '🔑', desc: 'Services that give you an API key', examples: 'Twitter/X, OpenWeather, CoinGecko, GitHub' },
];

interface TestResult {
  status: 'success' | 'auth_wall' | 'error';
  message: string;
  detected_type: string;
  content_preview?: string;
  suggestion?: string;
  rss_entries?: number;
}

export default function AddConnectionModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headerName, setHeaderName] = useState('Authorization');
  const [prompt, setPrompt] = useState('');
  const [color, setColor] = useState(T.blue);
  const [icon, setIcon] = useState('🌐');
  const [freq, setFreq] = useState('daily');
  const [inEmail, setInEmail] = useState(true);

  // URL verification
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'testing' | 'success' | 'auth_wall' | 'error'>('idle');
  const [verifyResult, setVerifyResult] = useState<TestResult | null>(null);

  const reset = () => {
    setStep(0); setType(''); setName(''); setUrl(''); setApiKey(''); setHeaderName('Authorization');
    setPrompt(''); setColor(T.blue); setIcon('🌐'); setFreq('daily'); setInEmail(true);
    setVerifyStatus('idle'); setVerifyResult(null);
  };

  // Auto-verify URL when it changes (debounced)
  const testUrl = useCallback(async (testType: string, testUrl: string, testKey?: string) => {
    if (!testUrl.trim() || testUrl.trim().length < 8) return;
    setVerifyStatus('testing');
    setVerifyResult(null);

    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: testUrl.trim(), type: testType, api_key: testKey, header_name: headerName }),
      });
      const data: TestResult = await res.json();
      setVerifyResult(data);
      setVerifyStatus(data.status);

      // Auto-switch type if detected differently
      if (data.detected_type === 'rss' && testType === 'public') {
        setType('rss');
      }
    } catch {
      setVerifyStatus('error');
      setVerifyResult({ status: 'error', message: 'Network error', detected_type: 'unknown' });
    }
  }, [headerName]);

  useEffect(() => {
    if (!url.trim() || url.trim().length < 8 || step !== 1) return;
    setVerifyStatus('idle');
    setVerifyResult(null);
    const timer = setTimeout(() => testUrl(type, url, apiKey), 1000);
    return () => clearTimeout(timer);
  }, [url, apiKey, type, step, testUrl]);

  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type, name, url, prompt: prompt || `Summarize the key information from ${name}.`,
          api_key: apiKey || undefined, header_name: headerName,
          color, icon, frequency: freq, in_email: inEmail,
        }),
      });
      if (res.ok) {
        reset();
        onAdded();
        onClose();
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => { reset(); onClose(); }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 16, padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {[0, 1, 2].map((s) => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? T.teal : T.bg3 }} />
          ))}
        </div>

        {/* ── Step 0: Choose type ── */}
        {step === 0 && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 4 }}>Add connection</div>
            <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 300, marginBottom: 20 }}>What type of source?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CONN_TYPES.map((ct) => (
                <div key={ct.id} onClick={() => { setType(ct.id); setStep(1); }} style={{
                  padding: '16px 18px', background: T.card, border: `1px solid ${T.border}`,
                  borderRadius: 12, cursor: 'pointer', transition: 'border-color 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 20 }}>{ct.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{ct.label}</div>
                      <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 300 }}>{ct.desc}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 300, marginLeft: 30 }}>e.g. {ct.examples}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Step 1: URL + verify ── */}
        {step === 1 && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 4 }}>Connection details</div>
            <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 300, marginBottom: 16 }}>
              {type === 'public' ? 'Enter the webpage URL. The app will verify it\'s accessible.' :
               type === 'rss' ? 'Enter the RSS or Atom feed URL.' :
               'Enter the API endpoint and your key.'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, marginBottom: 4 }}>Name</div>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Crypto Prices, Pharmacy Jobs..."
                  style={{ width: '100%', padding: '10px 14px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div>
                <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, marginBottom: 4 }}>
                  {type === 'rss' ? 'Feed URL' : 'URL'}
                </div>
                <input value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder={type === 'rss' ? 'https://example.com/feed.xml' : 'https://example.com'}
                  style={{
                    width: '100%', padding: '10px 14px', background: T.bg,
                    border: `1px solid ${verifyStatus === 'success' ? T.green + '50' : verifyStatus === 'error' || verifyStatus === 'auth_wall' ? T.red + '50' : T.border}`,
                    borderRadius: 8, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }} />
              </div>

              {/* API key fields */}
              {type === 'api_key' && (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, marginBottom: 4 }}>API key</div>
                    <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="sk-..."
                      style={{ width: '100%', padding: '10px 14px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, marginBottom: 4 }}>Header name <span style={{ fontWeight: 300 }}>(usually Authorization)</span></div>
                    <input value={headerName} onChange={(e) => setHeaderName(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </>
              )}

              {/* Verification result */}
              {verifyStatus === 'testing' && (
                <div style={{ padding: '10px 14px', background: T.yellow + '08', borderRadius: 8, border: `1px solid ${T.yellow}20`, fontSize: 11, color: T.yellow }}>
                  Testing URL...
                </div>
              )}
              {verifyResult && verifyStatus !== 'testing' && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: verifyStatus === 'success' ? T.green + '08' : verifyStatus === 'auth_wall' ? T.yellow + '08' : T.red + '08',
                  border: `1px solid ${verifyStatus === 'success' ? T.green + '20' : verifyStatus === 'auth_wall' ? T.yellow + '20' : T.red + '20'}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: verifyStatus === 'success' ? T.green : verifyStatus === 'auth_wall' ? T.yellow : T.red, marginBottom: verifyResult.suggestion || verifyResult.content_preview ? 4 : 0 }}>
                    {verifyStatus === 'success' ? '✓ ' : verifyStatus === 'auth_wall' ? '⚠ ' : '✕ '}
                    {verifyResult.message}
                  </div>
                  {verifyResult.content_preview && (
                    <div style={{ fontSize: 10, color: T.textSoft, fontWeight: 300, marginTop: 4, lineHeight: 1.5 }}>
                      {verifyResult.content_preview}
                    </div>
                  )}
                  {verifyResult.suggestion && (
                    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 300, marginTop: 4, lineHeight: 1.5, fontStyle: 'italic' }}>
                      {verifyResult.suggestion}
                    </div>
                  )}
                </div>
              )}

              {/* Icon + color */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🌐"
                  style={{ width: 44, padding: '8px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 16, outline: 'none', textAlign: 'center' }} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {ACCENT_COLORS.slice(0, 7).map((c) => (
                    <div key={c.hex} onClick={() => setColor(c.hex)} style={{
                      width: 26, height: 26, borderRadius: 7, background: c.hex + '30',
                      border: `2px solid ${color === c.hex ? c.hex : T.border}`, cursor: 'pointer',
                    }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setStep(0); setVerifyStatus('idle'); setVerifyResult(null); }} style={{
                padding: '11px 20px', background: T.bg3, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>Back</button>
              <button onClick={() => { if (name && url && (verifyStatus === 'success' || verifyStatus === 'idle')) setStep(2); }}
                disabled={!name.trim() || !url.trim() || verifyStatus === 'error'}
                style={{
                  flex: 1, padding: '11px 0',
                  background: name.trim() && url.trim() && verifyStatus !== 'error' ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : '#333',
                  color: name.trim() && url.trim() && verifyStatus !== 'error' ? '#fff' : '#666',
                  border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: name.trim() && url.trim() ? 'pointer' : 'default',
                }}>
                {verifyStatus === 'auth_wall' ? 'Continue anyway' : 'Next'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: AI prompt + frequency ── */}
        {step === 2 && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 4 }}>AI instructions</div>
            <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 300, marginBottom: 16 }}>
              Tell the AI what to do with data from <span style={{ color: T.text, fontWeight: 500 }}>{name}</span>
            </div>

            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Summarise the top 3 articles. Highlight anything about pharmacy..."
              style={{
                width: '100%', minHeight: 100, padding: 14, background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 10, color: T.text, fontSize: 12, lineHeight: 1.7, outline: 'none', resize: 'vertical',
                boxSizing: 'border-box',
              }} />

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 500, marginBottom: 4 }}>Frequency</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['daily', 'Daily'], ['3h', 'Every 3h'], ['manual', 'Manual']].map(([v, l]) => (
                    <button key={v} onClick={() => setFreq(v)} style={{
                      flex: 1, padding: '8px 0', background: freq === v ? T.teal + '20' : 'transparent',
                      border: `1px solid ${freq === v ? T.tealBrd : T.border}`, borderRadius: 6,
                      fontSize: 10, fontWeight: freq === v ? 600 : 400, color: freq === v ? T.teal : T.textMuted, cursor: 'pointer',
                    }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 11, color: T.textMuted }}>Include in email briefing</span>
              <div onClick={() => setInEmail(!inEmail)} style={{
                width: 40, height: 22, borderRadius: 11, background: inEmail ? T.teal + '40' : T.bg3,
                border: `1px solid ${inEmail ? T.teal + '60' : T.border}`, cursor: 'pointer', position: 'relative',
              }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: inEmail ? T.teal : '#555', position: 'absolute', top: 2, left: inEmail ? 21 : 3, transition: 'all 0.3s' }} />
              </div>
            </div>

            {/* Preview card */}
            <div style={{ padding: '14px 16px', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, marginTop: 14 }}>
              <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preview</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{name || 'Untitled'}</span>
              </div>
              <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 300, marginTop: 4 }}>
                {prompt ? prompt.slice(0, 80) + '...' : 'No prompt set'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setStep(1)} style={{
                padding: '11px 20px', background: T.bg3, color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>Back</button>
              <button onClick={save} disabled={saving}
                style={{
                  flex: 1, padding: '11px 0',
                  background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
                  color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1,
                }}>{saving ? 'Adding...' : 'Add connection'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
