export default function CalendarLoading() {
  return (
    <>
      <div className="dayticker">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div className="shimmer" style={{ width: 200, height: 18, borderRadius: 5 }} />
            <div className="shimmer" style={{ width: 70, height: 10, borderRadius: 4, marginTop: 8 }} />
          </div>
          <div className="shimmer" style={{ width: 62, height: 26, borderRadius: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shimmer" style={{ width: 52, height: 60, borderRadius: 12, flexShrink: 0 }} />
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shimmer" style={{ width: 80, height: 22, borderRadius: 6 }} />
        ))}
      </div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <div className="shimmer" style={{ width: 220, height: 22, borderRadius: 6, flex: 1 }} />
        <div className="shimmer" style={{ width: 120, height: 26, borderRadius: 8 }} />
      </div>
      <div style={{ padding: 20 }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <div className="shimmer" style={{ width: 50, height: 18, borderRadius: 4 }} />
            <div className="shimmer" style={{ flex: 1, height: 30, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </>
  );
}
