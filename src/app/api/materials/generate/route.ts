import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError } from '@/lib/db';
import { generateWithClaude, isAiAvailable } from '@/lib/claude';

export const maxDuration = 60;

// Attempt to fix truncated JSON by closing open brackets/arrays
function repairJson(str: string): string {
  // Trim to last complete top-level field value
  // Find the deepest balanced position
  const stack: string[] = [];
  let inString = false;
  let lastCompletePos = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const prev = str[i - 1];

    if (ch === '"' && prev !== '\\') {
      inString = !inString;
    }
    if (!inString) {
      if (ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === '}' || ch === ']') {
        stack.pop();
        if (stack.length === 0) lastCompletePos = i + 1;
      } else if (ch === ',' && stack.length === 1) {
        lastCompletePos = i; // last complete sibling
      }
    }
  }

  // Close any remaining open structures
  let repaired = str.slice(0, lastCompletePos);
  // Close unclosed string if needed
  if (inString) repaired += '"';
  // Close remaining stack
  for (let i = stack.length - 1; i >= 0; i--) {
    repaired += stack[i] === '{' ? '}' : ']';
  }
  return repaired;
}

// Estimate current semester week from a Feb/Mar start
function currentSemesterWeek(): number {
  const now = new Date();
  const year = now.getFullYear();
  // Assume semester 1 starts late Feb (day 50 of year ≈ Feb 19)
  const semStart = new Date(year, 1, 19); // Feb 19
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const week = Math.ceil((now.getTime() - semStart.getTime()) / msPerWeek);
  return Math.max(1, Math.min(week, 16));
}

export const POST = withAuth(async (req, userId) => {
  if (!isAiAvailable()) {
    return NextResponse.json({ ai_unavailable: true, message: 'AI is disabled. Materials generation is offline.' }, { status: 503 });
  }
  try {
    // Allow caller to request specific course/week, or generate all
    let body: { course?: string; week?: number; forceAll?: boolean } = {};
    try { body = await req.json(); } catch { /* no body */ }

    // Load canvas cache
    const { data: canvasCache } = await supabaseAdmin
      .from('canvas_cache')
      .select('data')
      .eq('user_id', userId)
      .single();

    if (!canvasCache?.data) {
      return NextResponse.json({ error: 'No Canvas data cached. Visit the Canvas page first.' }, { status: 400 });
    }

    const canvas = canvasCache.data as {
      courses?: { id: number; name: string; course_code: string }[];
      assignments?: { name: string; course_name: string; due_at: string | null; has_submitted_submissions: boolean }[];
      announcements?: { title: string; message: string; posted_at: string; course_name: string }[];
    };

    const courses = canvas.courses || [];
    const assignments = canvas.assignments || [];
    const announcements = canvas.announcements || [];

    if (courses.length === 0) {
      return NextResponse.json({ error: 'No courses found in Canvas data.' }, { status: 400 });
    }

    // Get custom prompt
    const { data: promptRow } = await supabaseAdmin
      .from('card_prompts')
      .select('prompt_text')
      .eq('user_id', userId)
      .eq('card_key', 'materials')
      .single();
    const customPrompt = promptRow?.prompt_text ||
      'Generate study materials for a 2nd-year pharmacy student. Be comprehensive and exam-focused.';

    const currentWeek = currentSemesterWeek();

    // Whitelist: only generate materials for these 4 pharmacy subjects
    const STUDY_COURSES = /microbiol|molecular\s*(biology)?|essentials?\s*of\s*pharmacy|professional\s*practice/i;
    const studyCourses = courses.filter(c => STUDY_COURSES.test(c.name));

    // Determine which courses/weeks to generate
    const targetCourses = body.course
      ? courses.filter(c => c.name === body.course)
      : studyCourses;
    // Default: current week only. Use week param for specific week, forceAll for current+previous.
    const weeksToGenerate = body.week
      ? [body.week]
      : body.forceAll
        ? [currentWeek, Math.max(1, currentWeek - 1)]
        : [currentWeek];

    // Build list of jobs to run
    type Job = { course: typeof courses[0]; week: number };
    const jobs: Job[] = [];

    for (const course of targetCourses) {
      for (const week of weeksToGenerate) {
        if (!body.forceAll) {
          const { data: existing } = await supabaseAdmin
            .from('materials')
            .select('id')
            .eq('user_id', userId)
            .eq('course', course.name)
            .eq('week', week)
            .single();
          if (existing) continue; // will report as skipped below
        }
        jobs.push({ course, week });
      }
    }

    // Count skipped
    const totalCombinations = targetCourses.length * weeksToGenerate.length;
    const skipped = totalCombinations - jobs.length;

    // Build prompt for a single course/week
    const buildPrompts = (course: typeof courses[0], week: number) => {
      const courseAssignments = assignments
        .filter(a => a.course_name === course.name)
        .map(a => ({
          name: a.name,
          due_at: a.due_at,
          submitted: a.has_submitted_submissions,
          days_until: a.due_at ? Math.ceil((new Date(a.due_at).getTime() - Date.now()) / 86400000) : null,
        }))
        .slice(0, 15);

      const courseAnnouncements = announcements
        .filter(a => a.course_name === course.name)
        .map(a => ({
          title: a.title,
          preview: a.message?.replace(/<[^>]*>/g, '').slice(0, 300),
          date: a.posted_at,
        }))
        .slice(0, 10);

      const systemPrompt = `You are an expert study material generator for a 2nd-year pharmacy student at RMIT University.

${customPrompt}

REQUIREMENTS (keep each item SHORT to fit within token budget):
- 5 key concepts (1 line each)
- 4 detailed notes (1 sentence each, exam-focused)
- 6 MCQs with 4 options + 1-line explanation
- 8 flashcards (term: 2-5 words, definition: 1 sentence)
- 3 exam traps (1 sentence each)
- 2 pharmacy_connections (1 sentence each)
- Infer week ${week} topics from course name and assignments
- IMPORTANT: Keep all text concise to fit the token budget. Complete the JSON fully.

Return ONLY valid JSON:
{
  "week_topic": "Inferred topic for week ${week}",
  "key_concepts": ["concept 1", "concept 2", ...],
  "detailed_notes": ["Full explanatory note 1", ...],
  "pharmacy_connections": ["Practical pharmacy connection", ...],
  "mcqs": [
    {
      "question": "Question text?",
      "options": ["A. option", "B. option", "C. option", "D. option"],
      "correct_answer": 0,
      "explanation": "Why this is correct and others are wrong"
    }
  ],
  "flashcards": [
    { "term": "Term", "definition": "Precise definition" }
  ],
  "exam_traps": ["Common mistake or misconception to avoid"]
}`;

      const userMsg = `Generate comprehensive Week ${week} study materials for this course.

COURSE: ${course.name} (${course.course_code})
CURRENT SEMESTER WEEK: ${currentWeek}
TARGET WEEK: ${week}

ASSIGNMENTS IN THIS COURSE:
${JSON.stringify(courseAssignments, null, 2)}

RECENT ANNOUNCEMENTS:
${JSON.stringify(courseAnnouncements, null, 2)}

Based on the course name, assignments, and announcements, infer what topics would be covered in Week ${week} and generate rich, exam-focused study materials.`;

      return { systemPrompt, userMsg };
    };

    // Process 1 job per request — Claude can take up to 55s, so 1 call fits in 60s Vercel timeout
    const jobsToRun = jobs.slice(0, 1);
    const remaining = jobs.length - jobsToRun.length;

    // Run 2 jobs in parallel
    const results: { course: string; week: number; status: string; error?: string }[] = [];

    const processJob = async (course: typeof courses[0], week: number) => {
      try {
        const { systemPrompt, userMsg } = buildPrompts(course, week);
        const response = await generateWithClaude(systemPrompt, userMsg, {
          maxTokens: 2500,
          model: 'claude-sonnet-4-6',
        });

        // Extract JSON: try code block first, then brace-boundary extraction
        let jsonStr: string;
        const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock?.[1]) {
          jsonStr = codeBlock[1].trim();
        } else {
          // Find first { to last } to handle trailing text after JSON
          const firstBrace = response.indexOf('{');
          const lastBrace = response.lastIndexOf('}');
          jsonStr = firstBrace !== -1 && lastBrace > firstBrace
            ? response.slice(firstBrace, lastBrace + 1)
            : response.trim();
        }

        let materials;
        try {
          materials = JSON.parse(jsonStr);
        } catch {
          // Try to repair truncated JSON by closing open structures
          jsonStr = repairJson(jsonStr);
          try {
            materials = JSON.parse(jsonStr);
          } catch {
            await logError('materials/generate/parse', `Parse failed for ${course.name} week ${week}`, userId);
            results.push({ course: course.name, week, status: 'error', error: 'JSON parse failed' });
            return;
          }
        }

        const sourceFile = materials.week_topic || `Week ${week} — AI Generated`;

        if (body.forceAll) {
          await supabaseAdmin
            .from('materials')
            .delete()
            .eq('user_id', userId)
            .eq('course', course.name)
            .eq('week', week);
        }

        await supabaseAdmin.from('materials').insert({
          user_id: userId,
          course: course.name,
          week,
          source_file: sourceFile,
          source_type: 'ai_generated',
          content: materials,
        });

        results.push({ course: course.name, week, status: 'success' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown';
        await logError('materials/generate/item', `${course.name} week ${week}: ${msg}`, userId);
        results.push({ course: course.name, week, status: 'error', error: msg });
      }
    };

    if (jobsToRun.length > 0) await processJob(jobsToRun[0].course, jobsToRun[0].week);

    const succeeded = results.filter(r => r.status === 'success').length;
    return NextResponse.json({
      message: succeeded > 0
        ? `Generated ${succeeded} set${succeeded !== 1 ? 's' : ''}${remaining > 0 ? ` — ${remaining} more pending, click again` : ' — all done!'}${skipped > 0 ? ` (${skipped} already existed)` : ''}`
        : jobs.length === 0
          ? 'All up to date — use "↻ Regenerate All" to force refresh.'
          : 'Generation failed — check logs.',
      generated: succeeded,
      skipped,
      remaining,
      results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('materials/generate', msg, userId);
    return NextResponse.json({ error: 'Failed', message: msg }, { status: 500 });
  }
});
