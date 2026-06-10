import { useCallback, useEffect, useState } from 'react';
import {
  loadDismissedMyBoxHolidays,
  saveDismissedMyBoxHolidays,
} from '../lib/myBoxesDismissedStorage';

export function useMyBoxesDismissedHolidays() {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadDismissedMyBoxHolidays().then((ids) => {
      if (!active) return;
      setDismissed(ids);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      void saveDismissedMyBoxHolidays(next);
      return next;
    });
  }, []);

  const restore = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = prev.filter((holidayId) => holidayId !== id);
      void saveDismissedMyBoxHolidays(next);
      return next;
    });
  }, []);

  return { dismissed, dismiss, restore, loaded };
}
