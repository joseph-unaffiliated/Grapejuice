/**
 * Generative padding expand for tight catalog product photos (PDP cover crops).
 * Uses fal-ai/nano-banana-pro/edit to add seamless studio backdrop around the product.
 *
 * Usage:
 *   FAL_KEY=... node scripts/expand-catalog-pdp-padding.mjs <imageUrl> [outPath]
 *
 * Re-upload the result to Airtable Primary/Other Images (or Storage) after review.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const imageUrl = process.argv[2];
  const outPath = process.argv[3] || path.join(process.cwd(), 'expanded-pdp.png');
  if (!imageUrl) {
    console.error('Usage: node scripts/expand-catalog-pdp-padding.mjs <imageUrl> [outPath]');
    process.exit(1);
  }
  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) {
    console.error('Set FAL_KEY');
    process.exit(1);
  }

  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: key });

  const prompt =
    'Generative expand / outpaint this exact product photo to a square catalog frame with ' +
    'generous breathing room around the object. Keep the product identical (shape, materials, ' +
    'lighting, color). Extend only the seamless light studio backdrop so the product sits with ' +
    'comfortable padding — not cropped tight to the edges. Photoreal, no props added, no text.';

  const result = await fal.subscribe('fal-ai/nano-banana-pro/edit', {
    input: {
      prompt,
      image_urls: [imageUrl],
      num_images: 1,
      aspect_ratio: '1:1',
      output_format: 'png',
      resolution: '2K',
      safety_tolerance: '5',
      limit_generations: true,
    },
    logs: true,
  });

  const url = result?.data?.images?.[0]?.url || result?.images?.[0]?.url;
  if (!url) {
    console.error('No image in result', JSON.stringify(result).slice(0, 500));
    process.exit(1);
  }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log('wrote', outPath, buf.length, 'from', url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
