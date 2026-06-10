import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const HOLIDAY_DOC = 'hanukkah-2026';
const NIGHT_COUNT = 8;

export type GuideNight = {
  night: number;
  title: string;
  suggestion: string;
  songTitle: string | null;
  songLyrics: string | null;
  storySnippet: string | null;
  linkedItemId: string | null;
  holiday: string;
};

function toNight(night: number, data: Record<string, unknown>): GuideNight {
  return {
    night,
    title: String(data.title ?? `Night ${night}`),
    suggestion: String(data.suggestion ?? ''),
    songTitle: (data.songTitle as string | null) ?? null,
    songLyrics: (data.songLyrics as string | null) ?? null,
    storySnippet: (data.storySnippet as string | null) ?? null,
    linkedItemId: (data.linkedItemId as string | null) ?? null,
    holiday: String(data.holiday ?? 'hanukkah'),
  };
}

function nightsCollection() {
  if (!db) return null;
  return collection(doc(db, 'content', HOLIDAY_DOC), 'nights');
}

export const guideContentService = {
  async getNight(night: number): Promise<GuideNight | null> {
    if (!db || night < 1 || night > NIGHT_COUNT) return null;
    const snap = await getDoc(doc(db, 'content', HOLIDAY_DOC, 'nights', String(night)));
    if (!snap.exists()) return null;
    return toNight(night, snap.data() as Record<string, unknown>);
  },

  async listNights(): Promise<GuideNight[]> {
    const col = nightsCollection();
    if (!col) return [];
    const snap = await getDocs(col);
    const nights = snap.docs.map((d) => toNight(Number(d.id), d.data() as Record<string, unknown>));
    nights.sort((a, b) => a.night - b.night);
    if (nights.length >= NIGHT_COUNT) return nights.slice(0, NIGHT_COUNT);
    const byNum = new Map(nights.map((n) => [n.night, n]));
    const filled: GuideNight[] = [];
    for (let i = 1; i <= NIGHT_COUNT; i++) {
      filled.push(
        byNum.get(i) ?? {
          night: i,
          title: `Night ${i}`,
          suggestion: '',
          songTitle: null,
          songLyrics: null,
          storySnippet: null,
          linkedItemId: null,
          holiday: 'hanukkah',
        }
      );
    }
    return filled;
  },
};
