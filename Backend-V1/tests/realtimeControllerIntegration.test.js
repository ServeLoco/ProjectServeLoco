jest.mock('../src/db/mysql', () => ({
  pool: {
    query: jest.fn(),
    getConnection: jest.fn(),
  },
}));

jest.mock('../src/realtime/orderEvents', () => ({
  emitOrderCreated: jest.fn(),
  emitOrderCancelled: jest.fn(),
  emitOrderStatusUpdated: jest.fn(),
  emitOrderPaymentUpdated: jest.fn(),
  emitNotificationCreated: jest.fn(),
}));

jest.mock('../src/utils/notificationService', () => ({
  createOrderNotification: jest.fn(),
}));

jest.mock('../src/utils/thresholdDelivery', () => ({
  calculateThresholdDeliveryCharge: jest.fn(() => ({
    charge: 30,
    belowThreshold: false,
    belowThresholdCharge: 0,
    message: 'Standard delivery',
  })),
}));

jest.mock('../src/utils/money', () => ({
  roundMoney: (v) => Math.round(v * 100) / 100,
  toMoney: (v) => Number(v),
}));

const { pool } = require('../src/db/mysql');
const realtimeEvents = require('../src/realtime/orderEvents');
const notificationService = require('../src/utils/notificationService');
const { calculateThresholdDeliveryCharge } = require('../src/utils/thresholdDelivery');

const orderController = require('../src/controllers/orderController');
const adminController = require('../src/controllers/adminController');

const mockRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
};

const mockConnection = () => ({
  query: jest.fn(),
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
});

describe('Controller -> realtime event integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('orderController.createOrder', () => {
    it('emits emitOrderCreated after successful order creation', async () => {
      const conn = mockConnection();
      pool.getConnection.mockResolvedValue(conn);

      // SELECT user
      conn.query.mockResolvedValueOnce([[{ id: 1, name: 'Test', phone: '123', whatsapp_number: '123', blocked: 0, address: 'Addr' }]]);
      // SELECT settings
      conn.query.mockResolvedValueOnce([[{ shop_open: 1, delivery_available: 1, night_charge: 0 }]]);
      // SELECT product
      conn.query.mockResolvedValueOnce([[{ id: 10, name: 'Burger', price: 100, available: 1, deleted: 0 }]]);
      // INSERT order
      conn.query.mockResolvedValueOnce([{ insertId: 500 }]);
      // INSERT order_items
      conn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      notificationService.createOrderNotification.mockResolvedValue({ insertId: 200 });

      const req = {
        user: { id: 1 },
        validatedData: {
          address: 'Test Address',
          items: [{ product_id: 10, quantity: 2 }],
          payment_method: 'Cash',
        },
      };
      const res = mockRes();

      await orderController.createOrder(req, res);

      expect(res.statusCode).toBe(201);
      expect(realtimeEvents.emitOrderCreated).toHaveBeenCalledTimes(1);
      expect(realtimeEvents.emitOrderCreated).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 1, status: 'Pending' })
      );
    });

    it('emits emitNotificationCreated for order_placed event', async () => {
      const conn = mockConnection();
      pool.getConnection.mockResolvedValue(conn);

      conn.query.mockResolvedValueOnce([[{ id: 1, name: 'Test', phone: '123', whatsapp_number: '123', blocked: 0, address: 'Addr' }]]);
      conn.query.mockResolvedValueOnce([[{ shop_open: 1, delivery_available: 1, night_charge: 0 }]]);
      conn.query.mockResolvedValueOnce([[{ id: 10, name: 'Burger', price: 100, available: 1, deleted: 0 }]]);
      conn.query.mockResolvedValueOnce([{ insertId: 501 }]);
      conn.query.mockResolvedValueOnce([{ insertId: 1 }]);

      const notifResult = { insertId: 201 };
      notificationService.createOrderNotification.mockReturnValue(Promise.resolve(notifResult));

      const req = {
        user: { id: 1 },
        validatedData: {
          address: 'Test Address',
          items: [{ product_id: 10, quantity: 1 }],
          payment_method: 'UPI',
        },
      };
      const res = mockRes();

      await orderController.createOrder(req, res);

      expect(notificationService.createOrderNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, event: 'order_placed' })
      );
      expect(realtimeEvents.emitNotificationCreated).toHaveBeenCalled();
    });
  });

  describe('orderController.cancelOrder', () => {
    it('emits emitOrderCancelled when order is cancelled', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 600, customer_id: 1, status: 'Pending', order_number: 'OD-TEST',
        payment_status: 'Pending', total: 200,
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      notificationService.createOrderNotification.mockReturnValue(Promise.resolve({ insertId: 202 }));

      const req = { user: { id: 1 }, params: { id: 600 }, body: { reason: 'Changed mind' } };
      const res = mockRes();

      await orderController.cancelOrder(req, res);

      expect(res.statusCode).toBe(200);
      expect(realtimeEvents.emitOrderCancelled).toHaveBeenCalledTimes(1);
      expect(realtimeEvents.emitOrderCancelled).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Cancelled', cancel_reason: 'Changed mind' })
      );
    });

    it('emits notification for cancelled order', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 601, customer_id: 2, status: 'Pending', order_number: 'OD-TEST2',
        payment_status: 'Pending', total: 300,
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      notificationService.createOrderNotification.mockReturnValue(Promise.resolve({ insertId: 203 }));

      const req = { user: { id: 2 }, params: { id: 601 }, body: {} };
      const res = mockRes();

      await orderController.cancelOrder(req, res);

      expect(notificationService.createOrderNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 2, event: 'status_cancelled' })
      );
      expect(realtimeEvents.emitNotificationCreated).toHaveBeenCalled();
    });

    it('does not emit when order is not in Pending status', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 602, customer_id: 1, status: 'Accepted', order_number: 'OD-TEST3',
      }]]);

      const req = { user: { id: 1 }, params: { id: 602 }, body: {} };
      const res = mockRes();

      await orderController.cancelOrder(req, res);

      expect(res.statusCode).toBe(400);
      expect(realtimeEvents.emitOrderCancelled).not.toHaveBeenCalled();
    });
  });

  describe('adminController.updateOrderStatus', () => {
    it('emits emitOrderStatusUpdated when status changes', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 700, status: 'Pending', customer_id: 1, order_number: 'OD-700',
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.query.mockResolvedValueOnce([[{
        id: 700, status: 'Accepted', customer_id: 1, order_number: 'OD-700',
        payment_status: 'Pending', total: 250,
      }]]);

      notificationService.createOrderNotification.mockReturnValue(Promise.resolve({ insertId: 204 }));

      const req = { params: { id: 700 }, body: { status: 'Accepted' } };
      const res = mockRes();

      await adminController.updateOrderStatus(req, res);

      expect(res.statusCode).toBe(200);
      expect(realtimeEvents.emitOrderStatusUpdated).toHaveBeenCalledTimes(1);
      expect(realtimeEvents.emitOrderStatusUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Accepted' })
      );
    });

    it('does not emit when status has not changed (same status rejected as non-forward)', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 701, status: 'Pending', customer_id: 1,
      }]]);

      const req = { params: { id: 701 }, body: { status: 'Pending' } };
      const res = mockRes();

      await adminController.updateOrderStatus(req, res);

      expect(res.statusCode).toBe(400);
      expect(realtimeEvents.emitOrderStatusUpdated).not.toHaveBeenCalled();
    });

    it('does not emit when order is in terminal state', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 702, status: 'Delivered', customer_id: 1,
      }]]);

      const req = { params: { id: 702 }, body: { status: 'Accepted' } };
      const res = mockRes();

      await adminController.updateOrderStatus(req, res);

      expect(res.statusCode).toBe(400);
      expect(realtimeEvents.emitOrderStatusUpdated).not.toHaveBeenCalled();
    });

    it('does not allow backward status progression', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 703, status: 'Out for Delivery', customer_id: 1,
      }]]);

      const req = { params: { id: 703 }, body: { status: 'Preparing' } };
      const res = mockRes();

      await adminController.updateOrderStatus(req, res);

      expect(res.statusCode).toBe(400);
      expect(realtimeEvents.emitOrderStatusUpdated).not.toHaveBeenCalled();
    });

    it('emits notification for status change events', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 704, status: 'Accepted', customer_id: 3, order_number: 'OD-704',
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.query.mockResolvedValueOnce([[{
        id: 704, status: 'Preparing', customer_id: 3, order_number: 'OD-704',
        payment_status: 'Pending', total: 150,
      }]]);

      notificationService.createOrderNotification.mockReturnValue(Promise.resolve({ insertId: 205 }));

      const req = { params: { id: 704 }, body: { status: 'Preparing' } };
      const res = mockRes();

      await adminController.updateOrderStatus(req, res);

      expect(notificationService.createOrderNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 3, event: 'status_preparing' })
      );
    });

    it('allows cancelling from any non-terminal state', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 705, status: 'Out for Delivery', customer_id: 4, order_number: 'OD-705',
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.query.mockResolvedValueOnce([[{
        id: 705, status: 'Cancelled', customer_id: 4, order_number: 'OD-705',
        payment_status: 'Pending', total: 400,
      }]]);

      notificationService.createOrderNotification.mockReturnValue(Promise.resolve({ insertId: 206 }));

      const req = { params: { id: 705 }, body: { status: 'Cancelled' } };
      const res = mockRes();

      await adminController.updateOrderStatus(req, res);

      expect(res.statusCode).toBe(200);
      expect(realtimeEvents.emitOrderStatusUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Cancelled' })
      );
    });
  });

  describe('adminController.updateOrderPayment', () => {
    it('emits emitOrderPaymentUpdated when payment status changes', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 800, payment_status: 'Pending', status: 'Pending', customer_id: 1, order_number: 'OD-800',
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.query.mockResolvedValueOnce([[{
        id: 800, payment_status: 'Paid', status: 'Pending', customer_id: 1, order_number: 'OD-800',
        total: 350,
      }]]);

      notificationService.createOrderNotification.mockReturnValue(Promise.resolve({ insertId: 207 }));

      const req = { params: { id: 800 }, body: { payment_status: 'Paid' } };
      const res = mockRes();

      await adminController.updateOrderPayment(req, res);

      expect(res.statusCode).toBe(200);
      expect(realtimeEvents.emitOrderPaymentUpdated).toHaveBeenCalledTimes(1);
      expect(realtimeEvents.emitOrderPaymentUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ payment_status: 'Paid' })
      );
    });

    it('does not emit when payment status has not changed', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 801, payment_status: 'Pending', status: 'Accepted', customer_id: 1,
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.query.mockResolvedValueOnce([[{
        id: 801, payment_status: 'Pending', status: 'Accepted', customer_id: 1,
      }]]);

      const req = { params: { id: 801 }, body: { payment_status: 'Pending' } };
      const res = mockRes();

      await adminController.updateOrderPayment(req, res);

      expect(res.statusCode).toBe(200);
      expect(realtimeEvents.emitOrderPaymentUpdated).not.toHaveBeenCalled();
    });

    it('does not emit when order is cancelled', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 802, payment_status: 'Pending', status: 'Cancelled', customer_id: 1,
      }]]);

      const req = { params: { id: 802 }, body: { payment_status: 'Paid' } };
      const res = mockRes();

      await adminController.updateOrderPayment(req, res);

      expect(res.statusCode).toBe(400);
      expect(realtimeEvents.emitOrderPaymentUpdated).not.toHaveBeenCalled();
    });

    it('emits notification for payment_paid event', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 803, payment_status: 'Pending', status: 'Pending', customer_id: 5, order_number: 'OD-803',
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.query.mockResolvedValueOnce([[{
        id: 803, payment_status: 'Paid', status: 'Pending', customer_id: 5, order_number: 'OD-803',
        total: 275,
      }]]);

      notificationService.createOrderNotification.mockReturnValue(Promise.resolve({ insertId: 208 }));

      const req = { params: { id: 803 }, body: { payment_status: 'Paid' } };
      const res = mockRes();

      await adminController.updateOrderPayment(req, res);

      expect(notificationService.createOrderNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 5, event: 'payment_paid' })
      );
    });

    it('accepts paymentStatus camelCase body field', async () => {
      pool.query.mockResolvedValueOnce([[{
        id: 804, payment_status: 'Pending', status: 'Accepted', customer_id: 1,
      }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      pool.query.mockResolvedValueOnce([[{
        id: 804, payment_status: 'Failed', status: 'Accepted', customer_id: 1,
        total: 100,
      }]]);

      notificationService.createOrderNotification.mockReturnValue(Promise.resolve({ insertId: 209 }));

      const req = { params: { id: 804 }, body: { paymentStatus: 'Failed' } };
      const res = mockRes();

      await adminController.updateOrderPayment(req, res);

      expect(res.statusCode).toBe(200);
      expect(realtimeEvents.emitOrderPaymentUpdated).toHaveBeenCalled();
    });
  });
});
