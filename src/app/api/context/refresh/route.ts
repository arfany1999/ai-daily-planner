import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { buildContextText, storeContextSnapshot } from '@/lib/context-builder';

const TIMEZONE = 'Australia/Melbourne';

// Rebuild the daily context snapshot for today.
// Called manually (button in UI) or by webhooks when Calendar/Canvas/Gmail data changes.
export const POST = withAuth(async (_req: Request, userId) => {
  try {
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    const contextText = await buildContextText(userId, todayDate);
    await storeContextSnapshot(userId, todayDate, contextText);

    return NextResponse.json({
      ok: true,
      refreshed_at: new Date().toISOString(),
      target_date: todayDate,
      preview: contextText.slice(0, 300) + '…',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
