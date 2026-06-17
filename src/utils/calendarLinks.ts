/** Build calendar links for Hanukkah milestones (panel Jun 17). */

export type CalendarEvent = {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
};

function formatGoogleDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(event.start)}/${formatGoogleDate(event.end)}`,
  });
  if (event.description) params.set('details', event.description);
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Apple / Outlook — subscribe via webcal ICS data URL on web; download on native. */
export function icsContent(event: CalendarEvent): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grapejuice//Hanukkah//EN',
    'BEGIN:VEVENT',
    `UID:${fmt(event.start)}@grapejuice.co`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(event.start)}`,
    `DTEND:${fmt(event.end)}`,
    `SUMMARY:${event.title.replace(/\n/g, ' ')}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function hanukkahCalendarEvents(options: {
  startsOn: string | null;
  lockAt: string | null;
  estimatedDeliveryBy: string | null;
}): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const year = 2026;

  if (options.startsOn) {
    const start = parseDateOnly(options.startsOn);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    events.push({
      title: 'Hanukkah begins — light the first candle',
      description: 'Your Grapejuice box has what you need for eight nights.',
      start,
      end,
    });
  }

  if (options.lockAt) {
    const lock = new Date(options.lockAt);
    const end = new Date(lock.getTime() + 60 * 60 * 1000);
    events.push({
      title: 'Customize your Hanukkah box by today',
      description: 'Last day to swap items before your box locks for shipping.',
      start: lock,
      end,
    });
  }

  if (options.estimatedDeliveryBy) {
    const delivery = parseDateOnly(options.estimatedDeliveryBy);
    const end = new Date(delivery);
    end.setDate(end.getDate() + 1);
    events.push({
      title: 'Hanukkah box estimated delivery',
      description: 'Your curated Grapejuice box should arrive around this date.',
      start: delivery,
      end,
    });
  } else if (!options.startsOn) {
    const start = parseDateOnly(`${year}-12-05`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    events.push({
      title: 'Hanukkah begins',
      start,
      end,
    });
  }

  return events;
}

function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0);
}
