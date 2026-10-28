import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const HotelScopeContext = createContext(null);
const KEY = 'hp.selectedHotel';

function readStored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** For staff/manager/admin screens: which hotel is being operated. Server still enforces access. */
export function HotelScopeProvider({ children }) {
  const { user } = useAuth();
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(readStored);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/manage/hotels');
      setHotels(res.data);
      setError(null);
      setSelected((cur) => (res.data.some((h) => h._id === cur) ? cur : res.data[0]?._id ?? null));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && ['staff', 'manager', 'admin'].includes(user.role)) load();
  }, [user, load]);

  const choose = useCallback((id) => {
    setSelected(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage unavailable: selection lasts for this session only */
    }
  }, []);

  const value = useMemo(
    () => ({ hotels, hotelId: selected, hotel: hotels.find((h) => h._id === selected) ?? null, setHotelId: choose, loading, error, reload: load }),
    [hotels, selected, choose, loading, error, load]
  );
  return <HotelScopeContext.Provider value={value}>{children}</HotelScopeContext.Provider>;
}

export function useHotelScope() {
  const ctx = useContext(HotelScopeContext);
  if (!ctx) throw new Error('useHotelScope must be used inside <HotelScopeProvider>');
  return ctx;
}
