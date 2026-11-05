import { useCallback, useRef, useState } from 'react';

const LIMIT = 120;

export function useHistory<T>(initial: () => T) {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>(() => ({ past: [], present: initial(), future: [] }));
  const coalesce = useRef<string | null>(null);

  const set = useCallback((update: (current: T) => T, group?: string) => {
    setState((history) => {
      const next = update(history.present);
      if (next === history.present) {
        return history;
      }
      if (group && coalesce.current === group) {
        return { ...history, present: next };
      }
      coalesce.current = group ?? null;
      return { past: [...history.past, history.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const endGroup = useCallback(() => {
    coalesce.current = null;
  }, []);

  const undo = useCallback(() => {
    coalesce.current = null;
    setState((history) =>
      history.past.length ? { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] } : history
    );
  }, []);

  const redo = useCallback(() => {
    coalesce.current = null;
    setState((history) =>
      history.future.length ? { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) } : history
    );
  }, []);

  const reset = useCallback((value: T) => {
    coalesce.current = null;
    setState((history) => ({ past: [...history.past, history.present].slice(-LIMIT), present: value, future: [] }));
  }, []);

  return { doc: state.present, set, endGroup, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
