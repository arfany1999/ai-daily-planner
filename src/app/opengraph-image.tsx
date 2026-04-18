/**
 * OG image for social previews — rendered at build time by Next.js.
 * https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'AI Planner — your chief-of-staff calendar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #000000 0%, #0E0D0B 50%, #14120F 100%)',
          position: 'relative',
          padding: 80,
        }}
      >
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: -100, left: -100,
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(196,118,74,0.25), transparent 70%)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -100, right: -100,
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(110,139,232,0.15), transparent 70%)',
          display: 'flex',
        }} />

        {/* Logo */}
        <div style={{
          width: 84, height: 84, borderRadius: 22,
          background: 'linear-gradient(135deg, #9E5A34, #E09268)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, fontWeight: 900, color: '#fff',
          boxShadow: '0 20px 60px rgba(196,118,74,0.4)',
          marginBottom: 36,
        }}>◈</div>

        {/* Headline */}
        <div style={{
          fontSize: 82, fontWeight: 800, color: '#F5F1EA',
          letterSpacing: -3, lineHeight: 1.05, textAlign: 'center', marginBottom: 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <span>Your chief of staff.</span>
          <span style={{ color: '#E09268' }}>On your calendar.</span>
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: 26, color: '#8B8274', letterSpacing: -0.5, textAlign: 'center',
          maxWidth: 900, lineHeight: 1.4, display: 'flex',
        }}>
          Plain-language planning · 1:1 Google Calendar mirror · Canvas · voice-ready
        </div>

        {/* Footer badge */}
        <div style={{
          position: 'absolute', bottom: 40, display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 18, color: '#5C5649', letterSpacing: 1,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: '#C4764A', display: 'flex' }} />
          aidaily.mrgren.store
        </div>
      </div>
    ),
    size,
  );
}
