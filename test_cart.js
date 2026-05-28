const { pool } = require('./Backend-V1/src/db/mysql');
const { calculateCart } = require('./Backend-V1/src/controllers/cartController');

const reqNoLoc = {
  body: {
    items: [{ product_id: 1, quantity: 1, type: 'product' }]
  }
};
const reqWithLoc = {
  body: {
    items: [{ product_id: 1, quantity: 1, type: 'product' }],
    latitude: 30.0,
    longitude: 70.0
  }
};
const resMock = {
  status: () => ({ json: (data) => console.log(data) })
};

async function test() {
  console.log("--- Without Location ---");
  await calculateCart(reqNoLoc, resMock);
  console.log("--- With Location ---");
  await calculateCart(reqWithLoc, resMock);
  pool.end();
}
test();
