/**
 * One in-flight read per household, plus the last settled value so a screen can
 * paint immediately and still refresh when the read finishes.
 * A finished read does not block the next one. A read still running is shared.
 */
export function createHouseholdReadCache<T>(fetchForHousehold: (householdId: string) => Promise<T>) {
  type Slot = {
    householdId: string;
    promise: Promise<T> | null;
    result: T | null;
  };
  let slot: Slot | null = null;

  return {
    /** Last settled value for this household, if a read has finished. */
    peek(householdId: string): T | null {
      if (!householdId || slot?.householdId !== householdId) return null;
      return slot.result;
    },
    load(householdId: string, options?: { fresh?: boolean }): Promise<T> {
      if (!householdId) return Promise.reject(new Error('householdId is required'));
      if (!options?.fresh && slot?.householdId === householdId && slot.promise) return slot.promise;
      const promise = fetchForHousehold(householdId)
        .then((result) => {
          if (slot?.promise === promise) slot.result = result;
          return result;
        })
        .finally(() => {
          if (slot?.promise === promise) slot.promise = null;
        });
      slot = {
        householdId,
        promise,
        result: slot?.householdId === householdId ? slot.result : null,
      };
      return promise;
    },
  };
}
