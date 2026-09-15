const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'screens', 'customer', 'CheckoutScreen', 'CheckoutScreen.js'),
  'utf8',
);

describe('CheckoutScreen saved delivery location', () => {
  it('falls back to the shared saved location as map centre, and auto-locates live GPS on open', () => {
    expect(source).toMatch(/useDeliveryLocationStore\(state => state\.coords\)/);
    expect(source).toMatch(/initialCenter=\{savedDeliveryLocation/);
  });

  // The manual pin IS the "deliver to someone else" feature: the customer
  // searched for another address, and the catalog, cart and bill behind this
  // screen were all built from it. Auto-locating on top of it re-priced the
  // bill against the phone's own area, which dropped every item as
  // unavailable and bounced the customer out with "Delivery area changed"
  // (reproduced on-device: pin in area 9, phone in Mumbai, cart emptied the
  // moment Checkout opened). A GPS-sourced pin still refreshes, because that
  // customer is ordering to where they are and a newer fix is a better one.
  it('auto-locates only when the saved pin is a GPS fix, never over a manual pin', () => {
    expect(source).toMatch(
      /autoLocateOnMount=\{savedDeliveryLocationSource !== 'manual'\}/,
    );
  });

  it('uses the moved pin for live pricing before confirmation', () => {
    expect(source).toMatch(/latitude: coordinates\?\.lat \?\? previewCoordinates\?\.lat/);
    expect(source).toMatch(/longitude: coordinates\?\.lng \?\? previewCoordinates\?\.lng/);
  });

  // The bill falls back to savedDeliveryLocation, so the submitted order has
  // to as well. Without it, a customer who arrived with a saved location and
  // never re-confirmed a pin got a priced bill but an order posted with no
  // coordinates — which the server refuses as out of range once zone pricing
  // is on. Priced one way, submitted another.
  it('submits the order with the same saved location the bill was priced from', () => {
    expect(source).toMatch(
      /const pin = coordinatesRef\.current \|\| coordinates \|\| savedDeliveryLocation/,
    );
  });

  it('never commits the unconfirmed live map centre as the order location', () => {
    // previewCoordinates tracks the map as it drifts — preview only.
    expect(source).not.toMatch(/const pin = [^\n]*previewCoordinates/);
  });

  it('opens tightly focused on the saved pin and asks the picker to reveal zones when out of range', () => {
    expect(source).toMatch(/initialZoom=\{14\.5\}/);
    expect(source).toMatch(/showZoneOverlay=\{outOfRange\}/);
  });
});

// Panning the map nulls `coordinates` (handlePinMoved: "previous Confirm is
// invalid until they confirm again") but leaves previewCoordinates driving
// calculationPayload, so the BILL follows the dragged pin while
// handlePlaceOrder still commits coordinatesRef || coordinates ||
// savedDeliveryLocation. Without a gate the customer is shown one zone's
// delivery charge and the order is placed at another — and the pre-submit
// re-verification cannot catch it, because it re-prices calculationPayload,
// which is the preview pin too.
describe('CheckoutScreen bill/order pin agreement', () => {
  it('blocks Place Order while a dragged pin is still unconfirmed', () => {
    expect(source).toMatch(
      /const pinAwaitingConfirm = Boolean\(previewCoordinates\) && !coordinates;/
    );
    expect(source).toMatch(/isPlaceOrderDisabled = .*\|\| pinAwaitingConfirm;/);
  });

  it('tells the customer why the button is disabled', () => {
    expect(source).toMatch(/pinAwaitingConfirm\s*\n\s*\? 'Confirm your pin to continue'/);
  });

  // The order pin chain must stay narrower than the bill's: previewCoordinates
  // tracks a finger mid-drag and is never a commitment.
  it('never commits the preview pin to the order', () => {
    expect(source).toMatch(
      /const pin = coordinatesRef\.current \|\| coordinates \|\| savedDeliveryLocation;/
    );
  });
});
