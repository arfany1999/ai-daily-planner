'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/PageHeader';
import { T, DEMO_MATERIALS } from '@/lib/theme';

interface MCQ { question: string; options: string[]; correct_answer: number; explanation?: string }
interface Flashcard { term: string; definition: string }
interface MaterialContent {
  key_concepts?: string[];
  detailed_notes?: string[];
  pharmacy_connections?: string[];
  mcqs?: MCQ[];
  flashcards?: Flashcard[];
  exam_traps?: string[];
}
interface Material { id: number; source_file: string; content: MaterialContent; created_at: string }
interface Week { week: number; materials: Material[] }
interface CourseGroup { course: string; weeks: Week[] }

export default function MaterialsPage() {
  const [data, setData] = useState<CourseGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');
  const [courseTab, setCourseTab] = useState(0);
  const [weekTab, setWeekTab] = useState(0);
  const [mcqAns, setMcqAns] = useState<Record<string, number>>({});
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [section, setSection] = useState<'notes' | 'mcqs' | 'cards' | 'traps'>('notes');

  // For demo fallback
  const [demoTab, setDemoTab] = useState(0);
  const [demoMcqAns, setDemoMcqAns] = useState<Record<string, number>>({});
  const [demoFlipped, setDemoFlipped] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/materials')
      .then((r) => r.json())
      .then((d) => {
        if (d.materials?.length > 0) setData(d.materials);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenResult('');
    try {
      const r = await fetch('/api/materials/generate', { method: 'POST' });
      const d = await r.json();
      setGenResult(d.message || d.error || 'Done');
      // Refresh materials list
      const mr = await fetch('/api/materials');
      const md = await mr.json();
      if (md.materials?.length > 0) setData(md.materials);
    } catch {
      setGenResult('Failed to generate materials');
    }
    setGenerating(false);
  };

  const flipCard = (key: string) => {
    const n = new Set(flipped);
    if (n.has(key)) n.delete(key); else n.add(key);
    setFlipped(n);
  };

  // Render real materials
  if (data && data.length > 0) {
    const course = data[courseTab] || data[0];
    const week = course.weeks[weekTab] || course.weeks[0];
    // Merge all materials for this week
    const merged: MaterialContent = { key_concepts: [], detailed_notes: [], pharmacy_connections: [], mcqs: [], flashcards: [], exam_traps: [] };
    for (const m of week?.materials || []) {
      const c = m.content;
      if (c.key_concepts) merged.key_concepts!.push(...c.key_concepts);
      if (c.detailed_notes) merged.detailed_notes!.push(...c.detailed_notes);
      if (c.pharmacy_connections) merged.pharmacy_connections!.push(...c.pharmacy_connections);
      if (c.mcqs) merged.mcqs!.push(...c.mcqs);
      if (c.flashcards) merged.flashcards!.push(...c.flashcards);
      if (c.exam_traps) merged.exam_traps!.push(...c.exam_traps);
    }

    return (
      <div style={{ padding: '0 18px' }}>
        <PageHeader title="Study Materials" subtitle="AI-generated from Canvas" />

        {/* Generate + Export buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={handleGenerate} disabled={generating} style={{
            padding: '8px 16px', background: T.tealGlow, border: `1px solid ${T.tealBrd}`,
            borderRadius: 8, color: T.teal, fontSize: 11, fontWeight: 600, cursor: generating ? 'wait' : 'pointer',
            opacity: generating ? 0.5 : 1,
          }}>
            {generating ? 'Generating...' : 'Process New Files'}
          </button>
          <a href={`/api/materials/export?format=zip`} style={{
            padding: '8px 16px', background: T.glass, border: `1px solid ${T.glassBrd}`,
            borderRadius: 8, color: T.textSoft, fontSize: 11, fontWeight: 500, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center',
          }}>Export ZIP</a>
        </div>
        {genResult && (
          <div style={{ marginBottom: 10, fontSize: 11, color: T.teal, background: T.tealGlow, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.tealBrd}` }}>
            {genResult}
          </div>
        )}

        {/* Course tabs */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          {data.map((c, i) => (
            <button key={i} onClick={() => { setCourseTab(i); setWeekTab(0); setMcqAns({}); setFlipped(new Set()); }}
              style={{
                padding: '7px 14px',
                background: courseTab === i ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : T.card,
                color: courseTab === i ? '#fff' : T.textMuted,
                border: `1px solid ${courseTab === i ? T.teal : T.border}`,
                borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>{c.course.length > 20 ? c.course.slice(0, 20) + '...' : c.course}</button>
          ))}
        </div>

        {/* Week tabs */}
        {course.weeks.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            {course.weeks.map((w, i) => (
              <button key={i} onClick={() => { setWeekTab(i); setMcqAns({}); setFlipped(new Set()); }}
                style={{
                  padding: '5px 12px',
                  background: weekTab === i ? T.teal + '20' : 'transparent',
                  border: `1px solid ${weekTab === i ? T.tealBrd : T.border}`,
                  borderRadius: 6, fontSize: 10, color: weekTab === i ? T.teal : T.textMuted,
                  cursor: 'pointer', fontWeight: weekTab === i ? 600 : 400,
                }}>Wk {w.week || '?'}</button>
            ))}
          </div>
        )}

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
          {([['notes', 'Notes', T.green], ['mcqs', 'MCQs', T.orange], ['cards', 'Cards', T.blue], ['traps', 'Traps', T.red]] as const).map(([id, label, color]) => (
            <button key={id} onClick={() => setSection(id)} style={{
              flex: 1, padding: '8px 0',
              background: section === id ? color + '15' : 'transparent',
              border: `1px solid ${section === id ? color + '30' : T.border}`,
              borderRadius: 7, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              color: section === id ? color : T.textMuted,
            }}>{label} ({
              id === 'notes' ? (merged.key_concepts?.length || 0) + (merged.detailed_notes?.length || 0) :
              id === 'mcqs' ? merged.mcqs?.length || 0 :
              id === 'cards' ? merged.flashcards?.length || 0 :
              merged.exam_traps?.length || 0
            })</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          {section === 'notes' && (
            <>
              {merged.key_concepts && merged.key_concepts.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.green, marginBottom: 8 }}>Key Concepts</div>
                  {merged.key_concepts.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: T.text, lineHeight: 1.8, fontWeight: 300, marginBottom: 4, display: 'flex', gap: 6 }}>
                      <span style={{ color: T.green }}>{'\u2022'}</span> {c}
                    </div>
                  ))}
                </>
              )}
              {merged.detailed_notes && merged.detailed_notes.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.teal, marginTop: 16, marginBottom: 8 }}>Detailed Notes</div>
                  {merged.detailed_notes.map((n, i) => (
                    <div key={i} style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.8, fontWeight: 300, marginBottom: 6 }}>{n}</div>
                  ))}
                </>
              )}
              {merged.pharmacy_connections && merged.pharmacy_connections.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.purple, marginTop: 16, marginBottom: 8 }}>Pharmacy Connections</div>
                  {merged.pharmacy_connections.map((p, i) => (
                    <div key={i} style={{ padding: '7px 12px', background: T.tealGlow, borderLeft: `3px solid ${T.teal}`, borderRadius: '0 8px 8px 0', fontSize: 11, color: T.teal, marginBottom: 4 }}>{p}</div>
                  ))}
                </>
              )}
            </>
          )}

          {section === 'mcqs' && merged.mcqs?.map((q, j) => {
            const key = `${courseTab}-${weekTab}-${j}`;
            const answered = mcqAns[key] !== undefined;
            return (
              <div key={j} style={{ marginBottom: 14, padding: '12px 14px', background: T.bg3, borderRadius: 8, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>{j + 1}. {q.question}</div>
                {q.options.map((opt, k) => {
                  const selected = mcqAns[key] === k;
                  const correct = q.correct_answer === k;
                  return (
                    <div key={k} onClick={() => { if (!answered) setMcqAns({ ...mcqAns, [key]: k }); }}
                      style={{
                        padding: '8px 12px', borderRadius: 6, fontSize: 11, cursor: answered ? 'default' : 'pointer', marginBottom: 3,
                        background: answered ? (correct ? T.green + '15' : selected ? T.red + '15' : 'transparent') : T.bg,
                        border: `1px solid ${answered ? (correct ? T.green + '30' : selected ? T.red + '30' : T.border) : T.border}`,
                        color: T.text,
                      }}>
                      {String.fromCharCode(65 + k)}. {opt}
                      {answered && correct && <span style={{ marginLeft: 8, color: T.green, fontSize: 10 }}>{'\u2713'}</span>}
                    </div>
                  );
                })}
                {answered && q.explanation && (
                  <div style={{ marginTop: 8, fontSize: 11, color: T.textSoft, fontStyle: 'italic', lineHeight: 1.6 }}>{q.explanation}</div>
                )}
              </div>
            );
          })}

          {section === 'cards' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {merged.flashcards?.map((c, j) => {
                const key = `${courseTab}-${weekTab}-${j}`;
                const isFlipped = flipped.has(key);
                return (
                  <div key={j} onClick={() => flipCard(key)} style={{
                    flex: '1 1 140px', minHeight: 80, padding: 14, borderRadius: 10, cursor: 'pointer',
                    background: isFlipped ? T.tealGlow : T.bg3,
                    border: `1px solid ${isFlipped ? T.tealBrd : T.border}`,
                    transition: 'all 0.3s',
                  }}>
                    <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, fontWeight: 500 }}>{isFlipped ? 'Definition' : 'Term'}</div>
                    <div style={{ fontSize: 12, color: T.text, fontWeight: isFlipped ? 300 : 600, lineHeight: 1.6 }}>{isFlipped ? c.definition : c.term}</div>
                  </div>
                );
              })}
            </div>
          )}

          {section === 'traps' && merged.exam_traps?.map((trap, i) => (
            <div key={i} style={{
              padding: '8px 14px', background: T.orange + '08', borderLeft: `3px solid ${T.orange}`,
              borderRadius: '0 8px 8px 0', fontSize: 12, color: T.orange, marginBottom: 6, lineHeight: 1.6,
            }}>{trap}</div>
          ))}

          {/* Empty states */}
          {section === 'notes' && !merged.key_concepts?.length && !merged.detailed_notes?.length && (
            <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 12 }}>No notes yet.</div>
          )}
          {section === 'mcqs' && !merged.mcqs?.length && (
            <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 12 }}>No MCQs yet.</div>
          )}
          {section === 'cards' && !merged.flashcards?.length && (
            <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 12 }}>No flashcards yet.</div>
          )}
          {section === 'traps' && !merged.exam_traps?.length && (
            <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 12 }}>No exam traps yet.</div>
          )}
        </div>

        {/* Source files */}
        {week?.materials?.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 10, color: T.textMuted, fontWeight: 300 }}>
            Sources: {week.materials.map((m) => m.source_file).join(', ')}
          </div>
        )}
      </div>
    );
  }

  // Demo fallback
  const dm = DEMO_MATERIALS[demoTab];
  const dw = dm.weeks[0];

  return (
    <div style={{ padding: '0 18px' }}>
      <PageHeader title="Study Materials" subtitle="AI-generated" />

      {loading && <div style={{ textAlign: 'center', padding: 20, color: T.textMuted, fontSize: 12 }}>Loading...</div>}

      {!loading && (
        <button onClick={handleGenerate} disabled={generating} style={{
          width: '100%', padding: '10px 0', marginBottom: 12,
          background: T.tealGlow, border: `1px solid ${T.tealBrd}`, borderRadius: 10,
          color: T.teal, fontSize: 12, fontWeight: 600, cursor: generating ? 'wait' : 'pointer',
        }}>
          {generating ? 'Processing Canvas files...' : 'Generate from Canvas'}
        </button>
      )}
      {genResult && (
        <div style={{ marginBottom: 10, fontSize: 11, color: T.teal, background: T.tealGlow, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.tealBrd}` }}>
          {genResult}
        </div>
      )}

      <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
        {DEMO_MATERIALS.map((c, i) => (
          <button key={i} onClick={() => { setDemoTab(i); setDemoMcqAns({}); setDemoFlipped(new Set()); }}
            style={{
              padding: '7px 14px',
              background: demoTab === i ? `linear-gradient(135deg,${T.tealDk},${T.teal})` : T.card,
              color: demoTab === i ? '#fff' : T.textMuted,
              border: `1px solid ${demoTab === i ? T.teal : T.border}`,
              borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>{c.code}</button>
        ))}
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: T.green }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Week {dw.n}: {dw.title}</span>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.green, marginBottom: 6 }}>Notes</div>
          <div style={{ fontSize: 12, color: T.text, lineHeight: 1.8, marginBottom: 18, fontWeight: 300 }}>{dw.notes}</div>

          <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.orange, marginBottom: 8 }}>MCQs</div>
          {dw.mcqs.map((q, j) => {
            const answered = demoMcqAns[j.toString()] !== undefined;
            return (
              <div key={j} style={{ marginBottom: 12, padding: '12px 14px', background: T.bg3, borderRadius: 8, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>{j + 1}. {q.q}</div>
                {q.o.map((opt, k) => {
                  const selected = demoMcqAns[j.toString()] === k;
                  const correct = q.a === k;
                  return (
                    <div key={k} onClick={() => { if (!answered) setDemoMcqAns({ ...demoMcqAns, [j.toString()]: k }); }}
                      style={{
                        padding: '8px 12px', borderRadius: 6, fontSize: 11, cursor: answered ? 'default' : 'pointer', marginBottom: 3,
                        background: answered ? (correct ? T.green + '15' : selected ? T.red + '15' : 'transparent') : T.bg,
                        border: `1px solid ${answered ? (correct ? T.green + '30' : selected ? T.red + '30' : T.border) : T.border}`,
                        color: T.text,
                      }}>
                      {String.fromCharCode(65 + k)}. {opt}
                      {answered && correct && <span style={{ marginLeft: 8, color: T.green, fontSize: 10 }}>{'\u2713'}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.blue, marginBottom: 8, marginTop: 16 }}>Flashcards</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {dw.cards.map((c, j) => {
              const key = `${demoTab}-${j}`;
              const isFlipped = demoFlipped.has(key);
              return (
                <div key={j} onClick={() => { const n = new Set(demoFlipped); if (n.has(key)) n.delete(key); else n.add(key); setDemoFlipped(n); }}
                  style={{
                    flex: '1 1 140px', minHeight: 80, padding: 14, borderRadius: 10, cursor: 'pointer',
                    background: isFlipped ? T.tealGlow : T.bg3,
                    border: `1px solid ${isFlipped ? T.tealBrd : T.border}`, transition: 'all 0.3s',
                  }}>
                  <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4, fontWeight: 500 }}>{isFlipped ? 'Definition' : 'Term'}</div>
                  <div style={{ fontSize: 12, color: T.text, fontWeight: isFlipped ? 300 : 600, lineHeight: 1.6 }}>{isFlipped ? c.d : c.t}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '12px 16px', background: T.glass, borderRadius: 10, border: `1px solid ${T.glassBrd}`, fontSize: 11, color: T.textMuted, fontWeight: 300 }}>
        Demo data shown. Connect Canvas and click &quot;Generate from Canvas&quot; for real materials.
      </div>
    </div>
  );
}
