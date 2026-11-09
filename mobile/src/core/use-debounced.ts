import { useEffect, useState } from 'react';

/** The value after it stopped changing for `ms` (search boxes). */
export function useDebounced<T>(value: T, ms = 300) {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return out;
}
