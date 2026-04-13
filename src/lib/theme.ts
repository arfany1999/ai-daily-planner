export const T = {
  bg: 'var(--bg)',
  bg2: 'var(--bg2)',
  bg3: 'var(--bg3)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  textSoft: 'var(--text-soft)',
  textMuted: 'var(--text-muted)',
  teal: 'var(--teal)',
  tealDk: 'var(--teal-dk)',
  tealGlow: 'var(--teal-glow)',
  tealBrd: 'var(--teal-brd)',
  orange: 'var(--orange)',
  green: 'var(--green)',
  blue: 'var(--blue)',
  red: 'var(--red)',
  purple: 'var(--purple)',
  yellow: 'var(--yellow)',
  glass: 'var(--glass)',
  glassBrd: 'var(--glass-brd)',
};

export const urgencyColors: Record<string, string> = {
  red: T.red,
  amber: T.orange,
  green: T.green,
  class: T.teal,
  gym: T.purple,
  work: '#3a3a40',
  break: '#2a2a30',
  ai: T.yellow,
};

export const ACCENT_COLORS = [
  { name: 'Teal', hex: T.teal },
  { name: 'Orange', hex: T.orange },
  { name: 'Green', hex: T.green },
  { name: 'Blue', hex: T.blue },
  { name: 'Purple', hex: T.purple },
  { name: 'Yellow', hex: T.yellow },
  { name: 'Red', hex: T.red },
  { name: 'Pink', hex: '#e06090' },
];

export const DEFAULT_PROMPTS: Record<string, string> = {
  weekly: "Generate a rolling 7-day briefing with day-by-day breakdown, deadlines, email highlights woven in, and priority actions.",
  tomorrow: "Create tomorrow\u2019s to-do. Estimate each task + 30 min buffer. Respect work/gym schedule. Carry forward incomplete tasks.",
  materials: "Generate study materials for a 2nd-year pharmacy student: key concepts, detailed notes, pharmacy connections, 10 MCQs, 10 flashcards, exam traps.",
  canvas: "Interpret Canvas announcements. Cancelled class = freed time + suggestion. Deadline change = recalculate. Exam change = flag prominently.",
  calendar: "Suggest study sessions in free slots. 30min\u20132hr, max 3/day, prefer AM/PM, next 3 days only. Never over work/gym. Title: [AI].",
};

export const BUILTIN_CARDS = [
  { id: 'weekly', label: 'Planner', title: 'Weekly Plan', desc: 'Rolling 7-day plan', bullets: ['Day-by-day', 'Deadlines', 'Email highlights'], color: T.teal, requires: ['google', 'gmail'], promptKey: 'weekly' },
  { id: 'tomorrow', label: 'To-Do', title: 'Tomorrow', desc: 'Hour-by-hour with buffers', bullets: ['Time-blocked', '30 min buffers', 'Tap to complete'], color: T.orange, requires: ['google'], promptKey: 'tomorrow' },
  { id: 'focus', label: 'Deep Work', title: 'Focus', desc: 'Pomodoro + ambient sounds', bullets: ['Task linking', 'Session history', 'Focus streak'], color: T.purple, requires: [], promptKey: '' },
  { id: 'canvas', label: 'University', title: 'Canvas Feed', desc: 'Announcements & updates', bullets: ['New uploads', 'Interpreter', 'Deadlines'], color: T.blue, requires: ['canvas'], promptKey: 'canvas' },
  { id: 'calendar', label: 'Schedule', title: 'Calendar', desc: 'Week + AI study blocks', bullets: ['Calendar sync', '[AI] events', 'Work/gym blocked'], color: T.yellow, requires: ['google'], promptKey: 'calendar' },
];

// Demo data for Phase 1 (replaced by real data in later phases)
export const DEMO_WEEKLY = [
  { day: 'Tuesday, 15 Apr', tag: 'tomorrow', events: [{ t: '9:00 AM', title: 'BIOL2368 Lecture', tp: 'class' }, { t: '11:00 AM', title: 'ONPS2431 Tutorial', tp: 'class' }, { t: '2:00 PM', title: '[AI] Study: AT3', tp: 'ai' }, { t: '7:00 PM', title: 'Gym', tp: 'gym' }], email: 'Nahar: AT3 rubric updated', deadlines: ['AT3 BIOL2368 — 4 days'] },
  { day: 'Wednesday, 16 Apr', events: [{ t: '10:00 AM', title: 'ONPS2431 Lecture', tp: 'class' }], deadlines: [] },
  { day: 'Thursday, 17 Apr', events: [{ t: '9:00 AM', title: 'BIOL2368 Practical', tp: 'class' }, { t: '1:00 PM', title: '[AI] Review ONPS2431', tp: 'ai' }, { t: '7:00 PM', title: 'Gym', tp: 'gym' }], email: 'New slides: ONPS2431 Wk6', deadlines: [] },
  { day: 'Friday, 18 Apr', events: [{ t: '10:00 AM', title: '[AI] AT3 final review', tp: 'ai' }], deadlines: ['AT3 — DUE 11:59 PM'] },
  { day: 'Saturday, 19 Apr', events: [{ t: '9\u20136:30', title: 'Work', tp: 'work' }], deadlines: [] },
  { day: 'Sunday, 20 Apr', events: [{ t: '9\u20136:30', title: 'Work', tp: 'work' }, { t: '7:00 PM', title: 'Gym', tp: 'gym' }], deadlines: [] },
  { day: 'Monday, 21 Apr', events: [{ t: '9:00 AM', title: 'BIOL2368 Lecture', tp: 'class' }, { t: '7:00 PM', title: 'Gym', tp: 'gym' }], deadlines: ['ONPS2431 Quiz 3 opens'] },
];

export const DEMO_TODO = [
  { time: '7:00', task: 'Review ONPS2431 Wk6', est: 30, buf: 15, urg: 'green', desc: 'DNA replication.' },
  { time: '9:00', task: 'BIOL2368 Lecture', est: 90, buf: 0, urg: 'class', desc: 'Gram-negative bacteria.' },
  { time: '11:00', task: 'ONPS2431 Tutorial', est: 60, buf: 0, urg: 'class' },
  { time: '12:00', task: 'Lunch', est: 45, buf: 0, urg: 'break' },
  { time: '1:00', task: 'AT3 BIOL2368', est: 90, buf: 30, urg: 'red', desc: 'Biochem ID section.', carried: true },
  { time: '3:15', task: 'AT3 formatting', est: 30, buf: 30, urg: 'amber', desc: 'Refs & tables.' },
  { time: '7:00', task: 'Gym', est: 120, buf: 0, urg: 'gym' },
];

export const DEMO_MATERIALS = [
  { course: 'BIOL2368', code: 'BIO', weeks: [{ n: 3, title: 'Microscopy & Staining', notes: 'Gram staining differentiates bacteria by cell wall. Crystal violet retained by Gram+ (thick peptidoglycan), washed from Gram\u2013. Safranin counterstains pink.', mcqs: [{ q: 'Which retains crystal violet in Gram+?', o: ['Outer membrane', 'Peptidoglycan', 'LPS', 'Teichoic acid'], a: 1 }], cards: [{ t: 'Peptidoglycan', d: 'NAG-NAM polymer; thicker in Gram+' }, { t: 'LPS', d: 'Gram\u2013 endotoxin' }] }] },
  { course: 'ONPS2431', code: 'MOL', weeks: [{ n: 5, title: 'Gene Expression', notes: 'RNA Pol II + TFs at TATA box. mRNA processing: 5\u2019 cap, poly-A tail, intron splicing.', mcqs: [{ q: 'Which polymerase transcribes mRNA?', o: ['Pol I', 'Pol II', 'Pol III', 'Primase'], a: 1 }], cards: [{ t: 'TATA box', d: 'Promoter; binds TBP' }, { t: 'Intron', d: 'Non-coding; spliced out' }] }] },
];
