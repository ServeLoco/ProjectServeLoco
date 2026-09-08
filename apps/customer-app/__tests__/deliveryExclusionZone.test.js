const fs = require('fs');
const path = require('path');

const { normalizeCartCalculation } = require('../src/utils/apiMappers');

const syncSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'hooks', 'useDeliveryLocationSync.js'),
  'utf8',
);
const homeSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'),
  'utf8',
);
const checkoutSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'customer', 'CheckoutScreen', 'CheckoutScreen.js'),
  'utf8',
);
const cartSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'customer', 'CartScreen', 'CartScreen.js'),
  'utf8',
);

// The server blocks delivery inside a no-delivery exclusion square while
// still reporting outOfRange: false. Anything that only looks at outOfRange
// shows delivery as available and fails at Place Order instead.
describe('no-delivery exclusion squares', () => {
  it('maps excluded / exclusionMessage off the cart calculation', () => {
    const bill = normalizeCartCalculation({
      excluded: true,
      exclusion_message: 'Deliveries are not permitted in this compound.',
      outOfRange: false,
    });

    expect(bill.excluded).toBe(true);
    expect(bill.exclusionMessage).toEqual('Deliveries are not permitted in this compound.');
    expect(bill.outOfRange).toBe(false);
  });

  it('defaults excluded to false for servers that do not send the field', () => {
    const bill = normalizeCartCalculation({ outOfRange: false });

    expect(bill.excluded).toBe(false);
    // pickFirst() in apiMappers returns undefined when nothing matches, so a
    // missing message is falsy rather than literally null — same as the
    // neighbouring nearestZoneName field.
    expect(bill.exclusionMessage).toBeFalsy();
  });

  it('accepts the snake_case casing too', () => {
    const bill = normalizeCartCalculation({ is_excluded: true });

    expect(bill.excluded).toBe(true);
  });

  it('treats an excluded pin as outside the deliverable area in the location sync', () => {
    expect(syncSource).toMatch(/body\.excluded \?\? body\.is_excluded/);
    expect(syncSource).toMatch(/insideZone: !outOfRange && !excluded/);
  });

  it('saves an undeliverable pin as insideZone: false instead of trapping the picker open', () => {
    // Out-of-range/excluded pins still get saved (so Home's own "We don't
    // deliver here yet" screen can take over) — just never as a deliverable
    // zone, and never with the confirmed-place label attached.
    expect(homeSource).toMatch(/const deliverable = !\(outOfRange \|\| excluded\)/);
    expect(homeSource).toMatch(
      /setManualDeliveryLocation\([\s\S]*?deliverable,[\s\S]*?deliverable \? \(zone\?\.name \|\| null\) : null,/,
    );
    // Zone id rides along with the name so cache/cart can key on the zone.
    expect(homeSource).toMatch(
      /setManualDeliveryLocation\([\s\S]*?deliverable \? \(zone\?\.id \?\? null\) : null,/,
    );
    expect(homeSource).toMatch(/setShowLocationPicker\(false\)/);
  });

  // Checkout used to gate purely on outOfRange. An exclusion square reports
  // outOfRange: false, so Place Order stayed enabled and the server rejected
  // the submit with DELIVERY_EXCLUDED instead of the UI blocking it upfront.
  describe('checkout blocks an excluded pin, not just an out-of-range one', () => {
    it('reads excluded / exclusionMessage off the bill', () => {
      expect(checkoutSource).toMatch(/const excluded = Boolean\(bill\?\.excluded\)/);
      expect(checkoutSource).toMatch(/const exclusionMessage = bill\?\.exclusionMessage \|\| null/);
    });

    it('combines both into the single gate the UI uses', () => {
      expect(checkoutSource).toMatch(/const deliveryBlocked = outOfRange \|\| excluded/);
      expect(checkoutSource).toMatch(/isPlaceOrderDisabled = .*\|\| deliveryBlocked/);
    });

    it('refuses to submit an excluded pin', () => {
      expect(checkoutSource).toMatch(/if \(excluded\) \{[\s\S]*?setSubmitError\(exclusionMessage/);
    });

    it('shows the admin exclusion message instead of "move the pin closer" advice', () => {
      // An exclusion square can sit well inside a zone, so the nearest-zone
      // wording would be actively misleading there.
      expect(checkoutSource).toMatch(
        /deliveryBlockedMessage = excluded[\s\S]*?exclusionMessage \|\|[\s\S]*?nearestZoneName/,
      );
    });
  });

  // Cart is one screen EARLIER than Checkout, and it gated on nothing at all.
  // The server zeroes every charge when it refuses a location, so the ₹0
  // delivery charge rendered as a green "FREE" and Proceed to Pay stayed
  // enabled — the customer only hit the refusal on the next screen.
  describe('cart blocks an undeliverable location before checkout', () => {
    it('derives the same deliveryBlocked gate from the bill', () => {
      expect(cartSource).toMatch(/const outOfRange = Boolean\(bill\?\.outOfRange\)/);
      expect(cartSource).toMatch(/const excluded = Boolean\(bill\?\.excluded\)/);
      expect(cartSource).toMatch(
        /const deliveryBlocked = requiresLocation \|\| outOfRange \|\| excluded \|\| serverRefusedDelivery/,
      );
    });

    it('disables Proceed to Pay while delivery is blocked', () => {
      expect(cartSource).toMatch(/isCheckoutDisabled =[\s\S]*?deliveryBlocked \|\|/);
    });

    it('never renders a refused ₹0 delivery charge as FREE', () => {
      expect(cartSource).toMatch(
        /const deliveryFree = !deliveryBlocked\s*\n\s*&& \(bill\.deliveryCharge === 0 \|\| bill\.isFreeDeliveryApplied\)/,
      );
      expect(cartSource).toMatch(/value=\{deliveryBlocked \? '—' : deliveryFree \? 'FREE'/);
    });

    it('explains why instead of silently disabling the button', () => {
      expect(cartSource).toMatch(/deliveryBlockedMessage = requiresLocation/);
      expect(cartSource).toMatch(/: excluded\s*\n\s*\? \(bill\?\.exclusionMessage \|\|/);
      expect(cartSource).toMatch(/styles\.deliveryBlockedRow/);
      expect(cartSource).toMatch(/: deliveryBlocked\s*\n\s*\? 'Delivery not available here'/);
    });

    // A request that carried no coordinates comes back outOfRange: true,
    // because zone pricing fails closed — indistinguishable in the response
    // from a pin that really is outside every zone. Conflating the two told
    // customers standing well inside a zone that we don't deliver to them,
    // whenever their first-launch GPS/zone-check hadn't landed yet.
    it('separates "no location yet" from "outside delivery area"', () => {
      expect(cartSource).toMatch(/const requiresLocation = Boolean\(bill\?\.requiresLocation\)/);
      expect(cartSource).toMatch(/deliveryBlockedMessage = requiresLocation\s*\n\s*\? "Couldn't get your location/);
      expect(cartSource).toMatch(/checkoutBtnText = requiresLocation\s*\n\s*\? 'Set delivery location'/);
    });

    // The quote used to go out 300ms after focus regardless of whether the
    // startup location sync had produced a pin, which is what generated the
    // coordinate-less request in the first place.
    it('waits for the startup location sync before quoting', () => {
      expect(cartSource).toMatch(/if \(!customerCoords && !isInitialLocationSyncComplete\)/);
    });

    // deliveryWithinRange is the server's own verdict and folds in cases the
    // individual flags don't describe — above all a pin that matched no zone
    // in any area, where catalog scoping falls back to the default area and,
    // if that area runs flat pricing, a settings.delivery_charge quote came
    // back with outOfRange: false attached.
    it('honours the server verdict, not just the individual flags', () => {
      expect(cartSource).toMatch(
        /const serverRefusedDelivery = bill \? bill\.deliveryWithinRange === false : false/,
      );
    });
  });
});
