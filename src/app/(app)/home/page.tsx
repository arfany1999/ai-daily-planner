'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { T, BUILTIN_CARDS } from '@/lib/theme';
import AddConnectionModal from '@/components/AddConnectionModal';
import OnboardingTour from '@/components/OnboardingTour';

export default function HomePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [conns, setConns] = useState({ google: true, gmail: true, canvas: false });
  const [health, setHealth] = useState<Record<string, { status: string }> | null>(null);
  const [ready, setReady] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    // Check if setup is complete
    Promise.all([
      fetch('/api/settings').then((r) => r.json()).catch(() => ({})),
      fetch('/api/health').then((r) => r.json()).catch(() => ({ checks: {} })),
    ]).then(([settings, healthData]) => {
      // Redirect to setup if not complete
      if (settings.setup_complete === false) {
        router.push('/setup');
        return;
      }

      setHealth(healthData.checks);
      setConns({
        google: healthData.checks?.google?.status === 'ok',
        gmail: healthData.checks?.google?.status === 'ok',
        canvas: healthData.checks?.canvas?.status === 'ok',
      });
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div style={{ padding: '40px 18px', textAlign: 'center', color: T.textMuted, fontSize: 12 }}>
        Loading...
      </div>
    );
  }

  const firstName = session?.user?.name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const isActive = (c: typeof BUILTIN_CARDS[0]) => c.requires.every((r) => conns[r as keyof typeof conns]);
  const active = BUILTIN_CARDS.filter(isActive);
  const inactive = BUILTIN_CARDS.filter((c) => !isActive(c));

  return (
    <div style={{ padding: '22px 18px' }}>
      <OnboardingTour />
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: T.textMuted, fontWeight: 300, marginBottom: 3 }}>
          {greeting}, {firstName}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>
          What&apos;s the plan?
        </div>
      </div>

      {/* Health indicator */}
      {health && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap',
        }}>
          {Object.entries(health).map(([key, val]) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 6,
              background: val.status === 'ok' ? T.green + '10' : val.status === 'error' ? T.red + '10' : T.yellow + '10',
              border: `1px solid ${val.status === 'ok' ? T.green + '20' : val.status === 'error' ? T.red + '20' : T.yellow + '20'}`,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: val.status === 'ok' ? T.green : val.status === 'error' ? T.red : T.yellow,
              }} />
              <span style={{
                fontSize: 10, fontWeight: 500,
                color: val.status === 'ok' ? T.green : val.status === 'error' ? T.red : T.yellow,
                textTransform: 'capitalize',
              }}>{key}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {/* Active built-in cards */}
        {active.map((c) => (
          <Link key={c.id} href={`/${c.id}`} style={{ textDecoration: 'none' }}>
            <div style={{
              background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
              padding: '22px 22px 18px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
              transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: c.color, background: c.color + '10', padding: '3px 9px', borderRadius: 5,
                  border: `1px solid ${c.color}18`,
                }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, color: T.text, marginBottom: 5, letterSpacing: '-0.3px' }}>{c.title}</div>
              <div style={{ fontSize: 13, color: T.textSoft, margin: '0 0 12px', lineHeight: 1.6, fontWeight: 300 }}>{c.desc}</div>
              {c.bullets.map((b) => (
                <div key={b} style={{ fontSize: 11, color: T.textMuted, display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: c.color + '50' }} />{b}
                </div>
              ))}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${c.color}30,transparent)` }} />
            </div>
          </Link>
        ))}

        {/* Add connection card */}
        <div onClick={() => setAddModalOpen(true)} style={{
          background: 'transparent', border: `2px dashed ${T.border}`, borderRadius: 14,
          padding: '22px 22px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', minHeight: 160,
          transition: 'border-color 0.2s',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', border: `2px dashed ${T.tealBrd}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: T.teal, marginBottom: 10,
          }}>+</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.teal, marginBottom: 4 }}>Add connection</div>
          <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 300, textAlign: 'center' }}>
            Connect any website, RSS feed, or API
          </div>
        </div>

        <AddConnectionModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onAdded={() => { /* refresh page data */ window.location.reload(); }}
        />

        {/* Inactive cards */}
        {inactive.map((c) => (
          <div key={c.id} style={{
            background: T.card, border: `1px dashed ${T.border}`, borderRadius: 14,
            padding: '22px 22px 18px', opacity: 0.4,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: T.textMuted, background: T.bg3, padding: '3px 9px', borderRadius: 5,
            }}>{c.label}</span>
            <div style={{ fontSize: 19, fontWeight: 700, color: T.textMuted, margin: '12px 0 5px' }}>{c.title}</div>
            <div style={{ fontSize: 13, color: T.textMuted, fontWeight: 300, marginBottom: 12 }}>{c.desc}</div>
            <Link href="/settings" style={{
              padding: '8px 16px', background: T.teal + '15', border: `1px solid ${T.tealBrd}`,
              borderRadius: 8, color: T.teal, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              textDecoration: 'none', display: 'inline-block',
            }}>Connect to enable</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
