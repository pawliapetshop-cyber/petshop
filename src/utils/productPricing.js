const DISCOUNT_TYPES = new Set(["none", "percent", "fixed"]);

const normalizeDiscountType = (type) => (DISCOUNT_TYPES.has(type) ? type : "none");

const getActiveProductDiscount = (product, now = new Date()) => {
  const type = normalizeDiscountType(product?.discountType || "none");
  const value = Number(product?.discountValue) || 0;

  if (type === "none" || value <= 0) {
    return null;
  }

  const startsAt = product?.discountStartDate ? new Date(product.discountStartDate) : null;
  const endsAt = product?.discountEndDate ? new Date(product.discountEndDate) : null;

  if (startsAt && startsAt > now) {
    return null;
  }

  if (endsAt && endsAt < now) {
    return null;
  }

  return {
    type,
    value,
    label: product?.discountLabel || "Oferta"
  };
};

const getDiscountedPrice = (price, product, now = new Date()) => {
  const originalPrice = Math.max(Number(price) || 0, 0);
  const discount = getActiveProductDiscount(product, now);

  if (!discount) {
    return {
      originalPrice,
      finalPrice: originalPrice,
      discountAmount: 0,
      discountPercent: 0,
      hasDiscount: false,
      discountLabel: ""
    };
  }

  const rawDiscountAmount = discount.type === "percent"
    ? originalPrice * (discount.value / 100)
    : discount.value;
  const discountAmount = Math.min(Math.max(rawDiscountAmount, 0), originalPrice);
  const finalPrice = Math.max(originalPrice - discountAmount, 0);
  const discountPercent = originalPrice > 0
    ? Math.round((discountAmount / originalPrice) * 100)
    : 0;

  return {
    originalPrice,
    finalPrice,
    discountAmount,
    discountPercent,
    hasDiscount: discountAmount > 0,
    discountLabel: discount.label
  };
};

module.exports = {
  getActiveProductDiscount,
  getDiscountedPrice,
  normalizeDiscountType
};
