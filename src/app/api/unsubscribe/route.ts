import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Public endpoint - uses email token for auth instead of session
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const type = searchParams.get('type'); // briefing, todo, weekly, all

  if (!email) {
    return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const updates: Record<string, boolean> = {};

  if (type === 'all' || type === 'briefing') updates.email_briefing = false;
  if (type === 'all' || type === 'todo') updates.email_todo = false;
  if (type === 'all' || type === 'weekly') updates.email_weekly = false;

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('user_settings').update(updates).eq('user_id', user.id);
  }

  // Redirect to the unsubscribe confirmation page
  return NextResponse.redirect(new URL(`/unsubscribe?success=true&type=${type || 'all'}`, req.url));
}
