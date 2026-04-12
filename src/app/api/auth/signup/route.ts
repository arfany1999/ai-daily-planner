import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase';
import { getOrCreateUser } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    // Check if email already exists
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id, password_hash')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      if (existing.password_hash) {
        return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
      }
      // Google user trying to add password — not allowed, direct them to Google
      return NextResponse.json({ error: 'This email is linked to a Google account. Please sign in with Google.' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 12);

    // Create user + seed defaults
    const userId = await getOrCreateUser(email.toLowerCase(), name?.trim() || undefined);

    // Store hash
    await supabaseAdmin
      .from('users')
      .update({ password_hash: hash })
      .eq('id', userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[signup]', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
