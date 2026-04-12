'use client';
import { useEffect } from 'react';
import Nav from '@/components/Nav';
import BottomNav from '@/components/BottomNav';
import AiBar from '@/components/AiBar';
import Sidebar from '@/components/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Restore dark mode preference
  useEffect(() => {
    try {
      if (localStorage.getItem('ai-planner-dark') === '1') document.body.classList.add('dark');
    } catch {}
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f3ede1', display: 'flex' }}>
      {/* Desktop sidebar — hidden on mobile via CSS */}
      <Sidebar />

      {/* Main area */}
      <div className="app-main-inner">
        {/* Top nav — hidden on desktop via CSS */}
        <div className="top-nav-mobile-only">
          <Nav />
        </div>

        <main className="app-main-content" style={{ paddingBottom: 120 }}>
          {children}
        </main>

        <AiBar />

        {/* Bottom nav — hidden on desktop via CSS */}
        <div className="bottom-nav-wrapper">
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
