import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-handler';
import { validateUrl } from '@/lib/connections';

// Login/auth wall indicators in HTML
const AUTH_WALL_PATTERNS = [
  /name=["']password["']/i,
  /type=["']password["']/i,
  /sign.?in/i,
  /log.?in/i,
  /<form[^>]*action[^>]*auth/i,
  /id=["']login/i,
  /class=["'][^"']*login/i,
  /401|403|unauthorized|forbidden/i,
];

// RSS/Atom detection patterns
const RSS_PATTERNS = [
  /<rss[\s>]/i,
  /<feed[\s>]/i,
  /<channel[\s>]/i,
  /xmlns:atom/i,
  /application\/rss\+xml/i,
  /application\/atom\+xml/i,
];

interface TestResult {
  status: 'success' | 'auth_wall' | 'error';
  message: string;
  detected_type: 'public' | 'rss' | 'needs_auth' | 'unknown';
  content_preview?: string;
  suggestion?: string;
  rss_entries?: number;
}

export const POST = withAuth(async (req) => {
  const { url, type, api_key, header_name } = await req.json();

  if (!url?.trim()) {
    return NextResponse.json({ status: 'error', message: 'URL is required' } as TestResult, { status: 400 });
  }

  const urlCheck = validateUrl(url);
  if (!urlCheck.valid) {
    return NextResponse.json({ status: 'error', message: urlCheck.error, detected_type: 'unknown' } as TestResult, { status: 400 });
  }

  try {
    if (type === 'api_key') {
      return NextResponse.json(await testApiWithKey(url, api_key, header_name));
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIPlannerBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    const statusCode = res.status;
    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();

    if (statusCode === 401 || statusCode === 403) {
      return NextResponse.json({
        status: 'auth_wall',
        message: `Server returned ${statusCode}. This site requires authentication.`,
        detected_type: 'needs_auth',
        suggestion: "Try switching to 'API with key' if the service has an API, or use a different publicly accessible URL.",
      } as TestResult);
    }

    if (statusCode !== 200) {
      return NextResponse.json({
        status: 'error',
        message: `Server returned HTTP ${statusCode}.`,
        detected_type: 'unknown',
        suggestion: 'Check the URL and try again.',
      } as TestResult);
    }

    const isRssContent = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom');
    const hasRssStructure = RSS_PATTERNS.some((p) => p.test(body.slice(0, 2000)));

    if (isRssContent || hasRssStructure) {
      const rssItems = (body.match(/<item[\s>]/gi) || []).length;
      const atomEntries = (body.match(/<entry[\s>]/gi) || []).length;
      const entryCount = rssItems + atomEntries;

      if (entryCount > 0) {
        const titleMatch = body.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const preview = titleMatch?.[1]?.trim().slice(0, 100) || '';

        return NextResponse.json({
          status: 'success',
          message: `Valid RSS/Atom feed found with ${entryCount} entries.`,
          detected_type: 'rss',
          content_preview: preview ? `Latest: "${preview}"` : undefined,
          rss_entries: entryCount,
        } as TestResult);
      }
    }

    if (type === 'rss' && !hasRssStructure) {
      return NextResponse.json({
        status: 'error',
        message: "This doesn't look like an RSS feed \u2014 got HTML instead of XML.",
        detected_type: 'public',
        suggestion: "Try the full website URL with 'Public website' type instead, or find the feed URL (usually /feed, /rss, or /atom.xml).",
      } as TestResult);
    }

    const isAuthWall = AUTH_WALL_PATTERNS.some((p) => p.test(body.slice(0, 5000)));

    const textContent = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const hasSubstantialContent = textContent.length > 200;

    if (isAuthWall && !hasSubstantialContent) {
      return NextResponse.json({
        status: 'auth_wall',
        message: 'This site seems to require login \u2014 detected a sign-in form.',
        detected_type: 'needs_auth',
        suggestion: "Try switching to 'API with key' if the service has an API, or paste a different URL that's publicly accessible.",
      } as TestResult);
    }

    if (!hasSubstantialContent) {
      return NextResponse.json({
        status: 'auth_wall',
        message: 'Very little text content found. This page may require JavaScript or authentication.',
        detected_type: 'needs_auth',
        suggestion: "Some sites load content with JavaScript and can't be scraped. Try a different URL, or check if they offer an RSS feed or API.",
      } as TestResult);
    }

    const preview = textContent.slice(0, 150).trim();
    return NextResponse.json({
      status: 'success',
      message: `Content found \u2014 this site is publicly accessible.`,
      detected_type: 'public',
      content_preview: preview ? `"${preview}..."` : undefined,
    } as TestResult);

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';

    if (msg.includes('timeout') || msg.includes('abort')) {
      return NextResponse.json({
        status: 'error',
        message: "Connection timed out \u2014 the server didn't respond in time.",
        detected_type: 'unknown',
        suggestion: 'Check the URL and try again. Some sites block automated requests.',
      } as TestResult);
    }

    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      return NextResponse.json({
        status: 'error',
        message: "Couldn't find this website \u2014 DNS lookup failed.",
        detected_type: 'unknown',
        suggestion: 'Check the URL for typos and try again.',
      } as TestResult);
    }

    return NextResponse.json({
      status: 'error',
      message: `Couldn't reach this URL: ${msg}`,
      detected_type: 'unknown',
      suggestion: 'Check the address and try again.',
    } as TestResult);
  }
});

async function testApiWithKey(url: string, apiKey?: string, headerName?: string): Promise<TestResult> {
  if (!apiKey?.trim()) {
    return { status: 'error', message: 'API key is required for this connection type.', detected_type: 'needs_auth' };
  }

  try {
    const header = headerName || 'Authorization';
    const value = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;

    const res = await fetch(url, {
      headers: { [header]: value, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        status: 'error',
        message: `Authentication failed (HTTP ${res.status}) \u2014 check your API key.`,
        detected_type: 'needs_auth',
        suggestion: 'Verify the API key is correct and has the right permissions.',
      };
    }

    if (!res.ok) {
      return {
        status: 'error',
        message: `API returned HTTP ${res.status}.`,
        detected_type: 'unknown',
        suggestion: 'Check the endpoint URL and API key.',
      };
    }

    const contentType = res.headers.get('content-type') || '';
    const preview = contentType.includes('json')
      ? JSON.stringify(await res.json()).slice(0, 150)
      : (await res.text()).slice(0, 150);

    return {
      status: 'success',
      message: 'API key verified \u2014 connection successful.',
      detected_type: 'public',
      content_preview: preview ? `Response: "${preview}..."` : undefined,
    };

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: 'error',
      message: `Couldn't reach API: ${msg}`,
      detected_type: 'unknown',
      suggestion: 'Check the endpoint URL and try again.',
    };
  }
}
