const { pool } = require('../src/db/mysql');

jest.mock('../src/db/mysql', () => ({
  pool: { query: jest.fn() }
}));

const config = require('../src/config/env');
const {
  purgeOldNotifications,
  startNotificationRetentionScheduler,
  stopNotificationRetentionScheduler,
} = require('../src/services/notificationRetention');

describe('purgeOldNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps 5 days by default', () => {
    expect(config.NOTIFICATION_RETENTION_DAYS).toBe(5);
  });

  it('deletes expired rows in primary-key batches until a short batch', async () => {
    pool.query
      .mockResolvedValueOnce([[{ maxId: 900 }]]) // newest expired id
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const deleted = await purgeOldNotifications({ days: 15, batchSize: 2, pauseMs: 0 });

    expect(deleted).toBe(5);
    expect(pool.query).toHaveBeenCalledTimes(4);

    const [selectSql, selectParams] = pool.query.mock.calls[0];
    expect(selectSql).toMatch(/SELECT MAX\(id\) AS maxId FROM notifications WHERE created_at < NOW\(\) - INTERVAL \? DAY/);
    expect(selectParams).toEqual([15]);

    for (const [sql, params] of pool.query.mock.calls.slice(1)) {
      expect(sql).toMatch(/DELETE FROM notifications/);
      // Bounded by the primary key AND re-checked on created_at, oldest first.
      expect(sql).toMatch(/WHERE id <= \? AND created_at < NOW\(\) - INTERVAL \? DAY/);
      expect(sql).toMatch(/ORDER BY id\s+LIMIT \?/);
      expect(params).toEqual([900, 15, 2]);
    }
  });

  it('stops after one batch when everything fits in it', async () => {
    pool.query
      .mockResolvedValueOnce([[{ maxId: 42 }]])
      .mockResolvedValueOnce([{ affectedRows: 7 }]);

    await expect(purgeOldNotifications({ days: 15, batchSize: 1000, pauseMs: 0 })).resolves.toBe(7);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('issues no DELETE when nothing is older than the retention', async () => {
    pool.query.mockResolvedValueOnce([[{ maxId: null }]]);

    await expect(purgeOldNotifications({ days: 15 })).resolves.toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).not.toMatch(/DELETE/);
  });

  it.each([0, -3, 1.5, NaN])('refuses a retention of %p days without touching the database', async (days) => {
    await expect(purgeOldNotifications({ days })).rejects.toThrow(/at least 1 day/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('notification retention scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    stopNotificationRetentionScheduler();
    jest.useRealTimers();
  });

  it('runs a catch-up purge shortly after boot', async () => {
    pool.query.mockResolvedValue([[{ maxId: null }]]);

    startNotificationRetentionScheduler();
    expect(pool.query).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(90 * 1000);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toMatch(/FROM notifications/);
  });

  it('runs nothing once stopped', async () => {
    startNotificationRetentionScheduler();
    stopNotificationRetentionScheduler();

    await jest.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
