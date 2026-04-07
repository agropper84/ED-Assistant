'use client';

import { SWRConfig } from 'swr';

/** Default fetcher — handles auth redirects automatically */
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Not authenticated');
  }
  if (res.status === 403) {
    window.location.href = '/pending';
    throw new Error('Not approved');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 5000,
        revalidateOnFocus: false,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
