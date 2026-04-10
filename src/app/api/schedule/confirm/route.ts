import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getCalendarService } from '@/lib/google';
import { supabaseAdmin } from '@/lib/supabase';
import { logError } from '@/lib/db';

interface EventToCreate {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  description?: string;
}

const TIMEZONE = 'Australia/Melbourne';

export const POST = withAuth(async (req: Request, userId) => {
  const { events } = await req.json() as { events: EventToCreate[] };

  if (!events || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'No events to create' }, { status: 400 });
  }

  const calendar = await getCalendarService(userId);
  const created: { id: string; title: string; date: string }[] = [];
  const errors: { title: string; error: string }[] = [];

  for (const ev of events) {
    try {
      // Check for duplicate [AI] events on same day/topic
      const existingRes = await calendar.events.list({
        calendarId: 'primary',
        timeMin: `${ev.date}T00:00:00+10:00`,
        timeMax: `${ev.date}T23:59:59+10:00`,
        timeZone: TIMEZONE,
        q: '[AI]',
        singleEvents: true,
      });

      const duplicate = (existingRes.data.items || []).find(
        (existing) => existing.summary === ev.title
      );

      if (duplicate) {
        errors.push({ title: ev.title, error: 'Duplicate event already exists' });
        continue;
      }

      // Create the event
      const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: ev.title,
          description: ev.description || 'AI-scheduled study session',
          start: {
            dateTime: `${ev.date}T${ev.start_time}:00`,
            timeZone: TIMEZONE,
          },
          end: {
            dateTime: `${ev.date}T${ev.end_time}:00`,
            timeZone: TIMEZONE,
          },
          colorId: '5', // Yellow
        },
      });

      const eventId = res.data.id!;
      created.push({ id: eventId, title: ev.title, date: ev.date });

      // Save to schedule_history
      await supabaseAdmin.from('schedule_history').insert({
        user_id: userId,
        google_event_id: eventId,
        date: ev.date,
        title: ev.title,
        start_time: ev.start_time,
        end_time: ev.end_time,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      await logError('schedule/confirm/event', `${ev.title}: ${msg}`, userId);
      errors.push({ title: ev.title, error: msg });
    }
  }

  return NextResponse.json({
    created,
    errors,
    message: `Created ${created.length} of ${events.length} events`,
  });
});
