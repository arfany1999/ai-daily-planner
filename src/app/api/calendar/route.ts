import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getCalendarService } from '@/lib/google';
import { supabaseAdmin } from '@/lib/supabase';
import { logError } from '@/lib/db';

const TIMEZONE = 'Australia/Melbourne';

export const GET = withAuth(async (_req, userId) => {
  try {
    const calendar = await getCalendarService(userId);

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const endDate = new Date(tomorrow);
    endDate.setDate(endDate.getDate() + 7);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: tomorrow.toISOString(),
      timeMax: endDate.toISOString(),
      timeZone: TIMEZONE,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const events = (res.data.items || []).map((event) => ({
      id: event.id,
      title: event.summary || 'Untitled',
      description: event.description || '',
      location: event.location || '',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      allDay: !event.start?.dateTime,
      color: event.colorId || null,
      status: event.status,
    }));

    await supabaseAdmin.from('calendar_cache').upsert({
      user_id: userId,
      data: events,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return NextResponse.json({ events, stale: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    await logError('api/calendar', msg, userId);

    const { data: cached } = await supabaseAdmin
      .from('calendar_cache')
      .select('data')
      .eq('user_id', userId)
      .single();
    if (cached) return NextResponse.json({ events: cached.data, stale: true });
    return NextResponse.json({ error: 'Failed to fetch calendar', message: msg }, { status: 500 });
  }
});
