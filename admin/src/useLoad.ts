import { useCallback, useEffect, useState } from 'react';
import { errorText } from './api';
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { setLoading(true); setError(''); } });
    load().then(value => { if (active) setData(value); }).catch(error => { if (active) { setData(undefined); setError(errorText(error)); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, revision]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { data, error, loading, refresh };
}
