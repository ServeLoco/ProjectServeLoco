import { getApiBaseUrl } from '../api/config';

const LOCAL_IMAGE_HOSTS = new Set(['10.0.2.2', 'localhost', '127.0.0.1']);

function pickFirst(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function getApiOrigin() {
  try {
    return new URL(getApiBaseUrl()).origin;
  } catch {
    return '';
  }
}

function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  if (trimmedUrl.startsWith('/')) {
    const origin = getApiOrigin();
    const encodedPath = encodeURI(trimmedUrl);
    return origin ? `${origin}${encodedPath}` : encodedPath;
  }

  try {
    const parsed = new URL(trimmedUrl);
    if (LOCAL_IMAGE_HOSTS.has(parsed.hostname)) {
      const origin = getApiOrigin();
      const encodedPath = encodeURI(`${parsed.pathname}${parsed.search}`);
      return origin ? `${origin}${encodedPath}` : encodeURI(trimmedUrl);
    }
    return encodeURI(trimmedUrl);
  } catch {
    return encodeURI(trimmedUrl);
  }
}

function asArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    payload?.data,
    payload?.items,
    payload?.results,
    ...keys.map(key => payload?.[key]),
    ...keys.map(key => payload?.data?.[key]),
  ];

  return candidates.find(Array.isArray) || [];
}

function asBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'available', 'active', 'open'].includes(normalized)) return true;
    if (['false', 'no', '0', 'unavailable', 'inactive', 'closed'].includes(normalized)) return false;
  }
  return fallback;
}

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getDiscountLabel(item) {
  return pickFirst(
    item.discountLabel,
    item.discount_label,
    item.offerLabel,
    item.offer_label,
    item.discountPercent ? `${item.discountPercent}% OFF` : null,
    item.discount_percentage ? `${item.discount_percentage}% OFF` : null,
    item.discount ? `Rs. ${item.discount} OFF` : null,
  );
}

function getComboItems(item = {}) {
  const rawItems = asArray(
    item.comboItems ||
    item.combo_items ||
    item.includedItems ||
    item.included_items ||
    item.bundleItems ||
    item.bundle_items,
    ['comboItems', 'combo_items', 'items', 'products']
  );

  return rawItems.map((comboItem, index) => {
    const source = comboItem.product || comboItem.item || comboItem;
    return {
      ...normalizeProduct(source),
      quantity: Math.max(1, numberOrZero(pickFirst(comboItem.quantity, comboItem.qty, 1)) || 1),
      displayOrder: numberOrZero(pickFirst(comboItem.displayOrder, comboItem.display_order, index)),
    };
  });
}

function normalizeProduct(item = {}) {
  const id = String(pickFirst(item.id, item._id, item.productId, item.product_id, item.slug));
  const isCombo = asBoolean(pickFirst(item.isCombo, item.is_combo), false);
  const comboItems = getComboItems(item);
  const imageUrl = normalizeImageUrl(pickFirst(item.imageUrl, item.image_url, item.image, item.url, null));

  return {
    ...item,
    id,
    name: pickFirst(item.name, item.productName, item.product_name, 'Product'),
    price: numberOrZero(pickFirst(item.price, item.salePrice, item.sale_price, item.unitPrice)),
    originalPrice: pickFirst(item.originalPrice, item.original_price, item.mrp, null),
    discountLabel: getDiscountLabel(item),
    unit: pickFirst(item.unit, item.size, item.unitSize, item.unit_size, ''),
    category: pickFirst(item.category, item.categoryName, item.category_name, ''),
    categoryId: pickFirst(item.categoryId, item.category_id, null),
    available: asBoolean(pickFirst(item.available, item.isAvailable, item.is_available, item.inStock), true),
    imageUrl,
    imageUri: imageUrl,
    description: pickFirst(item.description, item.shortDescription, item.short_description, ''),
    isCombo,
    is_combo: isCombo,
    comboItems,
    combo_items: comboItems,
    relatedProducts: asArray(item.relatedProducts || item.related_products || item.related, ['products']).map(normalizeProduct),
  };
}

function normalizeCategory(item = {}) {
  const id = String(pickFirst(item.id, item._id, item.categoryId, item.category_id, item.name));
  const imageUrl = normalizeImageUrl(pickFirst(item.imageUrl, item.image_url, item.image, null));

  return {
    ...item,
    id,
    name: pickFirst(item.name, item.categoryName, item.category_name, 'Category'),
    count: pickFirst(item.count, item.productCount, item.product_count, item.productsCount, 0),
    productCount: pickFirst(item.count, item.productCount, item.product_count, item.productsCount, 0),
    imageUrl,
    imageUri: imageUrl,
    type: pickFirst(item.type, item.storeType, item.store_type, ''),
    displayOrder: numberOrZero(pickFirst(item.displayOrder, item.display_order, item.order, 0)),
    subcategories: asArray(item.subcategories || item.children || item.chips, ['subcategories']),
  };
}

function normalizeSettings(payload = {}) {
  const settings = payload?.settings || payload?.data || payload;
  const activeOffer = settings?.activeOffer || settings?.active_offer || settings?.offer || null;

  return {
    shopStatus: asBoolean(pickFirst(settings.shopOpen, settings.shop_open, settings.isShopOpen), true) ? 'open' : 'closed',
    minimumOrder: numberOrZero(pickFirst(settings.minimumOrderAmount, settings.minimum_order_amount, settings.minimumOrder)),
    deliveryCharge: numberOrZero(pickFirst(settings.deliveryCharge, settings.delivery_charge)),
    nightCharge: numberOrZero(pickFirst(settings.nightCharge, settings.night_charge)),
    supportPhone: pickFirst(settings.supportPhone, settings.support_phone, settings.whatsapp_number, null),
    upiId: pickFirst(settings.upiId, settings.upi_id, null),
    upiQrImageId: pickFirst(settings.upiQrImageId, settings.upi_qr_image_id, null),
    upiQrImageUrl: normalizeImageUrl(pickFirst(settings.upiQrImageUrl, settings.upi_qr_image_url, settings.upiQrUrl, settings.upi_qr_url, null)),
    activeOffer,
  };
}

function normalizeCartCalculation(payload = {}) {
  const bill = payload?.bill || payload?.totals || payload?.data || payload;

  return {
    subtotal: numberOrZero(pickFirst(bill.subtotal, bill.itemTotal, bill.item_total)),
    deliveryCharge: numberOrZero(pickFirst(bill.deliveryCharge, bill.delivery_charge)),
    nightCharge: numberOrZero(pickFirst(bill.nightCharge, bill.night_charge)),
    discount: numberOrZero(pickFirst(bill.discount, bill.discountAmount, bill.discount_amount)),
    grandTotal: numberOrZero(pickFirst(bill.grandTotal, bill.grand_total, bill.total, bill.payableAmount)),
    minimumOrder: numberOrZero(pickFirst(bill.minimumOrder, bill.minimum_order, bill.minimumOrderAmount)),
    paymentStatus: pickFirst(bill.paymentStatus, bill.payment_status, 'Pending'),
    deliveryDistanceKm: pickFirst(bill.deliveryDistanceKm, bill.delivery_distance_km, null),
    deliveryRadiusKm: pickFirst(bill.deliveryRadiusKm, bill.delivery_radius_km, null),
    deliveryWithinRange: asBoolean(pickFirst(bill.deliveryWithinRange, bill.delivery_within_range), true),
    requiresLocation: asBoolean(pickFirst(bill.requiresLocation, bill.requires_location), false),
    freeDeliveryOfferActive: asBoolean(pickFirst(bill.freeDeliveryOfferActive, bill.free_delivery_offer_active), false),
    freeAboveThresholdActive: asBoolean(pickFirst(bill.freeAboveThresholdActive, bill.free_delivery_above_minimum_active), true),
    belowThreshold: asBoolean(pickFirst(bill.belowThreshold, bill.below_threshold, bill.belowThresholdDelivery, bill.below_threshold_delivery), false),
    belowThresholdDeliveryCharge: numberOrZero(pickFirst(bill.belowThresholdDeliveryCharge, bill.below_threshold_delivery_charge)),
    deliveryMessage: pickFirst(bill.deliveryMessage, bill.delivery_message, bill.message, ''),
  };
}

function normalizeProfile(user = {}) {
  if (!user) return user;
  return {
    ...user,
    id: String(pickFirst(user.id, user._id, user.userId, user.user_id)),
    name: pickFirst(user.name, user.fullName, user.full_name, 'User'),
    phone: pickFirst(user.phone, user.phoneNumber, user.phone_number, ''),
    whatsapp: pickFirst(user.whatsapp, user.whatsappNumber, user.whatsapp_number, ''),
    address: pickFirst(user.address, user.deliveryAddress, user.delivery_address, ''),
    email: pickFirst(user.email, user.emailAddress, user.email_address, ''),
  };
}

function normalizeSession(payload = {}) {
  const data = payload?.data || payload;
  const user = data.user || data.customer || data.profile || data;

  return {
    token: pickFirst(data.token, data.jwt, data.accessToken, data.access_token),
    user: normalizeProfile(user),
  };
}

function getCustomerName(order = {}) {
  return pickFirst(
    order.customerName,
    order.customer_name,
    order.customer?.name,
    order.user?.name,
    'Customer',
  );
}

function getOrderItems(order = {}) {
  return asArray(order.items || order.orderItems || order.order_items, ['items']).map(item => ({
    ...item,
    id: String(pickFirst(item.id, item._id, item.productId, item.product_id, item.name)),
    name: pickFirst(item.name, item.productName, item.product_name, item.product?.name, 'Item'),
    quantity: numberOrZero(pickFirst(item.quantity, item.qty, 1)),
    price: numberOrZero(pickFirst(item.price, item.unitPrice, item.unit_price, item.line_total)),
    unit: pickFirst(item.unit, item.size, item.product?.unit, ''),
  }));
}

function normalizeOrder(order = {}) {
  const items = getOrderItems(order);
  const bill = order.bill || order.totals || {};
  const subtotal = numberOrZero(pickFirst(bill.subtotal, order.subtotal, order.itemTotal, order.item_total));
  const delivery = numberOrZero(pickFirst(bill.delivery, bill.deliveryCharge, bill.delivery_charge, order.deliveryCharge, order.delivery_charge));
  const discount = numberOrZero(pickFirst(bill.discount, bill.discountAmount, order.discount));
  const grandTotal = numberOrZero(pickFirst(
    bill.grandTotal,
    bill.grand_total,
    order.grandTotal,
    order.grand_total,
    order.total,
    order.totalAmount,
  ));

  return {
    ...order,
    id: String(pickFirst(order.id, order._id, order.orderId, order.order_id)),
    date: pickFirst(order.date, order.createdAt, order.created_at, order.updatedAt, ''),
    status: pickFirst(order.status, order.orderStatus, order.order_status, 'Pending'),
    paymentStatus: pickFirst(order.paymentStatus, order.payment_status, 'Pending'),
    paymentMethod: pickFirst(order.paymentMethod, order.payment_method, 'Cash'),
    itemCount: numberOrZero(pickFirst(order.itemCount, order.item_count, items.length)),
    total: grandTotal,
    canCancel: asBoolean(pickFirst(order.canCancel, order.can_cancel, order.cancellable), false),
    previewImg: pickFirst(order.previewImg, order.previewImage, order.imageUrl, items[0]?.imageUrl, null),
    address: pickFirst(order.address, order.deliveryAddress, order.delivery_address, ''),
    mapUrl: pickFirst(order.mapUrl, order.map_url, order.googleMapsUrl, order.google_maps_url, ''),
    deliveryDistanceKm: pickFirst(order.deliveryDistanceKm, order.delivery_distance_km, null),
    deliveryRadiusKmSnapshot: pickFirst(order.deliveryRadiusKmSnapshot, order.delivery_radius_km_snapshot, null),
    deliveryCostPerKmSnapshot: pickFirst(order.deliveryCostPerKmSnapshot, order.delivery_cost_per_km_snapshot, null),
    freeDeliveryOfferSnapshot: asBoolean(pickFirst(order.freeDeliveryOfferSnapshot, order.free_delivery_offer_snapshot), false),
    belowThresholdDelivery: asBoolean(pickFirst(order.belowThresholdDelivery, order.below_threshold_delivery), false),
    belowThresholdDeliveryCharge: numberOrZero(pickFirst(order.belowThresholdDeliveryCharge, order.below_threshold_delivery_charge)),
    deliveryMessage: pickFirst(order.deliveryMessage, order.delivery_message, ''),
    customer: {
      name: getCustomerName(order),
      phone: pickFirst(order.phone, order.customerPhone, order.customer_phone, order.customer?.phone, ''),
      whatsapp: pickFirst(order.whatsapp, order.whatsappNumber, order.customer?.whatsapp, order.customer?.whatsappNumber, ''),
      address: pickFirst(order.address, order.deliveryAddress, order.delivery_address, order.customer?.address, ''),
    },
    items,
    bill: {
      subtotal,
      delivery,
      discount,
      grandTotal,
      belowThresholdDelivery: asBoolean(pickFirst(order.belowThresholdDelivery, order.below_threshold_delivery), false),
      belowThresholdDeliveryCharge: numberOrZero(pickFirst(order.belowThresholdDeliveryCharge, order.below_threshold_delivery_charge)),
    },
  };
}

function normalizeDashboard(payload = {}) {
  const data = payload?.data || payload?.dashboard || payload;
  const metrics = data.metrics || {};
  const reports = data.reports || data.salesReport || {};

  return {
    isShopOpen: asBoolean(pickFirst(data.isShopOpen, data.shopOpen, data.shop_open), true),
    metrics: {
      todayOrders: numberOrZero(pickFirst(metrics.todayOrders, metrics.today_orders, data.todayOrders)),
      todaySales: numberOrZero(pickFirst(metrics.todaySales, metrics.today_sales, data.todaySales)),
      pendingOrders: numberOrZero(pickFirst(metrics.pendingOrders, metrics.pending_orders, data.pendingOrders)),
      deliveredOrders: numberOrZero(pickFirst(metrics.deliveredOrders, metrics.delivered_orders, data.deliveredOrders)),
      cashTotal: numberOrZero(pickFirst(metrics.cashTotal, metrics.cash_total, data.cashTotal)),
      upiTotal: numberOrZero(pickFirst(metrics.upiTotal, metrics.upi_total, data.upiTotal)),
      pendingPaymentTotal: numberOrZero(pickFirst(metrics.pendingPaymentTotal, metrics.pending_payment_total, data.pendingPaymentTotal)),
    },
    reports: {
      weekSales: numberOrZero(pickFirst(reports.weekSales, reports.week_sales, data.weekSales)),
      monthSales: numberOrZero(pickFirst(reports.monthSales, reports.month_sales, data.monthSales)),
    },
    latestOrders: asArray(data.latestOrders || data.latest_orders, ['latestOrders', 'orders']).map(normalizeOrder),
    productAlerts: {
      outOfStock: numberOrZero(pickFirst(data.productAlerts?.outOfStock, data.product_alerts?.out_of_stock, data.outOfStock)),
      lowStock: numberOrZero(pickFirst(data.productAlerts?.lowStock, data.product_alerts?.low_stock, data.lowStock)),
    },
    topProducts: asArray(data.topProducts || data.top_products, ['topProducts']).map(product => ({
      ...product,
      id: String(pickFirst(product.id, product._id, product.productId, product.name)),
      name: pickFirst(product.name, product.productName, product.product_name, 'Product'),
      sales: numberOrZero(pickFirst(product.sales, product.salesCount, product.sales_count, product.quantity)),
      amount: numberOrZero(pickFirst(product.amount, product.salesAmount, product.sales_amount, product.total)),
    })),
  };
}

function normalizeNotification(item = {}) {
  const id = String(pickFirst(item.id, item._id));
  const read = asBoolean(pickFirst(item.read, item.isRead, item.is_read), false);
  const createdAt = pickFirst(item.createdAt, item.created_at, item.timestamp);
  
  // Calculate simple timeLabel if missing
  let timeLabel = item.timeLabel || item.time_ago || item.timeAgo;
  if (!timeLabel && createdAt) {
    const diff = Math.max(0, new Date() - new Date(createdAt));
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    
    if (days > 0) timeLabel = `${days}d ago`;
    else if (hrs > 0) timeLabel = `${hrs}h ago`;
    else if (mins > 0) timeLabel = `${mins}m ago`;
    else timeLabel = 'Just now';
  }

  return {
    ...item,
    id,
    title: pickFirst(item.title, item.heading, ''),
    body: pickFirst(item.body, item.message, item.text, ''),
    type: pickFirst(item.type, item.status, 'info'),
    sourceType: pickFirst(item.sourceType, item.source_type, null),
    sourceId: pickFirst(item.sourceId, item.source_id, null),
    actionType: pickFirst(item.actionType, item.action_type, null),
    actionPayload: pickFirst(item.actionPayload, item.action_payload, null),
    read,
    createdAt,
    timeLabel,
  };
}

export const mapNotification = normalizeNotification;


export {
  asArray,
  normalizeCartCalculation,
  normalizeCategory,
  normalizeDashboard,
  normalizeImageUrl,
  normalizeOrder,
  normalizeProduct,
  normalizeProfile,
  normalizeSession,
  normalizeSettings,
  normalizeNotification,
  pickFirst,
};
