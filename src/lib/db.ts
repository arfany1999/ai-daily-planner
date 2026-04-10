import { supabaseAdmin } from './supabase';
import { encrypt, decrypt } from './encryption';

// Get or create user, return user id (uuid)
export async function getOrCreateUser(email: string, name?: string, image?: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existing) {
    if (name || image) {
      await supabaseAdmin.from('users').update({
        name: name || undefined,
        avatar_url: image || undefined,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    }
    return existing.id;
  }

  const isAdmin = email === process.env.ADMIN_EMAIL;
  const { data: newUser, error } = await supabaseAdmin
    .from('users')
    .insert({ email, name, avatar_url: image, is_admin: isAdmin })
    .select('id')
    .single();

  if (error || !newUser) throw new Error(`Failed to create user: ${error?.message}`);

  // Seed defaults
  await seedDefaults(newUser.id, email);
  return newUser.id;
}

// Get user_id by email
export async function getUserId(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single();
  return data?.id || null;
}

// Check admin
export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('users').select('is_admin').eq('id', userId).single();
  return data?.is_admin === true;
}

// Check setup complete
export async function isSetupComplete(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('users').select('setup_completed').eq('id', userId).single();
  return data?.setup_completed === true;
}

// Mark setup complete
export async function markSetupComplete(userId: string) {
  await supabaseAdmin.from('users').update({ setup_completed: true }).eq('id', userId);
}

// Seed defaults for new user
async function seedDefaults(userId: string, email: string) {
  await supabaseAdmin.from('user_settings').upsert({
    user_id: userId,
    email_address: email,
  }, { onConflict: 'user_id' });

  // Create core connections
  const services = ['google_calendar', 'gmail', 'canvas'];
  for (const service of services) {
    await supabaseAdmin.from('core_connections').upsert({
      user_id: userId,
      service,
      enabled: service !== 'canvas',
    }, { onConflict: 'user_id,service' });
  }
}

// Store user tokens (encrypted)
export async function storeUserTokens(email: string, accessToken: string, refreshToken: string) {
  await supabaseAdmin.from('users').update({
    google_access_token: encrypt(accessToken),
    google_refresh_token: encrypt(refreshToken),
    google_token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('email', email);
}

// Get user tokens (decrypted)
export async function getUserTokens(userId: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('google_access_token, google_refresh_token')
    .eq('id', userId)
    .single();

  if (!data?.google_access_token) return null;
  return {
    accessToken: decrypt(data.google_access_token),
    refreshToken: decrypt(data.google_refresh_token),
  };
}

// Get all settings for a user
export async function getSettings(userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!data) return {};
  return {
    work_days: data.work_days,
    work_start: data.work_start,
    work_end: data.work_end,
    gym_days: data.gym_days,
    gym_start: data.gym_start,
    gym_end: data.gym_end,
    email_briefing: data.email_briefing,
    email_todo: data.email_todo,
    email_weekly: data.email_weekly,
    email_time: data.email_time,
    push_notifications: data.push_notifications,
    timezone: data.timezone,
  };
}

// Update settings for a user
export async function setSetting(userId: string, key: string, value: unknown) {
  await supabaseAdmin
    .from('user_settings')
    .update({ [key]: value })
    .eq('user_id', userId);
}

// Log error
export async function logError(context: string, message: string, userId?: string) {
  try {
    await supabaseAdmin.from('error_log').insert({
      user_id: userId || null,
      context,
      message,
    });
  } catch {
    console.error(`[${context}] ${message}`);
  }
}

// Track usage
export async function trackUsage(userId: string, field: string) {
  await supabaseAdmin.rpc('increment_usage', { p_user_id: userId, p_field: field });
}

// Get user context for AI prompts (dynamic, not hardcoded)
export async function getUserContext(userId: string): Promise<string> {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('name, email')
    .eq('id', userId)
    .single();

  const settings = await getSettings(userId);
  const name = user?.name || user?.email?.split('@')[0] || 'User';

  return `You are an AI daily planner assistant for ${name}.

Schedule settings:
- Work days: ${JSON.stringify(settings.work_days || [])}
- Work hours: ${settings.work_start || '9:00'} - ${settings.work_end || '18:30'}
- Gym days: ${JSON.stringify(settings.gym_days || [])}
- Gym hours: ${settings.gym_start || '19:00'} - ${settings.gym_end || '21:00'}
- Timezone: ${settings.timezone || 'Australia/Melbourne'}`;
}

// Get all users (for nightly run)
export async function getAllUsers(): Promise<{ id: string; email: string; name: string }[]> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, email, name')
    .eq('setup_completed', true);
  return data || [];
}
