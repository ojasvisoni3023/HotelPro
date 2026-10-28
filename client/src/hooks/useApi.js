import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data from an async function and tracks loading / error state.
 *   const { data, meta, loading, error, reload } = useApi(() => api.get('/x'), [dep]);
 * The loader must resolve to the API envelope ({ data, meta }).
 */
export default function useApi(loader, deps = [], { skip = false } = {}) {
  const [state, setState] = useState({ data: undefined, meta: undefined, loading: !skip, error: null });
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  // Keep the latest loader without re-running the request on every render.
  useEffect(() => {
    loaderRef.current = loader;
  });

  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await loaderRef.current();
      if (id === seq.current) setState({ data: res?.data, meta: res?.meta, loading: false, error: null });
      return res;
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (skip) return undefined;
    run();
    return () => {
      // Bumping the counter makes in-flight responses from the previous deps be ignored.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, skip]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: run, setData };
}
