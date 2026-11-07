'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SalePreviewInput, SalePreviewResult } from '@mm/domain';
import { SalePreviewRequest } from './sale-stock';

const FRESH_MS = 30_000;
export function useSalePreview(
  key: string,
  input: () => SalePreviewInput | null,
  enabled: boolean,
) {
  const current = useRef({ key, input, enabled });
  current.current = { key, input, enabled };
  const request = useRef(new SalePreviewRequest());
  const [state, setState] = useState<{
    key: string;
    result: SalePreviewResult | null;
    loading: boolean;
    error: string;
    expiresAt: number;
  }>({ key: '', result: null, loading: false, error: '', expiresAt: 0 });
  const check = useCallback(async (override?: SalePreviewInput) => {
    const snapshot = current.current;
    const body = override ?? snapshot.input();
    if (!snapshot.enabled || !body) return null;
    setState((previous) => ({
      ...previous,
      key: snapshot.key,
      loading: true,
      error: '',
      expiresAt: 0,
    }));
    try {
      const result = await request.current.read(body);
      if (!result || current.current.key !== snapshot.key || !current.current.enabled) return null;
      setState({
        key: snapshot.key,
        result,
        loading: false,
        error: '',
        expiresAt: Date.now() + FRESH_MS,
      });
      return result;
    } catch (error) {
      if (current.current.key === snapshot.key && current.current.enabled)
        setState({
          key: snapshot.key,
          result: null,
          loading: false,
          error: error instanceof Error ? error.message : 'No se pudo comprobar la mercancía.',
          expiresAt: 0,
        });
      return null;
    }
  }, []);
  useEffect(() => {
    request.current.cancel();
    if (!enabled || !current.current.input()) {
      setState({ key, result: null, loading: false, error: '', expiresAt: 0 });
      return;
    }
    setState((previous) => ({
      ...previous,
      key,
      loading: true,
      result: null,
      error: '',
      expiresAt: 0,
    }));
    const timer = window.setTimeout(() => void check(), 250);
    const refresh = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const interval = window.setInterval(refresh, FRESH_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      request.current.cancel();
    };
  }, [key, enabled, check]);
  const matches = state.key === key;
  return {
    result: matches ? state.result : null,
    loading: enabled && (!matches || state.loading),
    error: matches ? state.error : '',
    fresh: enabled && matches && !state.loading && !state.error && state.expiresAt > Date.now(),
    check,
  };
}
