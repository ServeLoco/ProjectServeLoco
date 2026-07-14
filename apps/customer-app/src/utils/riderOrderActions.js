/**
 * Shared rider job step / action-button rules for dashboard card + map sheet.
 * Keep these identical so the two UIs never disagree.
 */

export function isRiderOrderTerminal(status) {
  return status === 'Delivered' || status === 'Cancelled';
}

export function isRiderPickedUp(order) {
  return Boolean(order?.riderPickedUpAt || order?.rider_picked_up_at);
}

export function isOutForDelivery(status) {
  return status === 'Out for Delivery' || status === 'Out for delivery';
}

/**
 * Which primary actions to show for this order.
 * @returns {{ showPickedUp: boolean, showOutForDelivery: boolean, showDelivered: boolean, terminal: boolean }}
 */
export function getRiderActionFlags(order) {
  const status = order?.status || '';
  const terminal = isRiderOrderTerminal(status);
  const pickedUp = isRiderPickedUp(order);
  const ofd = isOutForDelivery(status);

  if (terminal) {
    return {
      showPickedUp: false,
      showOutForDelivery: false,
      showDelivered: false,
      terminal: true,
      pickedUp,
      status,
    };
  }

  return {
    // Hide once already picked up or already past pickup stage.
    showPickedUp: !pickedUp && !ofd,
    // Hide once already out for delivery (or delivered/cancelled).
    showOutForDelivery: !ofd,
    // Only when actively out for delivery.
    showDelivered: ofd,
    terminal: false,
    pickedUp,
    status,
  };
}

/** Merge a partial order patch (API response) onto local state. */
export function mergeRiderOrder(prev, next) {
  if (!next) return prev;
  if (!prev) return next;
  return {
    ...prev,
    ...next,
    // Prefer explicit pickup timestamp from either shape.
    riderPickedUpAt: next.riderPickedUpAt ?? next.rider_picked_up_at ?? prev.riderPickedUpAt ?? prev.rider_picked_up_at,
    rider_picked_up_at: next.rider_picked_up_at ?? next.riderPickedUpAt ?? prev.rider_picked_up_at ?? prev.riderPickedUpAt,
    status: next.status ?? prev.status,
  };
}
