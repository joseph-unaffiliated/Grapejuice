/**
 * Anthropic prompt-cache helpers for Rav.
 * @see https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 *
 * SDK 0.39 types CacheControlEphemeral as `{ type: 'ephemeral' }` only; the API
 * also accepts `ttl: '5m' | '1h'`. We pass ttl through for 1h curator prefixes.
 */

export type CacheTtl = '5m' | '1h';

/** Text system block marked for prompt caching. Default TTL is Anthropic's 5 minutes. */
export function cachedText(text: string, ttl: CacheTtl = '5m') {
  return {
    type: 'text' as const,
    text,
    cache_control: {
      type: 'ephemeral' as const,
      ...(ttl === '1h' ? { ttl: '1h' as const } : {}),
    },
  };
}

/** Plain system text block (not cached) — per-user / per-surface context. */
export function plainText(text: string) {
  return { type: 'text' as const, text };
}

export type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Compact usage line for confirming cache hits after deploy. */
export function formatCacheUsage(usage: AnthropicUsageLike | undefined | null): Record<string, number> {
  return {
    input: Number(usage?.input_tokens ?? 0),
    output: Number(usage?.output_tokens ?? 0),
    cacheCreation: Number(usage?.cache_creation_input_tokens ?? 0),
    cacheRead: Number(usage?.cache_read_input_tokens ?? 0),
  };
}
