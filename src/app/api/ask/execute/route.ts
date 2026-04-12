import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { logError } from '@/lib/db';

interface Action {
  type: string;
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  task_id?: string;
  course?: string;
  week?: number;
  connection_id?: number;
}

export const POST = withAuth(async (req: Request, _userId: string) => {
  const { action } = await req.json() as { action: Action };

  if (!action?.type) {
    return NextResponse.json({ error: 'Missing action type' }, { status: 400 });
  }

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  // Forward auth cookies so internal API calls are authenticated
  const cookie = req.headers.get('cookie') || '';

  try {
    switch (action.type) {
      case 'schedule': {
        const res = await fetch(`${baseUrl}/api/schedule/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({
            events: [{
              title: action.title,
              date: action.date,
              start_time: action.start_time,
              end_time: action.end_time,
              description: action.description,
            }],
          }),
        });
        const data = await res.json();
        return NextResponse.json({ success: true, result: data });
      }

      case 'complete_task': {
        const today = new Date();
        today.setDate(today.getDate() + 1);
        const date = today.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

        const res = await fetch(`${baseUrl}/api/tasks/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({ task_id: action.task_id, date }),
        });
        const data = await res.json();
        return NextResponse.json({ success: true, result: data });
      }

      case 'push_task': {
        const res = await fetch(`${baseUrl}/api/tasks/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({ task_id: action.task_id }),
        });
        const data = await res.json();
        return NextResponse.json({ success: true, result: data });
      }

      case 'generate_materials': {
        const res = await fetch(`${baseUrl}/api/materials/generate`, { method: 'POST', headers: { cookie } });
        const data = await res.json();
        return NextResponse.json({ success: true, result: data });
      }

      case 'refresh_connection': {
        if (action.connection_id) {
          const res = await fetch(`${baseUrl}/api/connections/${action.connection_id}/fetch`, { method: 'POST', headers: { cookie } });
          const data = await res.json();
          return NextResponse.json({ success: true, result: data });
        }
        return NextResponse.json({ error: 'Missing connection_id' }, { status: 400 });
      }

      default:
        return NextResponse.json({ error: `Unknown action type: ${action.type}` }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await logError('api/ask/execute', msg);
    return NextResponse.json({ error: 'Failed to execute action', message: msg }, { status: 500 });
  }
});
