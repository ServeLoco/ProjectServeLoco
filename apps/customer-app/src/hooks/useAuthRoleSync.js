import { useEffect } from 'react';
import { subscribeAuthRoleEvents } from '../api/realtimeClient';
import { useAuthStore } from '../stores';

/**
 * When admin deletes/deactivates a shop owner or rider, the server emits
 * `auth.role.updated` to that user. Clear shop/rider in the auth store so
 * RootNavigator switches to CustomerNavigator without forcing re-login.
 *
 * Payload fields are partial — only present keys are applied.
 *   { shop: null, reason: 'shop_deleted' }
 *   { rider: null, reason: 'rider_deleted' }
 */
export function useAuthRoleSync() {
  useEffect(() => {
    const unsub = subscribeAuthRoleEvents(({ payload }) => {
      if (!payload || typeof payload !== 'object') return;
      const updates = {};
      if (Object.prototype.hasOwnProperty.call(payload, 'shop')) {
        updates.shop = payload.shop || null;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'rider')) {
        updates.rider = payload.rider || null;
      }
      if (Object.keys(updates).length === 0) return;
      useAuthStore.setState(updates);
    });
    return unsub;
  }, []);
}

export default useAuthRoleSync;
