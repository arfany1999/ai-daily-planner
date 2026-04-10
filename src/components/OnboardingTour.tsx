'use client';

import { useState, useEffect } from 'react';
import { T } from '@/lib/theme';

const TOUR_STEPS = [
  {
    title: 'Your Weekly Plan',
    desc: 'AI generates a 7-day briefing from your calendar, emails, and Canvas. Updated daily.',
    target: 'Planner card',
  },
  {
    title: "Tomorrow's To-Do",
    desc: 'Hour-by-hour schedule with smart time estimates, buffers, and carry-forward for incomplete tasks.',
    target: 'To-Do card',
  },
  {
    title: 'Ask AI Anything',
    desc: 'The bar at the bottom has live access to ALL your data. Ask questions, schedule events, get quizzed.',
    target: 'AI bar',
  },
  {
    title: 'Add Custom Sources',
    desc: 'Connect any website, RSS feed, or API. Track crypto, jobs, news — each gets its own card.',
    target: 'Add connection',
  },
];

export default function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show tour only once — check localStorage
    const seen = localStorage.getItem('onboarding_tour_seen');
    if (!seen) {
      // Delay to let the page render
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem('onboarding_tour_seen', 'true');
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  };

  if (!visible) return null;

  const current = TOUR_STEPS[step];

  return (
    <>
      {/* Backdrop */}
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 150, transition: 'opacity 0.3s',
      }} onClick={dismiss} />

      {/* Tooltip */}
      <div style={{
        position: 'fixed',
        bottom: step === 2 ? 90 : 'auto',
        top: step === 2 ? 'auto' : '50%',
        left: '50%',
        transform: step === 2 ? 'translateX(-50%)' : 'translate(-50%, -50%)',
        width: 'calc(100% - 40px)',
        maxWidth: 360,
        background: T.bg2,
        border: `1px solid ${T.tealBrd}`,
        borderRadius: 16,
        padding: '24px 22px 18px',
        zIndex: 160,
        boxShadow: `0 8px 40px ${T.teal}15`,
      }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {TOUR_STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= step ? T.teal : T.bg3,
            }} />
          ))}
        </div>

        <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.teal, marginBottom: 6 }}>
          Step {step + 1} of {TOUR_STEPS.length}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 6 }}>{current.title}</div>
        <div style={{ fontSize: 13, color: T.textSoft, lineHeight: 1.7, fontWeight: 300, marginBottom: 18 }}>{current.desc}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={dismiss} style={{
            padding: '8px 14px', background: 'transparent', border: 'none',
            color: T.textMuted, fontSize: 12, cursor: 'pointer',
          }}>Skip tour</button>
          <button onClick={next} style={{
            padding: '9px 20px',
            background: `linear-gradient(135deg,${T.tealDk},${T.teal})`,
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{step < TOUR_STEPS.length - 1 ? 'Next' : 'Got it!'}</button>
        </div>
      </div>
    </>
  );
}
