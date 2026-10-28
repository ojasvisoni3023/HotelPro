import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const ConfigContext = createContext({ config: null, loading: true });

/** Public platform configuration: policy text, tax rate, payment mode, hotel "today". */
export function ConfigProvider({ children }) {
  const [state, setState] = useState({ config: null, loading: true, error: null });
  useEffect(() => {
    api
      .get('/config')
      .then((res) => setState({ config: res.data, loading: false, error: null }))
      .catch((error) => setState({ config: null, loading: false, error }));
  }, []);
  return <ConfigContext.Provider value={state}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  return useContext(ConfigContext);
}
