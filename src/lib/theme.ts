export const T = {
  bg: 'var(--bg)',
  bg1: 'var(--bg1)',
  bg2: 'var(--bg2)',
  bg3: 'var(--bg3)',
  bg4: 'var(--bg4)',
  card: 'var(--surface)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  borderSoft: 'var(--border-soft)',

  text: 'var(--text)',
  textSoft: 'var(--text-soft)',
  textMuted: 'var(--text-muted)',
  textFaint: 'var(--text-faint)',

  teal: 'var(--teal)',
  tealDk: 'var(--teal-dk)',
  tealLt: 'var(--teal-lt)',
  tealGlow: 'var(--teal-glow)',
  tealBrd: 'var(--teal-brd)',

  orange: 'var(--orange)',
  green: 'var(--green)',
  blue: 'var(--blue)',
  red: 'var(--red)',
  purple: 'var(--purple)',
  yellow: 'var(--yellow)',
  pink: 'var(--pink)',
  cyan: 'var(--cyan)',

  // Domains
  dAcademia: 'var(--d-academia)',
  dDev: 'var(--d-dev)',
  dFinance: 'var(--d-finance)',
  dHealth: 'var(--d-health)',
  dAdmin: 'var(--d-admin)',
  dBreak: 'var(--d-break)',

  glass: 'var(--glass)',
  glassHi: 'var(--glass-hi)',
  glassBrd: 'var(--glass-brd)',
  surface: 'var(--surface)',
  surfaceHi: 'var(--surface-hi)',
  surfaceHover: 'var(--surface-hover)',
  surfaceInput: 'var(--surface-input)',

  shadowSm: 'var(--shadow-sm)',
  shadowMd: 'var(--shadow-md)',
  shadowLg: 'var(--shadow-lg)',
  shadowGlow: 'var(--shadow-glow)',

  easeSpring: 'var(--ease-spring)',
  easeOut: 'var(--ease-out)',
  easeInOut: 'var(--ease-in-out)',

  // Density tokens (read from CSS vars at runtime)
  gap: 'var(--density-gap)',
  pad: 'var(--density-pad)',
  row: 'var(--density-row)',
  radius: 'var(--density-radius)',
  fontBody: 'var(--density-font-body)',
  fontLabel: 'var(--density-font-label)',
  fontTitle: 'var(--density-font-title)',
};

// Domain registry — user's life areas
export interface Domain {
  id: string;
  label: string;
  color: string;            // hex (static — for inline styling)
  cssVar: string;           // CSS var reference
  icon: string;             // emoji/glyph fallback
  description: string;
}

export const DOMAINS: Domain[] = [
  { id: 'academia', label: 'Academia',  color: '#6E8BE8', cssVar: 'var(--d-academia)', icon: '🎓', description: 'RMIT, Canvas, lectures, labs, exams' },
  { id: 'dev',      label: 'Dev',       color: '#B088D4', cssVar: 'var(--d-dev)',      icon: '⌘',  description: 'mrgren.store, GitHub, deploys' },
  { id: 'finance',  label: 'Finance',   color: '#E0B048', cssVar: 'var(--d-finance)',  icon: '◎',  description: 'Crypto, portfolio, markets' },
  { id: 'health',   label: 'Health',    color: '#5FBE76', cssVar: 'var(--d-health)',   icon: '◉',  description: 'Gym, wellness, sleep' },
  { id: 'admin',    label: 'Admin',     color: '#E08A4A', cssVar: 'var(--d-admin)',    icon: '✦',  description: 'Personal, errands, placement, family' },
  { id: 'break',    label: 'Break',     color: '#8B8274', cssVar: 'var(--d-break)',    icon: '○',  description: 'Meals, rest, commute' },
];

export const DOMAIN_BY_ID: Record<string, Domain> = Object.fromEntries(DOMAINS.map(d => [d.id, d]));

// Map legacy urgency → domain
export function urgencyToDomain(urgency: string): Domain {
  const u = (urgency || '').toLowerCase();
  if (u === 'class' || u === 'academia' || u === 'canvas') return DOMAIN_BY_ID.academia;
  if (u === 'gym' || u === 'health') return DOMAIN_BY_ID.health;
  if (u === 'work' || u === 'dev') return DOMAIN_BY_ID.dev;
  if (u === 'finance' || u === 'crypto') return DOMAIN_BY_ID.finance;
  if (u === 'break') return DOMAIN_BY_ID.break;
  if (u === 'red' || u === 'amber' || u === 'green' || u === 'ai') return DOMAIN_BY_ID.admin;
  return DOMAIN_BY_ID.admin;
}

export function inferDomainFromTitle(title: string): Domain {
  const t = (title || '').toLowerCase();
  if (/\b(gym|workout|run|yoga|sleep|meal|water)\b/.test(t)) return DOMAIN_BY_ID.health;
  if (/\b(lecture|tut|tutorial|class|lab|practical|canvas|exam|quiz|biol|onps|pharm|assignment|at\d)\b/.test(t)) return DOMAIN_BY_ID.academia;
  if (/\b(deploy|commit|code|dev|vercel|github|store|build|ship|pr|api)\b/.test(t)) return DOMAIN_BY_ID.dev;
  if (/\b(btc|eth|crypto|dca|portfolio|market|trade|stock)\b/.test(t)) return DOMAIN_BY_ID.finance;
  if (/\b(lunch|dinner|breakfast|break|rest|commute|drive)\b/.test(t)) return DOMAIN_BY_ID.break;
  return DOMAIN_BY_ID.admin;
}

export const urgencyColors: Record<string, string> = {
  red: 'var(--red)',
  amber: 'var(--orange)',
  green: 'var(--green)',
  class: 'var(--d-academia)',
  gym: 'var(--d-health)',
  work: 'var(--d-dev)',
  break: 'var(--d-break)',
  ai: 'var(--yellow)',
};

export const ACCENT_COLORS = [
  { name: 'Terracotta', hex: '#C4764A' },
  { name: 'Blue', hex: '#6E8BE8' },
  { name: 'Purple', hex: '#B088D4' },
  { name: 'Green', hex: '#5FBE76' },
  { name: 'Gold', hex: '#E0B048' },
  { name: 'Orange', hex: '#E08A4A' },
  { name: 'Red', hex: '#E5604C' },
  { name: 'Pink', hex: '#E878A8' },
];

// Density helpers — runtime write to <html data-density>
export type Density = 'comfortable' | 'cozy' | 'compact';
function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const exp = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;expires=${exp};samesite=lax`;
}
export function applyDensity(d: Density) {
  if (typeof document === 'undefined') return;
  if (d === 'comfortable') document.documentElement.removeAttribute('data-density');
  else document.documentElement.setAttribute('data-density', d);
  try { localStorage.setItem('cmd-density', d); } catch {}
  setCookie('cmd-density', d);
}
export function getDensity(): Density {
  if (typeof document === 'undefined') return 'comfortable';
  try { return (localStorage.getItem('cmd-density') as Density) || 'comfortable'; } catch { return 'comfortable'; }
}

// Theme helpers — runtime write to <html data-theme>
export type Theme = 'auto' | 'light' | 'dark';
export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('cmd-theme', t); } catch {}
  setCookie('cmd-theme', t);
}
export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'auto';
  try { return (localStorage.getItem('cmd-theme') as Theme) || 'auto'; } catch { return 'auto'; }
}

// Sunrise/sunset for Melbourne — pure-JS NOAA solar position (no API)
export function melbSunTimes(date: Date = new Date()): { sunrise: Date; sunset: Date } {
  const lat = -37.8136;
  const lng = 144.9631;
  const d0 = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const n = Math.floor((d0.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000);
  const rad = Math.PI / 180;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const epsilon = 23.439 * rad;
  const delta = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const H = Math.acos(
    (Math.sin(-0.0145) - Math.sin(lat * rad) * Math.sin(delta)) /
    (Math.cos(lat * rad) * Math.cos(delta))
  );
  const solarNoonUTC = (720 - 4 * lng - 0.0 + n * 0) / 1440;
  const sunriseUTCmin = solarNoonUTC * 1440 - (H / rad) * 4;
  const sunsetUTCmin  = solarNoonUTC * 1440 + (H / rad) * 4;
  const toDate = (mins: number) => {
    const out = new Date(d0);
    out.setUTCMinutes(Math.round(mins));
    return out;
  };
  return { sunrise: toDate(sunriseUTCmin), sunset: toDate(sunsetUTCmin) };
}

export const DEFAULT_PROMPTS: Record<string, string> = {
  weekly: "Generate a rolling 7-day briefing with day-by-day breakdown, deadlines, email highlights woven in, and priority actions.",
  tomorrow: "Create tomorrow\u2019s to-do. Estimate each task + 30 min buffer. Respect work/gym schedule. Carry forward incomplete tasks.",
  materials: "Generate study materials for a 2nd-year pharmacy student: key concepts, detailed notes, pharmacy connections, 10 MCQs, 10 flashcards, exam traps.",
  canvas: "Interpret Canvas announcements. Cancelled class = freed time + suggestion. Deadline change = recalculate. Exam change = flag prominently.",
  calendar: "Suggest study sessions in free slots. 30min\u20132hr, max 3/day, prefer AM/PM, next 3 days only. Never over work/gym. Title: [AI].",
};

export const BUILTIN_CARDS = [
  { id: 'weekly',   label: 'Planner',   title: 'Weekly Plan', desc: 'Rolling 7-day plan',       bullets: ['Day-by-day','Deadlines','Email highlights'], color: '#C4764A', requires: ['google','gmail'], promptKey: 'weekly' },
  { id: 'tomorrow', label: 'To-Do',     title: 'Tomorrow',    desc: 'Hour-by-hour with buffers', bullets: ['Time-blocked','30 min buffers','Tap to complete'], color: '#E08A4A', requires: ['google'], promptKey: 'tomorrow' },
  { id: 'focus',    label: 'Deep Work', title: 'Focus',       desc: 'Pomodoro + ambient sounds', bullets: ['Task linking','Session history','Focus streak'], color: '#B088D4', requires: [], promptKey: '' },
  { id: 'canvas',   label: 'University',title: 'Canvas Feed', desc: 'Announcements & updates',   bullets: ['New uploads','Interpreter','Deadlines'], color: '#6E8BE8', requires: ['canvas'], promptKey: 'canvas' },
  { id: 'calendar', label: 'Schedule',  title: 'Calendar',    desc: 'Week + AI study blocks',    bullets: ['Calendar sync','[AI] events','Work/gym blocked'], color: '#E0B048', requires: ['google'], promptKey: 'calendar' },
];

// Legacy demos kept for compat
export const DEMO_WEEKLY = [
  { day: 'Tuesday, 15 Apr', tag: 'tomorrow', events: [{ t: '9:00 AM', title: 'BIOL2368 Lecture', tp: 'class' }, { t: '11:00 AM', title: 'ONPS2431 Tutorial', tp: 'class' }, { t: '2:00 PM', title: '[AI] Study: AT3', tp: 'ai' }, { t: '7:00 PM', title: 'Gym', tp: 'gym' }], email: 'Nahar: AT3 rubric updated', deadlines: ['AT3 BIOL2368 — 4 days'] },
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
  { course: 'BIOL2368', code: 'BIO', weeks: [{ n: 3, title: 'Microscopy & Staining', notes: 'Gram staining differentiates bacteria by cell wall.', mcqs: [{ q: 'Which retains crystal violet in Gram+?', o: ['Outer membrane', 'Peptidoglycan', 'LPS', 'Teichoic acid'], a: 1 }], cards: [{ t: 'Peptidoglycan', d: 'NAG-NAM polymer; thicker in Gram+' }] }] },
  { course: 'ONPS2431', code: 'MOL', weeks: [{ n: 5, title: 'Gene Expression', notes: 'RNA Pol II + TFs at TATA box.', mcqs: [{ q: 'Which polymerase transcribes mRNA?', o: ['Pol I', 'Pol II', 'Pol III', 'Primase'], a: 1 }], cards: [{ t: 'TATA box', d: 'Promoter; binds TBP' }] }] },
];
