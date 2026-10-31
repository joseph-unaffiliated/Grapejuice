/** Shared header, footer, and thumbnail row used by Grapejuice transactional notes. */

const WORDMARK =
  'https://storage.googleapis.com/grapejuice-pilot.firebasestorage.app/email/brand/grapejuice-wordmark-on-white-v1.jpg';
const WORDMARK_GOLD =
  'https://storage.googleapis.com/grapejuice-pilot.firebasestorage.app/email/brand/grapejuice-wordmark-gold-v1.png';

export type EmailThumb = { name: string; imageUrl: string; note?: string };

export function grapejuiceEmailHtml(input: {
  campaign: string;
  preheader: string;
  title: string;
  paragraphs: string[];
  thumbs?: EmailThumb[];
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const utm = `utm_source=transactional&amp;utm_medium=email&amp;utm_campaign=${input.campaign}`;
  const home = `https://grapejuice.co/?${utm}`;
  const thumbs = (input.thumbs ?? [])
    .map(
      (item) => `<td width="160" valign="top" style="padding:0 8px 16px;">
        <img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(item.name)}" width="144" style="display:block;width:144px;height:144px;object-fit:cover;border:0;border-radius:6px;background:#F4EEE4;" />
        <p style="letter-spacing:-0.02em;color:#2F2412;font-size:14px;line-height:1.4;margin:8px 0 0;">${escapeText(item.name)}</p>
        ${item.note ? `<p style="letter-spacing:-0.02em;color:#7A6F5E;font-size:13px;line-height:1.4;margin:4px 0 0;">${escapeText(item.note)}</p>` : ''}
      </td>`
    )
    .join('');
  const thumbRow = thumbs
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px auto 20px;"><tr>${thumbs}</tr></table>`
    : '';
  const body = input.paragraphs
    .map(
      (p) =>
        `<p style="letter-spacing:-0.02em;color:#433C32;text-align:center;margin:0 0 14px;">${escapeText(p)}</p>`
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeText(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#fefefe;">
  <span style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeText(input.preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fefefe;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#2F2412;font-size:16px;line-height:1.8;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
        <tr><td align="center" style="padding:32px 24px 8px;">
          <a href="${home}" style="text-decoration:none;display:inline-block;">
            <img src="${WORDMARK}" alt="Grapejuice" width="104" style="width:104px;border:0;" />
          </a>
        </td></tr>
        <tr><td style="padding:20px 40px 36px;">
          <h1 style="color:#2F2412;font-size:32px;line-height:1.1;letter-spacing:-0.03em;text-align:center;margin:0 0 28px;">${escapeText(input.title)}</h1>
          ${body}
          ${thumbRow}
          <div style="text-align:center;margin:36px 0 48px;">
            <a href="${escapeAttr(input.ctaUrl)}" style="display:inline-block;color:rgb(184, 172, 127);font-family:Helvetica,sans-serif;text-decoration:none;background-color:rgb(17, 24, 39);border-style:solid;border-color:rgb(184, 172, 127);border-width:0 4px 4px 0;border-radius:16px;"><span style="padding:20px 32px;display:block;">${escapeText(input.ctaLabel)}</span></a>
          </div>
          <p style="letter-spacing:-0.02em;color:#7A6F5E;font-size:14px;text-align:center;margin:28px 0 0;">Questions? Just reply to this email.</p>
        </td></tr>
        <tr><td align="center" style="background:rgb(17, 24, 39);border-radius:16px;padding:34px 32px 30px;">
          <a href="${home}" style="text-decoration:none;display:inline-block;margin:0 0 18px;">
            <img src="${WORDMARK_GOLD}" alt="Grapejuice" width="120" style="width:120px;border:0;" />
          </a>
          <p style="letter-spacing:-0.02em;color:rgb(184, 172, 127);font-size:12px;text-align:center;margin:0 0 16px;"><a href="${home}" style="color:rgb(184, 172, 127);text-decoration:none;">Shop</a> &nbsp;·&nbsp; <a href="https://grapejuice.co/story?${utm}" style="color:rgb(184, 172, 127);text-decoration:none;">Our story</a> &nbsp;·&nbsp; <a href="https://grapejuice.co/privacy" style="color:rgb(184, 172, 127);text-decoration:none;">Privacy</a></p>
          <p style="letter-spacing:-0.02em;color:rgb(184, 172, 127);font-size:12px;text-align:center;margin:0;">Grapejuice by Untraditional · <a href="mailto:hello@grapejuice.co" style="color:rgb(184, 172, 127);text-decoration:none;">hello@grapejuice.co</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
