function pickFirst(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
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

function normalizeProduct(item = {}) {
  const id = String(pickFirst(item.id, item._id, item.productId, item.product_id, item.slug));

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
    imageUrl: pickFirst(item.imageUrl, item.image_url, item.image, item.url, null),
    imageUri: pickFirst(item.imageUrl, item.image_url, item.image, item.url, null),
    description: pickFirst(item.description, item.shortDescription, item.short_description, ''),
    relatedProducts: asArray(item.relatedProducts || item.related_products || item.related, ['products']).map(normalizeProduct),
  };
}

function normalizeCategory(item = {}) {
  const id = String(pickFirst(item.id, item._id, item.categoryId, item.category_id, item.name));

  return {
    ...item,
    id,
    name: pickFirst(item.name, item.categoryName, item.category_name, 'Category'),
    count: pickFirst(item.count, item.productCount, item.product_count, item.productsCount, 0),
    productCount: pickFirst(item.count, item.productCount, item.product_count, item.productsCount, 0),
    imageUrl: pickFirst(item.imageUrl, item.image_url, item.image, null),
    imageUri: pickFirst(item.imageUrl, item.image_url, item.image, null),
    type: pickFirst(item.type, item.storeType, item.store_type, ''),
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
  };
}

function normalizeSession(payload = {}) {
  const data = payload?.data || payload;
  const user = data.user || data.customer || data.profile || data;

  return {
    token: pickFirst(data.token, data.jwt, data.accessToken, data.access_token),
    user,
  };
}

export {
  asArray,
  normalizeCartCalculation,
  normalizeCategory,
  normalizeProduct,
  normalizeSession,
  normalizeSettings,
  pickFirst,
};
