// Reads what the app reads, through the app's own code, and prints it so two
// databases can be compared line by line (steps C3, C4, C5, D6 of
// plans/aws-rds-migration.md). Run it with app-check.sh, which starts it
// inside the deployed API image against one server at a time.
//
//   node app-check.js --max-ids orders=123,products=456,...  [--write] [--pool]
//
// --max-ids bounds every read to rows that existed when the copy was taken,
// so orders placed on the live Azure database afterwards don't show up as
// differences. Nothing here writes to the database except --write, which is
// refused anywhere but RDS; the other checks use a session-only temporary
// table, a rolled-back transaction and a named lock.
'use strict';

const path = require('path');

// Resolved from the working directory (/usr/src/app in the API image), not
// from this file, which is mounted in from outside the image.
const app = (p) => require(path.join(process.cwd(), p));
const config = app('src/config/env');
const { pool, beginReadCommitted } = app('src/db/mysql');
const { decideSearchMode } = app('src/utils/search');
const { istDateOf } = app('src/utils/businessTime');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const maxIds = Object.fromEntries(String(opt('--max-ids') || '').split(',').filter(Boolean).map((pair) => {
  const [table, max] = pair.split('=');
  if (!/^[a-z_]+$/.test(table) || !/^\d+$/.test(max)) throw new Error(`bad --max-ids entry: ${pair}`);
  return [table, Number(max)];
}));
for (const t of ['orders', 'products']) {
  if (maxIds[t] === undefined) throw new Error(`--max-ids must include ${t}`);
}

const host = String(config.MYSQL_HOST || '');
const isRds = host.endsWith('.rds.amazonaws.com')
  || (process.env.MIG_TEST_MODE === '1' && host === '127.0.0.1' && String(config.MYSQL_PORT) === '3308');

const rows = async (sql, params) => (await pool.query(sql, params))[0];
const iso = (v) => (v instanceof Date ? v.toISOString() : v);

// One failing check must not hide the others: its error becomes its result,
// which then shows up in the diff.
const check = async (fn) => {
  try {
    return await fn();
  } catch (e) {
    return { error: e.code || e.message };
  }
};

const withConnection = async (fn) => {
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
};

const main = async () => {
  const target = { host, ...(await rows('SELECT @@hostname AS server, VERSION() AS version, DATABASE() AS db, CURRENT_USER() AS user'))[0] };
  const same = {};
  const info = {};

  // TLS as mysqlSsl.js sets it up. The cipher itself may differ per server.
  same.tls = await check(async () => {
    const [cipher] = await rows("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    info.tls_cipher = cipher && cipher.Value;
    return Boolean(cipher && cipher.Value);
  });

  same.settings = await check(async () => (await rows(
    `SELECT @@lower_case_table_names AS lower_case_table_names, @@sql_mode AS sql_mode,
            @@character_set_server AS character_set_server, @@collation_server AS collation_server,
            @@transaction_isolation AS transaction_isolation, @@innodb_ft_min_token_size AS ft_min_token_size,
            TIMEDIFF(NOW(), UTC_TIMESTAMP()) AS server_offset_from_utc`))[0]);

  same.database = await check(async () => (await rows(
    `SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation
       FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()`))[0]);

  same.tables = await check(async () => rows(
    `SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`));

  // lower_case_table_names=1 in practice: a query that spells a table in
  // capitals must still find it, as it does on Azure.
  same.upper_case_table_name = await check(async () => (await rows(
    'SELECT COUNT(*) AS n FROM ORDERS WHERE id <= ?', [maxIds.orders]))[0].n);

  same.key_counts = await check(async () => {
    const out = {};
    for (const [t, max] of Object.entries(maxIds)) {
      out[t] = (await rows(`SELECT COUNT(*) AS n FROM \`${t}\` WHERE id <= ?`, [max]))[0].n;
    }
    return out;
  });

  // Timestamps as the API returns them (mysql.js reads with timezone 'Z').
  same.latest_orders = await check(async () => (await rows(
    'SELECT id, customer_id, created_at FROM orders WHERE id <= ? ORDER BY id DESC LIMIT 20', [maxIds.orders]))
    .map((r) => ({ id: r.id, customer_id: r.customer_id, created_at: iso(r.created_at) })));

  if (maxIds.coupons !== undefined) {
    same.coupon_windows = await check(async () => (await rows(
      'SELECT id, starts_at, ends_at FROM coupons WHERE id <= ? ORDER BY id DESC LIMIT 20', [maxIds.coupons]))
      .map((r) => ({ id: r.id, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at) })));
  }

  // The IST-day grouping every report uses (utils/businessTime.js, CONVERT_TZ).
  same.orders_per_ist_day = await check(async () => (await rows(
    `SELECT ${istDateOf('created_at')} AS ist_day, COUNT(*) AS n FROM orders
      WHERE id <= ? AND id > ? GROUP BY ist_day ORDER BY ist_day`, [maxIds.orders, maxIds.orders - 1000]))
    .map((r) => ({ ist_day: iso(r.ist_day), n: r.n })));

  // Product search the way productController builds it (utils/search.js):
  // FULLTEXT for normal words, LIKE for short ones. Terms are the most common
  // words in product names, so both servers search for the same things.
  same.search = await check(async () => {
    const names = await rows('SELECT name FROM products WHERE id <= ? ORDER BY id LIMIT 500', [maxIds.products]);
    const freq = new Map();
    for (const { name } of names) {
      for (const w of String(name).toLowerCase().match(/[a-z]{4,}/g) || []) freq.set(w, (freq.get(w) || 0) + 1);
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([w]) => w);
    const terms = top.length ? [...top, top[0].slice(0, 2)] : [];
    const out = [];
    for (const term of terms) {
      const d = decideSearchMode(term);
      let clause = '1=0';
      const params = [maxIds.products];
      if (d.mode === 'like') { clause = 'p.name LIKE ?'; params.push(`%${d.term}%`); }
      if (d.mode === 'fulltext') { clause = 'MATCH(p.name) AGAINST (? IN BOOLEAN MODE)'; params.push(d.term); }
      const ids = (await rows(`SELECT p.id FROM products p WHERE p.id <= ? AND ${clause} ORDER BY p.id LIMIT 100`, params)).map((r) => r.id);
      out.push({ term, mode: d.mode, ids });
    }
    return out;
  });

  // Strict sql_mode rejects bad data instead of silently cutting it. A
  // temporary table lives only in this session, so this writes nothing.
  same.strict_mode_rejects_too_long = await check(() => withConnection(async (conn) => {
    await conn.query('CREATE TEMPORARY TABLE _rds_check_strict (v VARCHAR(3))');
    try {
      await conn.query("INSERT INTO _rds_check_strict VALUES ('abcdef')");
      return false;
    } catch (e) {
      return e.code === 'ER_DATA_TOO_LONG';
    } finally {
      await conn.query('DROP TEMPORARY TABLE IF EXISTS _rds_check_strict');
    }
  }));

  // The order flow: READ COMMITTED + SELECT ... FOR UPDATE (orderController).
  // Locks the oldest order for a moment, then rolls back.
  same.read_committed_for_update = await check(async () => {
    const conn = await beginReadCommitted();
    try {
      const [locked] = await conn.query('SELECT id FROM orders ORDER BY id LIMIT 1 FOR UPDATE');
      return locked.length;
    } finally {
      await conn.rollback();
      conn.release();
    }
  });

  // The named lock migrate.js takes so two migrations never overlap.
  same.named_lock = await check(() => withConnection(async (conn) => {
    const [[got]] = await conn.query("SELECT GET_LOCK('villkro_rds_check', 5) AS v");
    const [[released]] = await conn.query("SELECT RELEASE_LOCK('villkro_rds_check') AS v");
    return [got.v, released.v];
  }));

  // How long one query takes from the app (the reason for the move).
  info.round_trip_ms = await check(() => withConnection(async (conn) => {
    const times = [];
    for (let i = 0; i < 20; i += 1) {
      const t = process.hrtime.bigint();
      await conn.query('SELECT 1');
      times.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    times.sort((a, b) => a - b);
    return { median: Number(times[10].toFixed(2)), max: Number(times[19].toFixed(2)) };
  }));

  if (args.includes('--pool')) {
    // The API's pool is 30 connections; all 30 must be able to open at once.
    info.pool_30 = await check(async () => {
      const t0 = Date.now();
      const results = await Promise.allSettled(Array.from({ length: 30 },
        () => pool.query('SELECT SLEEP(0.5) AS s, CONNECTION_ID() AS id')));
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason.code || r.reason.message);
      const [[mc]] = await pool.query('SELECT @@max_connections AS max_connections');
      return {
        ok: ok.length,
        distinct_connections: new Set(ok.map((r) => r.value[0][0].id)).size,
        failed,
        ms: Date.now() - t0,
        max_connections: mc.max_connections,
      };
    });
  }

  if (args.includes('--write')) {
    if (!isRds) throw new Error('--write is only allowed against RDS');
    info.write = await check(() => withConnection(async (conn) => {
      await conn.query('DROP TABLE IF EXISTS _rds_write_check');
      await conn.query('CREATE TABLE _rds_write_check (id INT PRIMARY KEY, v VARCHAR(20))');
      await conn.query("INSERT INTO _rds_write_check VALUES (1, 'a')");
      await conn.query("UPDATE _rds_write_check SET v = 'b' WHERE id = 1");
      const [[row]] = await conn.query('SELECT v FROM _rds_write_check WHERE id = 1');
      await conn.query('DELETE FROM _rds_write_check WHERE id = 1');
      await conn.query('DROP TABLE _rds_write_check');
      // An update on a real table inside a transaction, rolled back.
      await conn.beginTransaction();
      const [res] = await conn.query('UPDATE orders SET status = status ORDER BY id LIMIT 1');
      await conn.rollback();
      return { scratch_table: row.v === 'b' ? 'ok' : 'unexpected', orders_update_rolled_back: res.affectedRows };
    }));
  }

  const print = (tag, obj) => process.stdout.write(`${tag}_BEGIN\n${JSON.stringify(obj, null, 2)}\n${tag}_END\n`);
  print('TARGET', target);
  print('SAME', same);
  print('INFO', info);
};

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error('app-check failed:', e.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
