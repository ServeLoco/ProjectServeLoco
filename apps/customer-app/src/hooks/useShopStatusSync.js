import { useEffect } from 'react';
import { subscribeShopEvents } from '../api/realtimeClient';
import { useCartStore } from '../stores';
import { showToast } from '../components/Toast';

// Global, always-mounted listener for shop.status.updated. When a shop
// closes (or goes inactive) mid-session, any cart lines belonging to that
// shop are dropped immediately — otherwise the item would sit in the cart
// looking orderable until checkout rejects it (or a screen happens to
// re-fetch and disable the Buy button).
function useShopStatusSync() {
  useEffect(() => {
    const unsubscribe = subscribeShopEvents(({ payload }) => {
      const shopId = payload?.shopId;
      const isOpen = payload?.isOpen;
      if (shopId === undefined || shopId === null || isOpen !== false) return;

      const removed = useCartStore.getState().removeItemsByShop(shopId);
      if (removed.length > 0) {
        const names = removed.map(item => item.product?.name).filter(Boolean);
        const label = names.length === 1 ? names[0] : `${names.length} items`;
        showToast(`${label} removed — shop just closed`, { type: 'info' });
      }
    });

    return unsubscribe;
  }, []);
}

export { useShopStatusSync };
