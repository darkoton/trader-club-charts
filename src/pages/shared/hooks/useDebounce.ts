import { useEffect, useState } from "react";

/**
 * Returns `value` debounced by `delay` milliseconds.
 * Updates after the user stops changing `value` for `delay`.
 */
export default function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
