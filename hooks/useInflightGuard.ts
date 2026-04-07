import { useState, useCallback } from 'react';

/**
 * Prevents duplicate AI generation requests.
 * Returns [isInflight, guard] where guard wraps an async fn
 * and prevents concurrent invocations.
 */
export function useInflightGuard(): [boolean, (fn: () => Promise<void>) => Promise<void>] {
  const [inflight, setInflight] = useState(false);

  const guard = useCallback(async (fn: () => Promise<void>) => {
    if (inflight) return;
    setInflight(true);
    try {
      await fn();
    } finally {
      setInflight(false);
    }
  }, [inflight]);

  return [inflight, guard];
}
