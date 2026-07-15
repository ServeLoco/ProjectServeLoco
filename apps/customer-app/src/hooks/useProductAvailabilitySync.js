import { useEffect } from 'react';
import { subscribeProductAvailabilityEvents } from '../api/realtimeClient';
import { invalidate } from '../utils/apiCache';
import { useCartStore } from '../stores';
import { showToast } from '../components/Toast';

/**
 * When a shop/admin marks a product out of stock (or back in stock):
 *  - OOS → drop matching cart lines immediately + toast
 *  - any change → bust product/dashboard SWR caches so Home revalidates
 *
 * Screens (Home / ProductList) also subscribe to filter local product lists
 * live so the customer does not wait for the next pull-to-refresh.
 */
function useProductAvailabilitySync() {
  useEffect(() => {
    const unsubscribe = subscribeProductAvailabilityEvents(({ payload }) => {
      const productId = payload?.productId ?? payload?.id;
      if (productId == null || productId === '') return;

      const available = payload?.available;
      // Bust caches so next silent/focus revalidate sees the new flag.
      invalidate('products:');
      invalidate('product:');
      invalidate('dashboard:');
      invalidate('categories:');

      if (available === false || available === 0 || available === '0') {
        const removed = useCartStore.getState().removeUnavailableItems([
          { productId, type: 'product' },
          { productId, type: 'combo' },
        ]);
        if (removed.length > 0) {
          const names = removed.map((item) => item.product?.name).filter(Boolean);
          const label = names.length === 1 ? names[0] : `${names.length} items`;
          showToast(`${label} removed — out of stock`, { type: 'info' });
        }
      }
    });

    return unsubscribe;
  }, []);
}

export { useProductAvailabilitySync };
export default useProductAvailabilitySync;
