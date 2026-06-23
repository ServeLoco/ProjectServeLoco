import { useEffect, useState } from 'react';
import { getRealtimeConnectionState, subscribeRealtimeLifecycle } from '../api/realtimeClient';

/**
 * useRealtimeConnectionState
 * Subscribes to the realtime socket's connect/disconnect events and
 * returns the current connection state. Used by the Reconnecting pill.
 */
export function useRealtimeConnectionState() {
  const [state, setState] = useState(() => getRealtimeConnectionState());

  useEffect(() => {
    const unsub = subscribeRealtimeLifecycle((event) => {
      // subscribeRealtimeLifecycle strips the 'lifecycle.' prefix; the bare
      // names here are 'connected', 'reconnected', 'disconnected', and
      // 'foreground'.
      const name = event?.eventName;
      if (name === 'connected' || name === 'reconnected') {
        setState({ connected: true, hasSocket: true });
      } else if (name === 'disconnected') {
        setState({ connected: false, hasSocket: true });
      }
    });
    return unsub;
  }, []);

  return state;
}
