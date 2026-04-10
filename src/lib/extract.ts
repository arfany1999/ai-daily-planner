const MAX_CHARS = 15000;

// Extract text from a Canvas file by downloading and parsing it
export async function extractTextFromFile(
  fileUrl: string,
  contentType: string,
  filename: string,
  canvasToken?: string
): Promise<string> {
  const token = canvasToken || '';

  const res = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  let text = '';

  if (contentType === 'application/pdf' || filename.endsWith('.pdf')) {
    text = await extractPdf(buffer);
  } else if (
    contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    filename.endsWith('.docx')
  ) {
    text = await extractDocx(buffer);
  } else if (
    contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    filename.endsWith('.pptx')
  ) {
    text = await extractPptx(buffer);
  } else if (
    contentType === 'text/html' ||
    filename.endsWith('.html') ||
    filename.endsWith('.htm')
  ) {
    text = buffer.toString('utf-8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  } else if (
    contentType.startsWith('text/') ||
    filename.endsWith('.txt') ||
    filename.endsWith('.md')
  ) {
    text = buffer.toString('utf-8');
  } else {
    throw new Error(`Unsupported file type: ${contentType} (${filename})`);
  }

  return text.slice(0, MAX_CHARS);
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractPptx(buffer: Buffer): Promise<string> {
  // PPTX is a ZIP of XML slide files — extract text from <a:t> tags
  try {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const texts: string[] = [];

    for (const entry of entries) {
      if (entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml')) {
        const xml = entry.getData().toString('utf-8');
        // Extract text from <a:t> tags
        const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
        const slideText = matches.map((m) => m.replace(/<[^>]*>/g, '')).join(' ');
        if (slideText.trim()) texts.push(slideText.trim());
      }
    }

    return texts.join('\n\n');
  } catch {
    // Fallback: return empty
    return '';
  }
}

// Extract YouTube transcript
export async function extractYouTubeTranscript(videoUrl: string): Promise<string> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) throw new Error('Invalid YouTube URL');

  try {
    // Use YouTube's built-in timedtext API
    const listUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageRes = await fetch(listUrl);
    const pageHtml = await pageRes.text();

    // Extract captions track URL from page source
    const captionsMatch = pageHtml.match(/"captionTracks":\s*(\[[\s\S]*?\])/);
    if (!captionsMatch) return '';

    const tracks = JSON.parse(captionsMatch[1]);
    const englishTrack = tracks.find(
      (t: { languageCode: string }) => t.languageCode === 'en' || t.languageCode.startsWith('en')
    ) || tracks[0];

    if (!englishTrack?.baseUrl) return '';

    const captionRes = await fetch(englishTrack.baseUrl + '&fmt=srv3');
    const captionXml = await captionRes.text();

    // Extract text from XML
    const textMatches = captionXml.match(/<text[^>]*>([^<]*)<\/text>/g) || [];
    const transcript = textMatches
      .map((m) => m.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return transcript.slice(0, MAX_CHARS);
  } catch {
    return '';
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
}
