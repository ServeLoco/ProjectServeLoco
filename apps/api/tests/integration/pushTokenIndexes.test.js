// Clearing a push token by value, against a REAL MySQL. Every app start
// re-registers the device, and registerPushToken first clears the same token
// off any OTHER account; a dead Expo token is cleared by value too. Without
// idx_users_push_token / idx_users_fcm_token each of those UPDATEs reads — and
// under REPEATABLE READ locks — every users row. Which index MySQL picks, and
// what it locks, is database behaviour a mocked pool can't show.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.

const {
  DB_TESTS_ENABLED,
  describeWithMysql,
  assertMysqlReady,
  pool,
  FIXTURE_TAG,
  createUser,
  cleanupFixtures,
  withRolledBackTransaction,
} = require('../helpers/realMysql');
const { registerPushToken } = require('../../src/controllers/authController');
const { cleanupDeadTokens } = require('../../src/utils/expoPush');

const PUSH_TOKEN = `ExponentPushToken[${FIXTURE_TAG}shared]`;
const FCM_TOKEN = `${FIXTURE_TAG}-shared-fcm-registration-token`;
const DEAD_TOKEN = `ExponentPushToken[${FIXTURE_TAG}dead]`;
const FILLER_USERS = 30;

// The clear-by-value UPDATEs the code actually sends, captured off the pool.
const captureTokenClears = async (fn) => {
  const spy = jest.spyOn(pool, 'query');
  try {
    await fn();
    return spy.mock.calls.filter(([sql]) => /^UPDATE users SET (push|fcm)_token = NULL WHERE \1_token = \?/.test(sql));
  } finally {
    spy.mockRestore();
  }
};

const indexUsedBy = async ([sql, params]) => {
  const [[plan]] = await pool.query(`EXPLAIN ${sql}`, params);
  return plan.key;
};

describeWithMysql('clearing a push token by value', () => {
  let previousOwner;
  let me;

  beforeAll(async () => {
    await assertMysqlReady();
    previousOwner = await createUser('Previous owner');
    me = await createUser('New owner');
    // Other customers with their own tokens: a scan of the table would have to
    // read and lock all of them.
    for (let i = 0; i < FILLER_USERS; i += 1) await createUser('Filler');
    await pool.query(
      `UPDATE users SET push_token = CONCAT('ExponentPushToken[', ?, id, ']'),
                        fcm_token = CONCAT(?, '-fcm-registration-', id)
        WHERE name = ?`,
      [FIXTURE_TAG, FIXTURE_TAG, `${FIXTURE_TAG} Filler`]
    );
    await pool.query('UPDATE users SET push_token = ?, fcm_token = ? WHERE id = ?', [PUSH_TOKEN, FCM_TOKEN, previousOwner]);
  });

  afterAll(async () => {
    await cleanupFixtures();
  });

  it('moves the device to the new account through the token indexes', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const clears = await captureTokenClears(() =>
      registerPushToken({ user: { id: me }, body: { push_token: PUSH_TOKEN, fcm_token: FCM_TOKEN } }, res)
    );

    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(clears).toHaveLength(2);
    expect(await indexUsedBy(clears[0])).toBe('idx_users_push_token');
    expect(await indexUsedBy(clears[1])).toBe('idx_users_fcm_token');

    const [rows] = await pool.query('SELECT id, push_token, fcm_token FROM users WHERE id IN (?, ?)', [previousOwner, me]);
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(byId[previousOwner]).toMatchObject({ push_token: null, fcm_token: null });
    expect(byId[me]).toMatchObject({ push_token: PUSH_TOKEN, fcm_token: FCM_TOKEN });
  });

  it('clears a dead Expo token through idx_users_push_token', async () => {
    await pool.query('UPDATE users SET push_token = ? WHERE id = ?', [DEAD_TOKEN, previousOwner]);
    const clears = await captureTokenClears(() =>
      cleanupDeadTokens(pool, [{ status: 'error', details: { error: 'DeviceNotRegistered' } }], [DEAD_TOKEN])
    );

    expect(clears).toHaveLength(1);
    expect(await indexUsedBy(clears[0])).toBe('idx_users_push_token');
    const [[row]] = await pool.query('SELECT push_token FROM users WHERE id = ?', [previousOwner]);
    expect(row.push_token).toBeNull();
  });

  it('locks only the account holding the token, not every user', async () => {
    const recordLocks = await withRolledBackTransaction(async (connection) => {
      await connection.query('UPDATE users SET push_token = NULL WHERE push_token = ? AND id != ?', [PUSH_TOKEN, previousOwner]);
      const [[{ n }]] = await connection.query(
        `SELECT COUNT(*) AS n FROM performance_schema.data_locks
          WHERE OBJECT_SCHEMA = DATABASE() AND OBJECT_NAME = 'users'
            AND LOCK_TYPE = 'RECORD' AND THREAD_ID = PS_CURRENT_THREAD_ID()`
      );
      return Number(n);
    });

    // The matching row is locked (so the count is real), but nowhere near the
    // FILLER_USERS + 2 rows a table scan locks.
    expect(recordLocks).toBeGreaterThan(0);
    expect(recordLocks).toBeLessThan(10);
  });
});

afterAll(async () => {
  if (DB_TESTS_ENABLED) await pool.end();
});
