import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { logError } from '@/lib/db';
import { getCanvasToken } from '@/lib/canvas';
import { extractTextFromFile, extractYouTubeTranscript } from '@/lib/extract';
import { generateWithClaude } from '@/lib/claude';

interface ModuleItem {
  id: number;
  title: string;
  type: string;
  content_id?: number;
  external_url?: string;
  html_url?: string;
}

interface CanvasFile {
  id: number;
  display_name: string;
  filename: string;
  url: string;
  content_type: string;
  size: number;
  created_at: string;
}

export const POST = withAuth(async (_req, userId) => {
  const results: { file: string; status: string; error?: string }[] = [];

  try {
    // Load canvas cache to find files
    const { data: canvasCache } = await supabaseAdmin
      .from('canvas_cache')
      .select('data')
      .eq('user_id', userId)
      .single();
    if (!canvasCache) {
      return NextResponse.json({ error: 'No Canvas data. Fetch /api/canvas first.' }, { status: 400 });
    }

    const canvas = canvasCache.data as { module_items?: { course_id: number; course_name: string; items: ModuleItem[] }[] };
    const token = await getCanvasToken(userId);

    // Get custom prompt
    const { data: promptRow } = await supabaseAdmin
      .from('card_prompts')
      .select('prompt_text')
      .eq('user_id', userId)
      .eq('card_key', 'materials')
      .single();
    const customPrompt = promptRow?.prompt_text ||
      "Generate study materials for a 2nd-year pharmacy student: key concepts, detailed notes, pharmacy connections, 10 MCQs, 10 flashcards, exam traps.";

    // Collect all processable items: files from modules + YouTube links
    const toProcess: { id: string; name: string; courseId: number; courseName: string; type: 'file' | 'youtube'; url: string }[] = [];

    for (const mod of canvas.module_items || []) {
      for (const item of mod.items) {
        if (item.type === 'File' && item.content_id) {
          const fileId = `file_${item.content_id}`;
          const { data: alreadyProcessed } = await supabaseAdmin
            .from('processed_files')
            .select('canvas_file_id')
            .eq('user_id', userId)
            .eq('canvas_file_id', fileId)
            .single();
          if (!alreadyProcessed) {
            toProcess.push({
              id: fileId,
              name: item.title,
              courseId: mod.course_id,
              courseName: mod.course_name,
              type: 'file',
              url: `https://rmit.instructure.com/api/v1/files/${item.content_id}`,
            });
          }
        }
        if (item.type === 'ExternalUrl' && item.external_url?.includes('youtube')) {
          const ytId = `yt_${item.id}`;
          const { data: alreadyProcessed } = await supabaseAdmin
            .from('processed_files')
            .select('canvas_file_id')
            .eq('user_id', userId)
            .eq('canvas_file_id', ytId)
            .single();
          if (!alreadyProcessed) {
            toProcess.push({
              id: ytId,
              name: item.title,
              courseId: mod.course_id,
              courseName: mod.course_name,
              type: 'youtube',
              url: item.external_url,
            });
          }
        }
      }
    }

    if (toProcess.length === 0) {
      return NextResponse.json({ message: 'No new files to process', processed: 0, results: [] });
    }

    // Process each item
    for (const item of toProcess) {
      try {
        let text = '';

        if (item.type === 'youtube') {
          text = await extractYouTubeTranscript(item.url);
          if (!text) {
            results.push({ file: item.name, status: 'skipped', error: 'No transcript available' });
            await supabaseAdmin.from('processed_files').insert({ user_id: userId, canvas_file_id: item.id });
            continue;
          }
        } else {
          // Get file metadata from Canvas
          const fileRes = await fetch(item.url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!fileRes.ok) {
            results.push({ file: item.name, status: 'error', error: `Canvas API ${fileRes.status}` });
            continue;
          }
          const fileMeta = await fileRes.json() as CanvasFile;

          // Skip very large files (>10MB) or unsupported types
          if (fileMeta.size > 10 * 1024 * 1024) {
            results.push({ file: item.name, status: 'skipped', error: 'File too large (>10MB)' });
            await supabaseAdmin.from('processed_files').insert({ user_id: userId, canvas_file_id: item.id });
            continue;
          }

          text = await extractTextFromFile(fileMeta.url, fileMeta.content_type, fileMeta.filename, token);
        }

        if (!text || text.trim().length < 50) {
          results.push({ file: item.name, status: 'skipped', error: 'Insufficient text content' });
          await supabaseAdmin.from('processed_files').insert({ user_id: userId, canvas_file_id: item.id });
          continue;
        }

        // Determine week number from file name or date
        const weekMatch = item.name.match(/(?:week|wk|w)\s*(\d+)/i);
        const week = weekMatch ? parseInt(weekMatch[1]) : estimateWeek(item.name);

        // Send to Claude for material generation
        const systemPrompt = `You are an AI study material generator for a university student.

${customPrompt}

Return ONLY valid JSON with this exact structure:
{
  "key_concepts": ["concept 1", "concept 2", ...],
  "detailed_notes": ["note 1 with explanation", "note 2 with explanation", ...],
  "pharmacy_connections": ["how this connects to pharmacy practice", ...],
  "mcqs": [
    {"question": "...", "options": ["A", "B", "C", "D"], "correct_answer": 1, "explanation": "..."},
    ...
  ],
  "flashcards": [
    {"term": "...", "definition": "..."},
    ...
  ],
  "exam_traps": ["common mistake or tricky concept to watch for", ...]
}`;

        const userMsg = `Generate study materials from this lecture content.

Course: ${item.courseName}
File: ${item.name}
${item.type === 'youtube' ? 'Source: YouTube transcript' : ''}

CONTENT:
${text}`;

        const response = await generateWithClaude(systemPrompt, userMsg, { maxTokens: 4096 });

        // Parse JSON
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
        const jsonStr = jsonMatch[1]?.trim() || response.trim();

        let materials;
        try {
          materials = JSON.parse(jsonStr);
        } catch {
          await logError('materials/generate/parse', `Failed to parse for ${item.name}`, userId);
          materials = { raw: response, key_concepts: [], detailed_notes: [], mcqs: [], flashcards: [], exam_traps: [] };
        }

        // Save to database
        await supabaseAdmin.from('materials').insert({
          user_id: userId,
          course: item.courseName,
          week,
          source_file: item.name,
          source_type: item.type,
          content: materials,
        });

        // Mark as processed
        await supabaseAdmin.from('processed_files').insert({ user_id: userId, canvas_file_id: item.id });

        results.push({ file: item.name, status: 'success' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        await logError('materials/generate/item', `${item.name}: ${msg}`, userId);
        results.push({ file: item.name, status: 'error', error: msg });
      }
    }

    return NextResponse.json({
      message: `Processed ${results.filter((r) => r.status === 'success').length} of ${toProcess.length} files`,
      processed: results.filter((r) => r.status === 'success').length,
      total: toProcess.length,
      results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('materials/generate', msg, userId);
    return NextResponse.json({ error: 'Failed to generate materials', message: msg }, { status: 500 });
  }
});

function estimateWeek(filename: string): number {
  const numMatch = filename.match(/(\d+)/);
  if (numMatch) {
    const n = parseInt(numMatch[1]);
    if (n >= 1 && n <= 15) return n;
  }
  return 0;
}
