import Nav from '@/components/Nav';
import BottomNav from '@/components/BottomNav';
import AiBar from '@/components/AiBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#060608' }}>
      <Nav />
      <main style={{ paddingBottom: 110 }}>
        {children}
      </main>
      <AiBar />
      <BottomNav />
    </div>
  );
}
