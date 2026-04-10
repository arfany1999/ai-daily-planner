import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { getSettings, setSetting, isSetupComplete, markSetupComplete } from '@/lib/db';

export const GET = withAuth(async (_req, userId) => {
  const settings = await getSettings(userId);
  settings.setup_complete = await isSetupComplete(userId);
  return NextResponse.json(settings);
});

export const POST = withAuth(async (req, userId) => {
  const body = await req.json();

  for (const [key, value] of Object.entries(body)) {
    if (key === 'setup_complete') {
      if (value === true) await markSetupComplete(userId);
      continue;
    }
    await setSetting(userId, key, value);
  }

  const settings = await getSettings(userId);
  settings.setup_complete = await isSetupComplete(userId);
  return NextResponse.json(settings);
});
