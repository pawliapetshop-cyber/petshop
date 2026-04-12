const db = require("../models");
const {
  Product,
  ProductVariant,
  Category,
  ProductImage,
  Banner,
  Coupon,
  Customer,
  Review,
  ReviewImage,
  Store,
  Order,
  OrderItem
} = db;
const { Op } = require("sequelize");
const {
  getShippingCities,
  getStoreShippingConfig,
  findShippingCityConfig,
  isValidShippingCity
} = require("../utils/shippingConfig");
const {
  notifyNewOrder,
  notifyLowStock
} = require("../utils/notifications");
const { getDiscountedPrice } = require("../utils/productPricing");

const emptyCheckoutForm = {
  name: "",
  document: "",
  email: "",
  phone: "",
  city: "",
  address: "",
  paymentMethod: "",
  couponCode: ""
};

const productIncludes = [Category, ProductImage, ProductVariant];
const approvedReviewInclude = [{
  model: Review,
  where: { status: "approved" },
  required: false,
  include: [ReviewImage]
}];
const defaultShopFilters = {
  category: "",
  search: "",
  sort: "featured",
  stock: "",
  variantOnly: "",
  minPrice: "",
  maxPrice: ""
};

const getStoreThemeContent = (store, summary = {}) => ({
  heroEyebrow: store?.themeConfig?.heroEyebrow || "Catalogo comercial",
  heroTitle: store?.themeConfig?.heroTitle || `Encuentra lo ideal en ${store?.name || "nuestra tienda"}`,
  heroSubtitle: store?.themeConfig?.heroSubtitle || `${summary.totalProducts || 0} productos disponibles, ${summary.variantProducts || 0} con opciones de variante.`,
  showRecommended: store?.themeConfig?.showRecommended !== false,
  recommendedTitle: store?.themeConfig?.recommendedTitle || "Recomendados para comprar hoy",
  showNewArrivals: store?.themeConfig?.showNewArrivals !== false,
  newArrivalsTitle: store?.themeConfig?.newArrivalsTitle || "Recien agregados al catalogo",
  showFeaturedCategories: store?.themeConfig?.showFeaturedCategories !== false,
  featuredCategoriesTitle: store?.themeConfig?.featuredCategoriesTitle || "Explora por categoria"
});

const getStorePromoSections = (store) =>
  (store?.themeConfig?.promoSections || [])
    .filter((section) =>
      section &&
      section.isActive !== false &&
      (section.title || section.description || section.image || section.buttonLabel)
    )
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));

const buildStorePath = (storeSlug, path = "") => `/s/${storeSlug}${path}`;

const getStoreCartMatcher = (store) => (item) =>
  item && (item.StoreId === store.id || item.storeSlug === store.slug);

const getStoreCart = (req) => {
  const store = req.store;
  return (req.session.cart || []).filter(getStoreCartMatcher(store));
};

const replaceStoreCart = (req, storeCart) => {
  const store = req.store;
  const matcher = getStoreCartMatcher(store);
  const otherItems = (req.session.cart || []).filter((item) => !matcher(item));
  req.session.cart = [...otherItems, ...storeCart];
};

const buildStatusEntry = (status, note) => ({
  status,
  note: note || "",
  createdAt: new Date().toISOString(),
  actor: "cliente"
});

const normalizeCheckoutInput = (body = {}) => ({
  name: (body.name || "").trim(),
  document: (body.document || "").trim(),
  email: (body.email || "").trim(),
  phone: (body.phone || "").trim(),
  city: (body.city || "").trim(),
  address: (body.address || "").trim(),
  paymentMethod: (body.paymentMethod || "").trim(),
  couponCode: (body.couponCode || "").trim().toUpperCase()
});

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString("es-CO")}`;

const getCheckoutCityOptions = (store) =>
  getStoreShippingConfig(store).cities.map((city) => ({
    value: city.label,
    key: city.key,
    label: city.label
  }));

const getShippingSummary = (store, cityValue = "") => {
  const cityConfig = findShippingCityConfig(store, cityValue);

  if (!cityConfig) {
    return {
      shippingCost: null,
      shippingLabel: "Selecciona tu ciudad para calcular el envio",
      freeShipping: false,
      pendingShipping: true,
      cityLabel: ""
    };
  }

  const shippingCost = cityConfig.chargeShipping ? Number(cityConfig.cost) || 0 : 0;

  return {
    shippingCost,
    shippingLabel: shippingCost === 0
      ? `Envio gratis a ${cityConfig.label}`
      : `Envio a ${cityConfig.label}`,
    freeShipping: shippingCost === 0,
    pendingShipping: false,
    cityLabel: cityConfig.label
  };
};

const canUseCashOnDelivery = (store, cityValue = "") => {
  const cityConfig = findShippingCityConfig(store, cityValue);
  return Boolean(cityConfig?.allowCashOnDelivery);
};

const buildCheckoutSummary = (store, cart = [], formData = emptyCheckoutForm, couponData = null) => {
  const subtotal = cart.reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const discountAmount = Number(couponData?.discountAmount) || 0;
  const discountedSubtotal = Math.max(subtotal - discountAmount, 0);
  const shippingSummary = getShippingSummary(store, formData.city);
  const total = discountedSubtotal + (shippingSummary.shippingCost || 0);

  return {
    subtotal,
    discountAmount,
    discountedSubtotal,
    shippingCost: shippingSummary.shippingCost,
    total,
    shippingLabel: shippingSummary.shippingLabel,
    freeShipping: shippingSummary.freeShipping,
    pendingShipping: shippingSummary.pendingShipping,
    cityLabel: shippingSummary.cityLabel,
    couponCode: couponData?.coupon?.code || "",
    couponTitle: couponData?.coupon?.title || "",
    couponApplied: discountAmount > 0
  };
};

const getCouponEligibleSubtotal = (coupon, cart = []) => {
  if (!coupon?.ProductId) {
    return cart.reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  }

  return cart
    .filter((item) => Number(item.productId) === Number(coupon.ProductId))
    .reduce((total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
};

const resolveCouponForCheckout = async (req, code, cart = []) => {
  const normalizedCode = (code || "").trim().toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  const coupon = await Coupon.findOne({
    where: {
      code: normalizedCode,
      isActive: true,
      StoreId: req.store.id
    },
    include: [Product]
  });

  if (!coupon) {
    throw new Error("El cupon ingresado no existe o no esta disponible.");
  }

  if ((Number(coupon.usageCount) || 0) >= (Number(coupon.usageLimit) || 0)) {
    throw new Error("Este cupon ya alcanzo su limite de uso.");
  }

  if (coupon.ProductId && (!coupon.Product || !coupon.Product.isActive || coupon.Product.StoreId !== req.store.id)) {
    throw new Error("Este cupon ya no tiene un producto valido para aplicarse.");
  }

  const eligibleSubtotal = getCouponEligibleSubtotal(coupon, cart);
  const minimumCartAmount = Number(coupon.minimumCartAmount) || 0;

  if (eligibleSubtotal <= 0) {
    throw new Error("Este cupon no aplica a los productos que tienes en el carrito.");
  }

  if (!coupon.ProductId && minimumCartAmount > 0 && eligibleSubtotal < minimumCartAmount) {
    throw new Error(`Este cupon requiere una compra minima de ${formatCurrency(minimumCartAmount)}.`);
  }

  let discountAmount = 0;
  if (coupon.discountType === "percent") {
    discountAmount = eligibleSubtotal * ((Number(coupon.discountValue) || 0) / 100);
  } else {
    discountAmount = Number(coupon.discountValue) || 0;
  }

  discountAmount = Math.min(discountAmount, eligibleSubtotal);

  return {
    coupon,
    eligibleSubtotal,
    discountAmount,
    minimumCartAmount
  };
};

const buildShopWhere = ({ category, search, storeId }) => {
  const where = {
    isActive: true,
    StoreId: storeId
  };

  if (category) where.CategoryId = category;
  if (search) where.name = { [Op.like]: `%${search}%` };

  return where;
};

const getMainImage = (product) =>
  product.ProductImages?.find((image) => image.isMain)?.image ||
  product.ProductImages?.[0]?.image ||
  product.image ||
  null;

const getProductInventory = (product) => {
  const variants = (product.ProductVariants || []).map((variant) => {
    const stock = Number(variant.stock) || 0;
    const reservedStock = Number(variant.reservedStock) || 0;
    const originalPrice = variant.price === null || variant.price === undefined
      ? Number(product.price) || 0
      : Number(variant.price);
    const pricing = getDiscountedPrice(originalPrice, product);
    return {
      id: variant.id,
      name: variant.name,
      price: variant.price,
      originalPrice: pricing.originalPrice,
      finalPrice: pricing.finalPrice,
      discountPercent: pricing.discountPercent,
      hasDiscount: pricing.hasDiscount,
      stock,
      reservedStock,
      available: stock - reservedStock
    };
  });

  const activeVariants = variants.filter((variant) => variant.name);

  if (activeVariants.length > 0) {
    const stock = activeVariants.reduce((total, variant) => total + variant.stock, 0);
    const reservedStock = activeVariants.reduce((total, variant) => total + variant.reservedStock, 0);
    return {
      hasVariants: true,
      stock,
      reservedStock,
      available: stock - reservedStock,
      variants: activeVariants
    };
  }

  const stock = Number(product.stock) || 0;
  const reservedStock = Number(product.reservedStock) || 0;
  return {
    hasVariants: false,
    stock,
    reservedStock,
    available: stock - reservedStock,
    variants: []
  };
};

const buildLinePricing = (product, originalPrice) => getDiscountedPrice(originalPrice, product);

const decorateProduct = (product) => {
  if (!product) {
    return product;
  }

  product.inventorySummary = getProductInventory(product);
  product.mainImage = getMainImage(product);

  const variantPrices = product.inventorySummary.variants
    .map((variant) => (variant.price === null || variant.price === undefined ? Number(product.price) || 0 : Number(variant.price)))
    .filter((price) => !Number.isNaN(price));

  const basePrice = Number(product.price) || 0;
  const originalPrices = variantPrices.length > 0 ? [...variantPrices, basePrice] : [basePrice];
  const pricingOptions = originalPrices.map((price) => buildLinePricing(product, price));
  const finalPrices = pricingOptions.map((pricing) => pricing.finalPrice);
  const originalMinPrice = Math.min(...originalPrices);
  const originalMaxPrice = Math.max(...originalPrices);
  const effectiveMinPrice = Math.min(...finalPrices);
  const effectiveMaxPrice = Math.max(...finalPrices);
  const basePricing = buildLinePricing(product, basePrice);
  const maxDiscountPercent = Math.max(...pricingOptions.map((pricing) => pricing.discountPercent || 0));

  product.pricingSummary = {
    basePrice,
    originalMinPrice,
    originalMaxPrice,
    effectiveMinPrice,
    effectiveMaxPrice,
    hasPriceRange: effectiveMinPrice !== effectiveMaxPrice,
    hasDiscount: pricingOptions.some((pricing) => pricing.hasDiscount),
    discountPercent: maxDiscountPercent,
    discountLabel: basePricing.discountLabel,
    baseOriginalPrice: basePricing.originalPrice,
    baseFinalPrice: basePricing.finalPrice
  };

  const createdAt = product.createdAt ? new Date(product.createdAt) : null;
  const ageInDays = createdAt
    ? Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  product.marketingSummary = {
    isNew: ageInDays !== null && ageInDays <= 21,
    isRecommended: product.inventorySummary.hasVariants || product.inventorySummary.available >= 10,
    isLowStock: product.inventorySummary.available <= 5
  };

  const reviews = product.Reviews || [];
  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0
    ? reviews.reduce((total, review) => total + (Number(review.rating) || 0), 0) / reviewCount
    : 0;

  product.reviewSummary = {
    count: reviewCount,
    averageRating,
    averageLabel: reviewCount > 0 ? averageRating.toFixed(1) : "0.0"
  };

  return product;
};

const normalizeShopFilters = (query = {}) => ({
  category: (query.category || "").trim(),
  search: (query.search || "").trim(),
  sort: (query.sort || "featured").trim(),
  stock: (query.stock || "").trim(),
  variantOnly: query.variantOnly === "1" ? "1" : "",
  minPrice: (query.minPrice || "").trim(),
  maxPrice: (query.maxPrice || "").trim()
});

const sortProducts = (products, sort) => {
  const sortedProducts = [...products];

  switch (sort) {
    case "price-asc":
      sortedProducts.sort((a, b) => a.pricingSummary.effectiveMinPrice - b.pricingSummary.effectiveMinPrice);
      break;
    case "price-desc":
      sortedProducts.sort((a, b) => b.pricingSummary.effectiveMaxPrice - a.pricingSummary.effectiveMaxPrice);
      break;
    case "name-asc":
      sortedProducts.sort((a, b) => a.name.localeCompare(b.name, "es"));
      break;
    case "name-desc":
      sortedProducts.sort((a, b) => b.name.localeCompare(a.name, "es"));
      break;
    case "stock-desc":
      sortedProducts.sort((a, b) => b.inventorySummary.available - a.inventorySummary.available);
      break;
    default:
      sortedProducts.sort((a, b) => {
        if (b.inventorySummary.hasVariants !== a.inventorySummary.hasVariants) {
          return Number(b.inventorySummary.hasVariants) - Number(a.inventorySummary.hasVariants);
        }

        return b.createdAt - a.createdAt;
      });
      break;
  }

  return sortedProducts;
};

const getAvailableProducts = async (filters) => {
  const products = await Product.findAll({
    where: buildShopWhere(filters),
    include: [...productIncludes, ...approvedReviewInclude]
  });

  const minPrice = filters.minPrice === "" ? null : Number(filters.minPrice);
  const maxPrice = filters.maxPrice === "" ? null : Number(filters.maxPrice);

  return sortProducts(
    products
      .map((product) => decorateProduct(product))
      .filter((product) => {
        if (product.inventorySummary.available <= 0) {
          return false;
        }

        if (filters.stock === "ready" && product.inventorySummary.available <= 5) {
          return false;
        }

        if (filters.variantOnly === "1" && !product.inventorySummary.hasVariants) {
          return false;
        }

        if (!Number.isNaN(minPrice) && minPrice !== null && product.pricingSummary.effectiveMaxPrice < minPrice) {
          return false;
        }

        if (!Number.isNaN(maxPrice) && maxPrice !== null && product.pricingSummary.effectiveMinPrice > maxPrice) {
          return false;
        }

        return true;
      }),
    filters.sort
  );
};

const renderShop = async (req, res, options = {}) => {
  const store = req.store;
  const filters = {
    ...defaultShopFilters,
    ...normalizeShopFilters(options)
  };

  const categories = await Category.findAll({
    where: { StoreId: store.id }
  });

  const products = await getAvailableProducts({
    ...filters,
    storeId: store.id
  });

  const summary = {
    totalProducts: products.length,
    variantProducts: products.filter((product) => product.inventorySummary.hasVariants).length,
    categories: new Set(products.map((product) => product.CategoryId)).size
  };
  const themeContent = getStoreThemeContent(store, summary);

  const recommendedProducts = products.filter((product) => product.marketingSummary.isRecommended).slice(0, 3);
  const newProducts = products.filter((product) => product.marketingSummary.isNew).slice(0, 4);
  const featuredCategoryIds = (store?.themeConfig?.featuredCategoryIds || []).map((id) => Number(id));
  const featuredCategories = categories.filter((category) => featuredCategoryIds.includes(Number(category.id))).slice(0, 3);
  const promoSections = getStorePromoSections(store);
  const banners = await Banner.findAll({
    where: {
      StoreId: store.id,
      isActive: true
    },
    include: [{
      model: Product,
      include: [ProductImage]
    }],
    order: [["sortOrder", "ASC"], ["createdAt", "DESC"]]
  });

  const visibleBanners = banners.filter((banner) =>
    banner.Product &&
    banner.Product.isActive &&
    banner.Product.StoreId === store.id
  );

  res.status(options.status || 200).render("shop", {
    products,
    categories,
    filters,
    summary,
    themeContent,
    recommendedProducts,
    newProducts,
    featuredCategories,
    promoSections,
    banners: visibleBanners,
    cart: getStoreCart(req),
    store,
    storeBasePath: buildStorePath(store.slug),
    errorMessage: options.errorMessage || "",
    successMessage: options.successMessage || ""
  });
};

const renderCart = (res, req, options = {}) => {
  const cart = getStoreCart(req);
  res.status(options.status || 200).render("cart", {
    cart,
    store: req.store,
    storeBasePath: buildStorePath(req.store.slug),
    errorMessage: options.errorMessage || "",
    successMessage: options.successMessage || ""
  });
};

const renderCheckout = (res, req, options = {}) => {
  const cart = getStoreCart(req);

  if (cart.length === 0) {
    return res.redirect(buildStorePath(req.store.slug));
  }

  const formData = options.formData || emptyCheckoutForm;
  const checkoutSummary = buildCheckoutSummary(req.store, cart, formData, options.couponData || null);
  const shippingCities = getCheckoutCityOptions(req.store);
  const shippingConfig = getStoreShippingConfig(req.store);

  res.status(options.status || 200).render("checkout", {
    cart,
    errorMessages: options.errorMessages || [],
    formData,
    checkoutSummary,
    shippingCities,
    shippingConfig,
    store: req.store,
    storeBasePath: buildStorePath(req.store.slug)
  });
};

const renderProductDetail = async (req, res, productId, options = {}) => {
  const store = req.store;
  const product = await Product.findByPk(productId, {
    include: [...productIncludes, ...approvedReviewInclude]
  });

  if (!product || !product.isActive || product.StoreId !== store.id) {
    return res.status(404).render("orderSuccess", {
      orderId: null,
      title: "Producto no encontrado",
      message: "El producto que buscas no esta disponible.",
      buttonLabel: "Volver a la tienda",
      buttonHref: buildStorePath(store.slug),
      store,
      storeBasePath: buildStorePath(store.slug),
      cart: getStoreCart(req)
    });
  }

  decorateProduct(product);

  const relatedProducts = (await Product.findAll({
    where: {
      CategoryId: product.CategoryId,
      id: { [Op.ne]: product.id },
      isActive: true,
      StoreId: store.id
    },
    include: [...productIncludes, ...approvedReviewInclude],
    limit: 4
  }))
    .map((item) => decorateProduct(item))
    .filter((item) => item.inventorySummary.available > 0);

  if (product.ProductImages) {
    product.ProductImages.sort((a, b) => b.isMain - a.isMain);
  }

  relatedProducts.forEach((item) => {
    if (item.ProductImages) {
      item.ProductImages.sort((a, b) => b.isMain - a.isMain);
    }
  });

  res.status(options.status || 200).render("productDetail", {
    product,
    relatedProducts,
    cart: getStoreCart(req),
    store,
    storeBasePath: buildStorePath(store.slug),
    errorMessage: options.errorMessage || "",
    successMessage: options.successMessage || "",
    selectedVariantId: options.selectedVariantId || "",
    reviewErrors: options.reviewErrors || [],
    reviewFormData: options.reviewFormData || {
      customerName: "",
      customerEmail: "",
      rating: "",
      comment: ""
    }
  });
};

const buildCartKey = (productId, variantId) =>
  variantId ? `p-${productId}-v-${variantId}` : `p-${productId}`;

const findCartItem = (cart, itemKey) => cart.find((entry) => entry.cartKey === itemKey);

exports.redirectToDefaultStore = async (req, res) => {
  const defaultStore =
    await Store.findOne({
      where: { slug: "pawlia", isActive: true }
    }) ||
    await Store.findOne({
      where: { isActive: true },
      order: [["id", "ASC"]]
    });

  if (!defaultStore) {
    return res.status(404).render("errors/notFound", {
      layout: "layout",
      title: "Tienda no encontrada",
      message: "No encontramos la tienda principal para mostrar el catalogo."
    });
  }

  res.redirect(buildStorePath(defaultStore.slug));
};

exports.shop = async (req, res) => {
  await renderShop(req, res, req.query);
};

exports.contactPage = async (req, res) => {
  res.render("contact", {
    store: req.store,
    storeBasePath: buildStorePath(req.store.slug),
    cart: getStoreCart(req)
  });
};

exports.productDetail = async (req, res) => {
  await renderProductDetail(req, res, req.params.id);
};

exports.createReview = async (req, res) => {
  const store = req.store;
  const product = await Product.findByPk(req.params.id, {
    include: [...productIncludes, ...approvedReviewInclude]
  });

  if (!product || !product.isActive || product.StoreId !== store.id) {
    return res.redirect(buildStorePath(store.slug));
  }

  const reviewFormData = {
    customerName: (req.body.customerName || "").trim(),
    customerEmail: (req.body.customerEmail || "").trim().toLowerCase(),
    rating: (req.body.rating || "").trim(),
    comment: (req.body.comment || "").trim()
  };
  const reviewErrors = [];
  const rating = Number(reviewFormData.rating);

  if (!reviewFormData.customerName) {
    reviewErrors.push("Debes ingresar tu nombre para dejar la resena.");
  }

  if (!reviewFormData.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewFormData.customerEmail)) {
    reviewErrors.push("Debes ingresar un correo valido para verificar tu compra.");
  }

  if (Number.isNaN(rating) || rating < 0.5 || rating > 5) {
    reviewErrors.push("La calificacion debe estar entre 0.5 y 5.");
  }

  if (!reviewFormData.comment) {
    reviewErrors.push("Escribe un comentario para completar la resena.");
  }

  const existingReview = reviewFormData.customerEmail
    ? await Review.findOne({
      where: {
        StoreId: store.id,
        ProductId: product.id,
        customerEmail: reviewFormData.customerEmail
      }
    })
    : null;

  if (existingReview) {
    reviewErrors.push("Ya registraste una resena para este producto con ese correo.");
  }

  const matchingOrder = reviewFormData.customerEmail
    ? await Order.findOne({
      where: {
        StoreId: store.id,
        email: reviewFormData.customerEmail,
        status: {
          [Op.in]: ["pago_validado", "aceptado", "preparando", "enviado", "entregado"]
        }
      },
      include: [{
        model: OrderItem,
        where: { ProductId: product.id },
        required: true
      }],
      order: [["createdAt", "DESC"]]
    })
    : null;

  if (!matchingOrder) {
    reviewErrors.push("Solo compradores verificados pueden calificar este producto con ese correo.");
  }

  if (reviewErrors.length > 0) {
    return renderProductDetail(req, res, product.id, {
      status: 400,
      reviewErrors,
      reviewFormData
    });
  }

  await db.sequelize.transaction(async (transaction) => {
    const review = await Review.create({
      customerName: reviewFormData.customerName,
      customerEmail: reviewFormData.customerEmail,
      rating,
      comment: reviewFormData.comment,
      status: "pending",
      hasImages: Boolean(req.files && req.files.length > 0),
      StoreId: store.id,
      ProductId: product.id,
      OrderId: matchingOrder.id
    }, { transaction });

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await ReviewImage.create({
          image: file.filename,
          ReviewId: review.id
        }, { transaction });
      }
    }
  });

  return renderProductDetail(req, res, product.id, {
    status: 201,
    successMessage: "Tu resena fue enviada y quedo pendiente de aprobacion.",
    reviewFormData: {
      customerName: "",
      customerEmail: "",
      rating: "",
      comment: ""
    }
  });
};

exports.addToCart = async (req, res) => {
  const productId = req.body.productId;
  const variantId = req.body.variantId ? String(req.body.variantId) : "";
  const product = await Product.findByPk(productId, {
    include: productIncludes
  });

  if (!product || !product.isActive || product.StoreId !== req.store.id) {
    return renderShop(req, res, {
      status: 404,
      errorMessage: "El producto seleccionado ya no esta disponible."
    });
  }

  decorateProduct(product);

  const cart = getStoreCart(req);

  const hasVariants = product.inventorySummary.hasVariants;
  const selectedVariant = hasVariants
    ? product.ProductVariants.find((variant) => String(variant.id) === variantId)
    : null;

  if (hasVariants && !selectedVariant) {
    return renderProductDetail(req, res, product.id, {
      status: 400,
      errorMessage: "Debes seleccionar una variante antes de agregar el producto.",
      selectedVariantId: variantId
    });
  }

  const available = hasVariants
    ? (Number(selectedVariant.stock) || 0) - (Number(selectedVariant.reservedStock) || 0)
    : product.inventorySummary.available;

  if (available <= 0) {
    return renderProductDetail(req, res, product.id, {
      status: 400,
      errorMessage: hasVariants
        ? `La variante ${selectedVariant.name} no tiene stock disponible.`
        : `${product.name} no tiene stock disponible.`,
      selectedVariantId: variantId
    });
  }

  const cartKey = buildCartKey(product.id, selectedVariant?.id);
  const existing = findCartItem(cart, cartKey);
  const totalInCart = existing ? existing.quantity : 0;

  if (totalInCart >= available) {
    return renderCart(res, req, {
      status: 400,
      errorMessage: `No puedes agregar mas unidades de ${product.name}${selectedVariant ? ` (${selectedVariant.name})` : ""}.`
    });
  }

  const variantPrice = selectedVariant?.price;
  const originalItemPrice = variantPrice === null || variantPrice === undefined
    ? product.price
    : Number(variantPrice);
  const itemPricing = buildLinePricing(product, originalItemPrice);
  const itemPrice = itemPricing.finalPrice;

  if (existing) {
    existing.quantity++;
    existing.price = itemPrice;
    existing.originalPrice = itemPricing.originalPrice;
    existing.discountAmount = itemPricing.discountAmount;
    existing.discountPercent = itemPricing.discountPercent;
  } else {
    cart.push({
      cartKey,
      productId: product.id,
      variantId: selectedVariant?.id || null,
      StoreId: req.store.id,
      storeSlug: req.store.slug,
      name: product.name,
      variantName: selectedVariant?.name || null,
      price: itemPrice,
      originalPrice: itemPricing.originalPrice,
      discountAmount: itemPricing.discountAmount,
      discountPercent: itemPricing.discountPercent,
      image: getMainImage(product),
      quantity: 1
    });
  }

  replaceStoreCart(req, cart);

  res.redirect(buildStorePath(req.store.slug, "/cart"));
};

exports.viewCart = (req, res) => {
  renderCart(res, req);
};

exports.updateCartItem = async (req, res) => {
  const itemKey = req.params.id;
  const quantity = Number(req.body.quantity);
  const cart = getStoreCart(req);
  const item = findCartItem(cart, itemKey);

  if (!item) {
    return renderCart(res, req, {
      status: 404,
      errorMessage: "No encontramos ese producto en el carrito."
    });
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    return renderCart(res, req, {
      status: 400,
      errorMessage: "La cantidad debe ser un numero entero mayor a 0."
    });
  }

  const product = await Product.findByPk(item.productId, {
    include: productIncludes
  });

  if (!product || !product.isActive || product.StoreId !== req.store.id) {
    replaceStoreCart(req, cart.filter((entry) => entry.cartKey !== itemKey));
    return renderCart(res, req, {
      status: 400,
      errorMessage: "El producto ya no esta disponible y fue retirado del carrito."
    });
  }

  decorateProduct(product);

  let available = product.inventorySummary.available;
  let itemLabel = product.name;

  if (item.variantId) {
    const variant = product.ProductVariants.find((entry) => entry.id === item.variantId);

    if (!variant) {
      replaceStoreCart(req, cart.filter((entry) => entry.cartKey !== itemKey));
      return renderCart(res, req, {
        status: 400,
        errorMessage: "La variante seleccionada ya no existe y fue retirada del carrito."
      });
    }

    available = (Number(variant.stock) || 0) - (Number(variant.reservedStock) || 0);
    item.variantName = variant.name;
    const originalPrice = variant.price === null || variant.price === undefined
      ? product.price
      : Number(variant.price);
    const pricing = buildLinePricing(product, originalPrice);
    item.price = pricing.finalPrice;
    item.originalPrice = pricing.originalPrice;
    item.discountAmount = pricing.discountAmount;
    item.discountPercent = pricing.discountPercent;
    itemLabel = `${product.name} (${variant.name})`;
  } else {
    const pricing = buildLinePricing(product, product.price);
    item.price = pricing.finalPrice;
    item.originalPrice = pricing.originalPrice;
    item.discountAmount = pricing.discountAmount;
    item.discountPercent = pricing.discountPercent;
  }

  item.name = product.name;
  item.image = getMainImage(product);

  if (quantity > available) {
    return renderCart(res, req, {
      status: 400,
      errorMessage: `Solo hay ${available} unidades disponibles de ${itemLabel}.`
    });
  }

  item.quantity = quantity;
  replaceStoreCart(req, cart);

  renderCart(res, req, {
    successMessage: `Actualizaste la cantidad de ${itemLabel}.`
  });
};

exports.removeFromCart = (req, res) => {
  const itemKey = req.params.id;
  const cart = getStoreCart(req);
  const before = cart.length;

  replaceStoreCart(req, cart.filter((item) => item.cartKey !== itemKey));

  const removed = before !== getStoreCart(req).length;
  renderCart(res, req, {
    successMessage: removed ? "Producto eliminado del carrito." : "",
    errorMessage: removed ? "" : "No encontramos ese producto en el carrito."
  });
};

exports.checkout = (req, res) => {
  renderCheckout(res, req);
};

exports.processCheckout = async (req, res) => {
  const cart = getStoreCart(req);

  if (cart.length === 0) {
    return res.redirect(buildStorePath(req.store.slug));
  }

  const formData = normalizeCheckoutInput(req.body);
  const errors = [];
  let couponData = null;

  try {
    couponData = await resolveCouponForCheckout(req, formData.couponCode, cart);
  } catch (error) {
    errors.push(error.message);
  }

  const checkoutSummary = buildCheckoutSummary(req.store, cart, formData, couponData);

  if (!formData.name) errors.push("El nombre completo es obligatorio.");
  if (!formData.document) errors.push("El documento es obligatorio.");
  if (!formData.phone) errors.push("El telefono es obligatorio.");
  if (!formData.city) errors.push("La ciudad es obligatoria.");
  if (formData.city && !isValidShippingCity(formData.city)) {
    errors.push("Debes seleccionar una ciudad valida.");
  }
  if (!formData.address) errors.push("La direccion es obligatoria.");
  if (!formData.paymentMethod) errors.push("Debes seleccionar un metodo de pago.");

  if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    errors.push("El correo no tiene un formato valido.");
  }

  if (
      formData.paymentMethod === "contraentrega" &&
    !canUseCashOnDelivery(req.store, formData.city)
  ) {
    errors.push("Contraentrega no esta disponible para la ciudad seleccionada.");
  }

  if (errors.length > 0) {
    return renderCheckout(res, req, {
      status: 400,
      errorMessages: errors,
      formData,
      couponData
    });
  }

  try {
    const lowStockAlerts = [];
    const order = await db.sequelize.transaction(async (transaction) => {
      let customer = await Customer.findOne({
        where: {
          StoreId: req.store.id,
          document: formData.document
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!customer && formData.email) {
        customer = await Customer.findOne({
          where: {
            StoreId: req.store.id,
            email: formData.email
          },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
      }

      if (customer) {
        await customer.update({
          name: formData.name,
          document: formData.document,
          email: formData.email || customer.email || null,
          phone: formData.phone,
          city: formData.city,
          address: formData.address,
          totalOrders: (Number(customer.totalOrders) || 0) + 1,
          totalSpent: (Number(customer.totalSpent) || 0) + (Number(checkoutSummary.total) || 0),
          lastOrderAt: new Date()
        }, { transaction });
      } else {
        customer = await Customer.create({
          name: formData.name,
          document: formData.document,
          email: formData.email || null,
          phone: formData.phone,
          city: formData.city,
          address: formData.address,
          totalOrders: 1,
          totalSpent: Number(checkoutSummary.total) || 0,
          lastOrderAt: new Date(),
          StoreId: req.store.id
        }, { transaction });
      }

      let lockedCoupon = null;

      if (couponData?.coupon) {
        lockedCoupon = await Coupon.findByPk(couponData.coupon.id, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!lockedCoupon || (Number(lockedCoupon.usageCount) || 0) >= (Number(lockedCoupon.usageLimit) || 0)) {
          throw new Error("El cupon ya no esta disponible.");
        }
      }

      const createdOrder = await Order.create({
        name: formData.name,
        document: formData.document,
        email: formData.email || null,
        phone: formData.phone,
        city: formData.city,
        address: formData.address,
        CustomerId: customer.id,
        paymentMethod: formData.paymentMethod,
        StoreId: req.store.id,
        CouponId: lockedCoupon?.id || null,
        couponCode: lockedCoupon?.code || null,
        couponDiscount: checkoutSummary.discountAmount,
        shippingCost: checkoutSummary.shippingCost,
        subtotal: checkoutSummary.subtotal,
        total: checkoutSummary.total,
        status: "pendiente",
        statusHistory: [
          buildStatusEntry("pendiente", "Pedido creado desde checkout.")
        ]
      }, { transaction });

      for (const item of cart) {
        const product = await Product.findByPk(item.productId, {
          include: [ProductImage, ProductVariant],
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!product || !product.isActive || product.StoreId !== req.store.id) {
          throw new Error(`El producto ${item.name} ya no esta disponible.`);
        }

        const mainImage = getMainImage(product);
        let variant = null;
        let available = (Number(product.stock) || 0) - (Number(product.reservedStock) || 0);
        let price = item.price;
        let originalPrice = item.originalPrice || item.price;
        let discountPercent = item.discountPercent || 0;
        let discountAmount = item.discountAmount || 0;
        let variantName = null;

        if (item.variantId) {
          variant = await ProductVariant.findByPk(item.variantId, {
            transaction,
            lock: transaction.LOCK.UPDATE
          });

          if (!variant || variant.ProductId !== product.id) {
            throw new Error(`La variante seleccionada para ${item.name} ya no esta disponible.`);
          }

          available = (Number(variant.stock) || 0) - (Number(variant.reservedStock) || 0);
          originalPrice = variant.price === null || variant.price === undefined
            ? product.price
            : Number(variant.price);
          const pricing = buildLinePricing(product, originalPrice);
          price = pricing.finalPrice;
          discountPercent = pricing.discountPercent;
          discountAmount = pricing.discountAmount;
          variantName = variant.name;
        } else {
          const pricing = buildLinePricing(product, product.price);
          price = pricing.finalPrice;
          originalPrice = pricing.originalPrice;
          discountPercent = pricing.discountPercent;
          discountAmount = pricing.discountAmount;
        }

        if (available < item.quantity) {
          throw new Error(`Stock insuficiente para ${item.name}${variantName ? ` (${variantName})` : ""}.`);
        }

        const threshold = Number(product.lowStockThreshold) || 0;
        const nextAvailable = available - item.quantity;
        if (available > threshold && nextAvailable <= threshold) {
          lowStockAlerts.push({
            productName: product.name,
            variantName,
            available: nextAvailable,
            threshold
          });
        }

        await OrderItem.create({
          OrderId: createdOrder.id,
          ProductId: item.productId,
          ProductVariantId: item.variantId || null,
          quantity: item.quantity,
          price,
          productName: product.name,
          variantName,
          productImage: mainImage,
          productSnapshot: {
            productId: product.id,
            name: product.name,
            description: product.description,
            longDescription: product.longDescription,
            image: mainImage,
            price,
            originalPrice,
            discountAmount,
            discountPercent,
            variant: variant
              ? {
                id: variant.id,
                name: variant.name,
                price,
                originalPrice,
                discountAmount,
                discountPercent
              }
              : null
          }
        }, { transaction });

        if (variant) {
          await variant.update({
            reservedStock: (Number(variant.reservedStock) || 0) + item.quantity
          }, { transaction });
        }

        await product.update({
          reservedStock: (Number(product.reservedStock) || 0) + item.quantity
        }, { transaction });
      }

      if (lockedCoupon) {
        await lockedCoupon.update({
          usageCount: (Number(lockedCoupon.usageCount) || 0) + 1
        }, { transaction });
      }

      return createdOrder;
    });

    replaceStoreCart(req, []);

    notifyNewOrder(req.store, order).catch((error) => {
      console.error("No se pudo enviar la notificacion de nuevo pedido.", error);
    });

    if (lowStockAlerts.length > 0) {
      notifyLowStock(req.store, lowStockAlerts, `pedido #${order.id}`).catch((error) => {
        console.error("No se pudo enviar la alerta de bajo stock.", error);
      });
    }

    res.render("orderSuccess", {
      orderId: order.id,
      title: "Pedido recibido",
      message: `Tu pedido ha sido registrado correctamente. Total estimado: ${formatCurrency(checkoutSummary.total)}.`,
      buttonLabel: "Seguir comprando",
      buttonHref: buildStorePath(req.store.slug),
      total: checkoutSummary.total,
      shippingCost: checkoutSummary.shippingCost,
      couponDiscount: checkoutSummary.discountAmount,
      couponCode: checkoutSummary.couponCode,
      store: req.store,
      storeBasePath: buildStorePath(req.store.slug),
      cart: getStoreCart(req)
    });
  } catch (error) {
    return renderCheckout(res, req, {
      status: 400,
      errorMessages: [error.message || "No fue posible registrar el pedido."],
      formData,
      couponData
    });
  }
};
