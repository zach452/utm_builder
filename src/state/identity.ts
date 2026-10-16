import { useCallback, useState } from 'react';

const KEY = 'hark-utm-identity';

export interface Identity {
  name: string;
  team: string;
}

function read(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Identity) : null;
    return v?.name ? v : null;
  } catch {
    return null;
  }
}

/** Who is building links, remembered in this browser and stamped on every saved link. */
export function useIdentity() {
  const [identity, setState] = useState<Identity | null>(read);
  const setIdentity = useCallback((next: Identity) => {
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private mode: the name lasts for this visit only.
    }
  }, []);
  return { identity, setIdentity };
}
