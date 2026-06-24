/**
 * Mint short-lived customer JWTs for the Socket.IO load test.
 *
 * Your socket server requires a valid token (io.use(authenticateSocket)), so a
 * realtime load test needs real tokens. This reuses the API's own signing util
 * so the tokens are always valid regardless of the secret value.
 *
 * Run from the API app so it can read the same JWT_SECRET / env:
 *   cd apps/api
 *   node ../../load-tests/gen-tokens.js 500 > ../../load-tests/tokens.csv
 *
 * Produces a CSV (one token per line, with a header) that artillery reads.
 * The ids are synthetic (1..N); tokens only need to be *signed* correctly to
 * pass the socket handshake — they don't need to map to real users for a pure
 * connection-capacity test.
 */
const { signCustomerToken } = require('../apps/api/src/utils/auth');

const count = Number.parseInt(process.argv[2], 10) || 200;

console.log('token'); // CSV header for artillery
for (let i = 1; i <= count; i++) {
  console.log(signCustomerToken(i));
}
