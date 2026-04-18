'use client';

import { useState, useEffect } from 'react';
import { T } from '@/lib/theme';

const TOUR_STEPS = [
  {
    icon: '📅',
    title: 'Your calendar, mirrored',
    desc: 'Every block you create here lands on Google Calendar. Classes, work shifts, and events already there show up in your schedule.',
  },
  {
    icon: '⌘',
    title: 'Tell me what to do',
    desc: "Hit ⌘K and type or speak. \"Schedule 90 min study for AT3 friday 2pm\" and it's on your calendar. Say \"I'm tired, swap today\" and I rearrange.",
  },
  {
    icon: '🎓',
    title: 'Canvas, optional',
    desc: 'Add your RMIT token in Settings and I pull every assignment, quiz, announcement, and key date. Skip if you don\'t need it.',
  },
];

const DONE_KEY = 'onboarding_done_v2';

export default function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem(DONE_KEY);
      if (!done) {
        // Defer mount so the home skeleton paints first
        const t = setTimeout(() => setOpen(true), 400);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(DONE_KEY, '1'); } catch {}
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) setStep(s => s + 1);
    else close();
  };

  if (!open) return null;

  const s = TOUR_STEPS[step];

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, animation: 'fadeIn 0.2s ease both',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="glass-hi anim-spring"
        style={{
          width: '100%', maxWidth: 380,
          padding: '28px 24px',
          borderRadius: 20,
          boxShadow: 'var(--shadow-lg), 0 0 48px var(--teal-glow)',
          textAlign: 'center',
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'var(--teal-glow)',
          border: '1px solid var(--teal-brd)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, margin: '0 auto 14px',
        }}>{s.icon}</div>

        <div className="title-display" style={{
          fontSize: 18, fontWeight: 800, color: T.text,
          letterSpacing: '-0.02em', marginBottom: 6,
        }}>{s.title}</div>

        <div style={{
          fontSize: 13, color: T.textSoft, lineHeight: 1.55, marginBottom: 20,
        }}>{s.desc}</div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
          {TOUR_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 18 : 6, height: 6, borderRadius: 3,
              background: i === step ? T.teal : 'var(--border-strong)',
              transition: 'width 0.25s var(--ease-spring)',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={close}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              background: 'transparent', border: '1px solid var(--border)',
              color: T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Skip</button>
          <button onClick={next}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 10,
              background: `linear-gradient(135deg, var(--teal-dk), var(--teal-lt))`,
              border: 'none', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 14px var(--teal-glow)',
            }}>
            {step < TOUR_STEPS.length - 1 ? 'Next' : "Let's go"}
          </button>
        </div>
      </div>
    </div>
  );
}
