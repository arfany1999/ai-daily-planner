/**
 * Route-level loading — rendered instantly by Next.js during client navigation.
 * Matches the home skeleton structure so the transition feels ~0ms.
 */
export default function HomeLoading() {
  return (
    <>
      <div className="dayticker">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div className="shimmer" style={{ width: 220, height: 18, borderRadius: 5 }} />
            <div className="shimmer" style={{ width: 80, height: 10, borderRadius: 4, marginTop: 8 }} />
          </div>
          <div className="shimmer" style={{ width: 62, height: 26, borderRadius: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shimmer" style={{ width: 52, height: 60, borderRadius: 12, flexShrink: 0 }} />
          ))}
        </div>
      </div>
      <div style={{ padding: '20px 16px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 22 }}>
          <div className="shimmer" style={{ width: 110, height: 10, borderRadius: 3 }} />
          <div className="shimmer" style={{ width: '70%', maxWidth: 380, height: 32, borderRadius: 6, marginTop: 10 }} />
          <div className="shimmer" style={{ width: '60%', maxWidth: 300, height: 12, borderRadius: 4, marginTop: 10 }} />
        </div>
        <div className="shimmer" style={{ width: 180, height: 10, borderRadius: 3, marginBottom: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer" style={{ height: 68, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    </>
  );
}
