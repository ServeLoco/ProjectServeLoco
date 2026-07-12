/**
 * ADMIN TASK 9 — AdminNewOrderPopup: queue building from admin.order.created,
 * accept/cancel calling the right status mutation, and the auto-accepted
 * acknowledgement state from admin.order.auto_accepted.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminNewOrderPopup from '../src/screens/admin/AdminNewOrderPopup';

let orderCreatedHandler = null;
let autoAcceptedHandler = null;

jest.mock('../src/api', () => ({
  adminApi: { updateOrderStatus: jest.fn() },
  subscribeAdminOrderEvents: (handler) => {
    orderCreatedHandler = handler;
    return () => { orderCreatedHandler = null; };
  },
  subscribeAdminRealtime: (eventName, handler) => {
    if (eventName === 'admin.order.auto_accepted') autoAcceptedHandler = handler;
    return () => { autoAcceptedHandler = null; };
  },
}));

jest.mock('../src/hooks/useNewOrderAlert', () => ({
  useNewOrderAlert: () => {},
}));

const { adminApi } = require('../src/api');

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

function pushOrderCreated(payload) {
  act(() => {
    orderCreatedHandler?.({ eventName: 'admin.order.created', payload });
  });
}

describe('AdminNewOrderPopup', () => {
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    orderCreatedHandler = null;
    autoAcceptedHandler = null;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
  });

  it('renders nothing when the queue is empty', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminNewOrderPopup />);
    });
    expect(root.toJSON()).toBeNull();
  });

  it('shows a card for a new order and accepts it', async () => {
    adminApi.updateOrderStatus.mockResolvedValue({});

    await act(async () => {
      root = ReactTestRenderer.create(<AdminNewOrderPopup />);
    });

    pushOrderCreated({ orderId: 42, orderNumber: 'OD-42', customerName: 'Yash', total: 172, items: [{ quantity: 2, name: 'Milk' }] });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['New Order Received!', 'Yash']));

    const acceptBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Accept'))[0];
    await act(async () => {
      await acceptBtn.props.onPress();
    });

    expect(adminApi.updateOrderStatus).toHaveBeenCalledWith(42, 'Accepted', undefined);
    expect(root.toJSON()).toBeNull();
  });

  it('cancels with a default reason', async () => {
    adminApi.updateOrderStatus.mockResolvedValue({});

    await act(async () => {
      root = ReactTestRenderer.create(<AdminNewOrderPopup />);
    });
    pushOrderCreated({ orderId: 43, orderNumber: 'OD-43', customerName: 'Reza' });

    const cancelBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Cancel'))[0];
    await act(async () => {
      await cancelBtn.props.onPress();
    });

    expect(adminApi.updateOrderStatus).toHaveBeenCalledWith(43, 'Cancelled', 'Cancelled by admin');
  });

  it('dedupes a second event for the same orderId', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminNewOrderPopup />);
    });
    pushOrderCreated({ orderId: 42, orderNumber: 'OD-42', customerName: 'Yash' });
    pushOrderCreated({ orderId: 42, orderNumber: 'OD-42', customerName: 'Yash' });

    const texts = findAllText(root.root);
    // Only one card — no "2 new orders" queue bar should appear.
    expect(texts.join(' ')).not.toContain('new orders');
  });

  it('shows the auto-accepted state after admin.order.auto_accepted fires', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminNewOrderPopup />);
    });
    pushOrderCreated({ orderId: 44, orderNumber: 'OD-44', customerName: 'Reza' });

    act(() => {
      autoAcceptedHandler?.({ orderId: 44 });
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['Order #OD-44 auto-accepted']));
  });

  it('keeps a failed accept in the queue and shows the error', async () => {
    adminApi.updateOrderStatus.mockRejectedValue(new Error('network down'));

    await act(async () => {
      root = ReactTestRenderer.create(<AdminNewOrderPopup />);
    });
    pushOrderCreated({ orderId: 45, orderNumber: 'OD-45', customerName: 'Yash' });

    const acceptBtn = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('Accept'))[0];
    await act(async () => {
      await acceptBtn.props.onPress();
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['network down']));
    expect(root.toJSON()).not.toBeNull();
  });
});
