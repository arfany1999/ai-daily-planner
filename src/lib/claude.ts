import Anthropic from '@anthropic-ai/sdk';

const API_TIMEOUT_MS = 30000; // 30 second timeout

let client: Anthropic | null = null;
let aiAvailable = true;

export function getClaudeClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      aiAvailable = false;
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

export function isAiAvailable(): boolean {
  return aiAvailable && Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function generateWithClaude(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number }
): Promise<string> {
  if (!isAiAvailable()) {
    throw new Error('AI features are temporarily unavailable. Please try again later.');
  }

  const claude = getClaudeClient();

  // Race between the API call and a timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await claude.messages.create(
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens || 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal }
    );

    const block = response.content[0];
    if (block.type === 'text') {
      return block.text;
    }
    throw new Error('Unexpected response type from Claude');
  } catch (error) {
    if (error instanceof Error) {
      // Handle credit exhaustion
      if (error.message.includes('credit') || error.message.includes('billing') || error.message.includes('insufficient')) {
        aiAvailable = false;
        throw new Error('AI features are temporarily unavailable — API credit exhausted. The admin has been notified.');
      }
      // Handle timeout
      if (error.name === 'AbortError' || error.message.includes('abort')) {
        throw new Error('AI request timed out after 30 seconds. Using cached data if available.');
      }
      // Handle rate limiting
      if (error.message.includes('rate') || error.message.includes('429')) {
        throw new Error('AI rate limit reached. Please wait a moment and try again.');
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
