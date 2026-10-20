/**
 * Smoke: curator-shaped prompt caching (write then read) against live ANTHROPIC_API_KEY.
 *   NODE_PATH=functions/node_modules npx tsx scripts/rav-cache-smoke.ts
 */
import { execSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { cachedText, formatCacheUsage } from '../functions/src/rav/anthropicCache';
import { BOX_CURATOR_JSON_INSTRUCTIONS, BOX_CURATOR_SYSTEM } from '../functions/src/rav/modes/boxCurator';
import { PRESENCE_APPEND } from '../functions/src/rav/presence';
import { PLAIN_TALK_APPEND } from '../functions/src/rav/plainTalk';

async function main() {
  const key = execSync(
    'npx firebase-tools functions:secrets:access ANTHROPIC_API_KEY --project grapejuice-pilot',
    { encoding: 'utf8' }
  ).trim();
  // Pad CONTEXT so the cached prefix clears Sonnet 4.6's 1,024-token minimum without Firestore.
  const pad = Array.from(
    { length: 80 },
    (_, i) => `rule-${i}: placeholder box construction note for cache size`
  ).join('\n');
  const system = [
    cachedText(
      `${BOX_CURATOR_SYSTEM}${PRESENCE_APPEND}${PLAIN_TALK_APPEND}\n\n${BOX_CURATOR_JSON_INSTRUCTIONS}`,
      '1h'
    ),
    cachedText(`---\nCONTEXT (use when relevant; do not recite verbatim):\n${pad}`, '1h'),
  ];
  const anthropic = new Anthropic({ apiKey: key });
  const call = async (label: string) => {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 64,
      system,
      messages: [
        {
          role: 'user',
          content:
            'adults: 2\nkids: (none)\nbaseline: empty\ndeviations: (none)\nallowedSwaps: (none)\n\nReturn empty notes and actions.',
        },
      ],
    });
    console.log(label, formatCacheUsage(response.usage));
  };
  await call('first');
  await call('second');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
