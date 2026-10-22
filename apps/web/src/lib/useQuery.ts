import { useEffect, useState } from 'react';

interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

/** Carga datos y los recarga cuando cambian las dependencias o se llama reload(). */
export function useQuery<T>(load: () => PromiseLike<Result<T>>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true }));
    load().then((r) => {
      if (!active) return;
      setState({ data: r.data, error: r.error ? r.error.message : null, loading: false });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
