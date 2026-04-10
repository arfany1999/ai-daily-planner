import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt } from '@/lib/encryption';

export const POST = withAuth(async (req, userId) => {
  const { token } = await req.json();
  if (!token || typeof token !== 'string' || token.trim().length < 10) {
    return NextResponse.json({ error: 'Invalid Canvas token' }, { status: 400 });
  }

  try {
    const res = await fetch('https://rmit.instructure.com/api/v1/users/self', {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Canvas token validation failed', details: `Status ${res.status}` }, { status: 400 });
    }
    const user = await res.json();

    const encryptedToken = encrypt(token.trim());

    await supabaseAdmin.from('users').update({
      canvas_token: encryptedToken,
      canvas_connected: true,
    }).eq('id', userId);

    return NextResponse.json({ success: true, user: { name: user.name, email: user.email || user.login_id } });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to validate', message: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
});
