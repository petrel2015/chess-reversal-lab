"use client";

import { useCallback, useSyncExternalStore } from "react";

// SSR 安全的 matchMedia 订阅：服务端快照恒为 false（窄屏形态），
// 水合后由 useSyncExternalStore 切换到真实值，无水合不一致风险；
// jsdom 等无 matchMedia 的环境同样回退 false
function subscribeMedia(query: string, onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(query);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeMedia(query, onChange),
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : false,
    () => false,
  );
}
