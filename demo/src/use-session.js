import { useSyncExternalStore } from 'react';
import { createSession } from './session';
export const session = createSession();
export function useSession() {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
