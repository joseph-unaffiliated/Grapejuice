import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useFirebaseReady(): { ready: boolean; error: string | null; projectId: string | null } {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectId = db?.app?.options?.projectId ?? null;

  useEffect(() => {
    if (!db) {
      setError('Firebase not configured — check pilot-app/.env');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await getDoc(doc(db, 'config', 'hanukkah-2026'));
        // Also verify content path exists after seed (optional; config is enough)
        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error, projectId };
}
