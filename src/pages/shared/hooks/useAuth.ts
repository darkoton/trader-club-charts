import { useSyncExternalStore } from "react";
import {
  AUTH_CHANGED_EVENT,
  clearTerminalToken,
  fetchProfile,
  getTerminalToken,
  type UserProfile,
} from "../api/terminalAuth";

interface AuthSnapshot {
  user: UserProfile | null;
  isLoading: boolean;
}

interface AuthState extends AuthSnapshot {
  logout: () => void;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: AuthSnapshot = {
  user: null,
  isLoading: typeof window !== "undefined" && !!getTerminalToken(),
};
let refreshId = 0;

function setSnapshot(next: AuthSnapshot): void {
  if (snapshot.user === next.user && snapshot.isLoading === next.isLoading) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

async function refresh(): Promise<void> {
  const id = ++refreshId;
  const token = getTerminalToken();

  if (!token) {
    setSnapshot({ user: null, isLoading: false });
    return;
  }

  setSnapshot({ user: snapshot.user, isLoading: true });

  try {
    const profile = await fetchProfile();
    if (id !== refreshId) return;
    setSnapshot({ user: profile, isLoading: false });
  } catch {
    if (id !== refreshId) return;
    clearTerminalToken();
    setSnapshot({ user: null, isLoading: false });
  }
}

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    void refresh();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === "site-token") void refresh();
  });
  void refresh();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthSnapshot {
  return snapshot;
}

export default function useAuth(): AuthState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    user: state.user,
    isLoading: state.isLoading,
    logout: clearTerminalToken,
  };
}
