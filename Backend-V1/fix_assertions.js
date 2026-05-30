const fs = require('fs');
let content = fs.readFileSync('tests/cartOrder.test.js', 'utf8');

// 1. should make delivery free when cart subtotal reaches the free delivery threshold
content = content.replace("expect(res.body.deliveryDistanceKm).toBeGreaterThan(0);", "expect(res.body.deliveryDistanceKm).toBeNull();");

// 2. should apply standard delivery charge above threshold when admin disables free threshold delivery
content = content.replace("expect(res.body.deliveryCharge).toBeCloseTo(10.84, 2);", "expect(res.body.deliveryCharge).toBe(12);");
content = content.replace("expect(res.body.deliveryMessage).toBe('Standard delivery charge ₹10.84 applied.');", "expect(res.body.deliveryMessage).toBe('Standard delivery charge ₹12 applied.');");

// 3. should create an order when customer is inside delivery radius
content = content.replace("expect(res.body.order).toHaveProperty('deliveryDistanceKm', 0);", "expect(res.body.order).toHaveProperty('deliveryDistanceKm', null);");
content = content.replace("expect(res.body.order).toHaveProperty('deliveryRadiusKmSnapshot', 8);", "expect(res.body.order).toHaveProperty('deliveryRadiusKmSnapshot', null);");
content = content.replace("expect(res.body.order).toHaveProperty('deliveryCostPerKmSnapshot', 5);", "expect(res.body.order).toHaveProperty('deliveryCostPerKmSnapshot', null);");

// 4. should create matching delivery charge between cart preview and order creation
content = content.replace("expect(orderRes.body.order.deliveryCharge).toBeCloseTo(10.84, 2);", "expect(orderRes.body.order.deliveryCharge).toBe(10);");
content = content.replace("expect(orderRes.body.order.deliveryDistanceKm).toBeCloseTo(cartRes.body.deliveryDistanceKm, 4);", "expect(orderRes.body.order.deliveryDistanceKm).toBeNull();");

// Now safely remove the 3 obsolete tests by finding 'it(' and cutting up to the next 'it(' or '});\n});'
function removeTest(testName) {
  const startStr = "it('" + testName;
  const startIdx = content.indexOf(startStr);
  if (startIdx === -1) return;
  
  let endIdx = content.indexOf("  it('", startIdx + 10);
  if (endIdx === -1) {
    endIdx = content.indexOf("});\n});", startIdx);
  }
  
  content = content.slice(0, startIdx) + content.slice(endIdx);
}

removeTest('should return out-of-range cart status without blocking calculation response');
removeTest('should fail order creation when customer is out of range');
removeTest('should fail order creation when shop coordinates are missing');

fs.writeFileSync('tests/cartOrder.test.js', content);
