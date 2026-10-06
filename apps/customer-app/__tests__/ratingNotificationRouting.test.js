/**
 * A tap on the "How was your food?" notification opens the Orders page
 * (Delivered tab, that order's day); every other order notification still
 * opens Order Detail.
 */
import { navigateFromNotificationData } from '../src/hooks/useLocalNotifications';

const readyRef = () => ({
  current: { isReady: () => true, navigate: jest.fn() },
});

describe('navigateFromNotificationData', () => {
  it('sends a rate_order tap to the Orders tab with the order and its day', () => {
    const ref = readyRef();
    navigateFromNotificationData(
      { type: 'info', orderId: '40', orderNumber: 'ORD-40', action: 'rate_order', orderDate: '2026-10-06' },
      ref,
    );
    expect(ref.current.navigate).toHaveBeenCalledWith('MainTabs', {
      screen: 'Orders',
      params: { rateOrderId: '40', date: '2026-10-06' },
    });
  });

  it('still opens Order Detail for a normal order push', () => {
    const ref = readyRef();
    navigateFromNotificationData({ type: 'success', orderId: '40', orderNumber: 'ORD-40' }, ref);
    expect(ref.current.navigate).toHaveBeenCalledWith('OrderDetail', { orderId: '40' });
  });

  it('ignores a rate_order tap without an order id', () => {
    const ref = readyRef();
    navigateFromNotificationData({ type: 'info', action: 'rate_order' }, ref);
    expect(ref.current.navigate).not.toHaveBeenCalled();
  });
});
