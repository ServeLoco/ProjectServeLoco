/**
 * Light product/variant normalizers so the web app handles the same API
 * shapes as the customer app (camelCase + snake_case).
 */

function pickFirst(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function numberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asBoolean(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return Boolean(v);
}

function asArray(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const k of keys) {
      if (Array.isArray(value[k])) return value[k];
    }
  }
  return [];
}

export function normalizeVariant(v = {}) {
  return {
    id: pickFirst(v.id, v.variantId, v.variant_id),
    label: pickFirst(v.label, '') || '',
    price: numberOrZero(pickFirst(v.price)),
    originalPrice: pickFirst(v.originalPrice, v.original_price, null) ?? null,
    original_price: pickFirst(v.originalPrice, v.original_price, null) ?? null,
    available: asBoolean(pickFirst(v.available), true),
    isDefault: asBoolean(pickFirst(v.isDefault, v.is_default), false),
    displayOrder: numberOrZero(pickFirst(v.displayOrder, v.display_order, 0)),
  };
}

export function normalizeProduct(item = {}) {
  if (!item || typeof item !== 'object') return item;

  const variants = asArray(item.variants, ['variants'])
    .map(normalizeVariant)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const hasVariants = asBoolean(
    pickFirst(item.hasVariants, item.has_variants),
    variants.length > 0
  );
  const basePrice = numberOrZero(
    pickFirst(item.price, item.salePrice, item.sale_price, item.unitPrice)
  );
  const minPrice = numberOrZero(pickFirst(item.minPrice, item.min_price, basePrice));
  const isCombo = asBoolean(pickFirst(item.isCombo, item.is_combo), false);
  const shopIsOpen = asBoolean(pickFirst(item.shopIsOpen, item.shop_is_open), true);
  const available = asBoolean(
    pickFirst(item.available, item.isAvailable, item.is_available, item.inStock),
    true
  );

  return {
    ...item,
    id: pickFirst(item.id, item._id, item.productId, item.product_id),
    name: pickFirst(item.name, item.productName, item.product_name, 'Product'),
    price: basePrice,
    originalPrice: pickFirst(item.originalPrice, item.original_price, item.mrp, null) ?? null,
    original_price: pickFirst(item.originalPrice, item.original_price, item.mrp, null) ?? null,
    discountLabel: pickFirst(item.discountLabel, item.discount_label, null) ?? null,
    discount_label: pickFirst(item.discountLabel, item.discount_label, null) ?? null,
    unit: pickFirst(item.unit, item.size, item.unitSize, item.unit_size, '') || '',
    description: pickFirst(item.description, item.shortDescription, item.short_description, '') || '',
    available,
    isCombo,
    is_combo: isCombo,
    variants,
    hasVariants,
    has_variants: hasVariants,
    minPrice,
    min_price: minPrice,
    variantPrompt: pickFirst(item.variantPrompt, item.variant_prompt, null) ?? null,
    variant_prompt: pickFirst(item.variantPrompt, item.variant_prompt, null) ?? null,
    shopId: pickFirst(item.shopId, item.shop_id, null) ?? null,
    shop_id: pickFirst(item.shopId, item.shop_id, null) ?? null,
    shopIsOpen,
    shop_is_open: shopIsOpen,
    relatedProducts: asArray(
      item.relatedProducts || item.related_products || item.related,
      ['products']
    ).map(normalizeProduct),
  };
}

export function isMultiVariantProduct(product) {
  return (product?.variants?.length ?? 0) > 1;
}

export function getDisplayPrice(product) {
  if (isMultiVariantProduct(product)) {
    return numberOrZero(pickFirst(product.minPrice, product.min_price, product.price));
  }
  return numberOrZero(product?.price);
}

/** Build cart/order line payloads matching the customer-app + API contract. */
export function toCartApiItem(item) {
  const type = item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product');
  const isCombo = type === 'combo';
  return {
    productId: item.product.id,
    variantId: isCombo ? null : (item.variant?.id ?? null),
    quantity: item.quantity,
    type,
    isCombo,
  };
}
