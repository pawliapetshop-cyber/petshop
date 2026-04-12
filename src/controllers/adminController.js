const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const PDFDocument = require("pdfkit");
const db = require("../models");
const {
  Store,
  Admin,
  Product,
  Customer,
  ProductVariant,
  Category,
  Banner,
  SideAd,
  Coupon,
  Review,
  ReviewImage,
  ProductImage,
  Order,
  OrderItem
} = db;
const { Op } = require("sequelize");
const {
  ORDER_TRANSITIONS,
  STATUS_DATE_FIELDS,
  STATUS_LABELS
} = require("../utils/orderStatus");
const {
  getStoreShippingConfig,
  getShippingCities,
  buildDefaultShippingConfig
} = require("../utils/shippingConfig");
const {
  DEFAULT_NOTIFICATION_CONFIG,
  parseRecipients,
  isValidEmail,
  getStoreNotificationConfig,
  isEmailNotificationsConfigured,
  getEmailProvider,
  sendTestNotification,
  notifyLowStock
} = require("../utils/notifications");
const {
  uploadsDir,
  pdfsDir
} = require("../utils/storagePaths");

const emptyProductForm = {
  name: "",
  description: "",
  longDescription: "",
  price: "",
  discountType: "none",
  discountValue: 0,
  discountLabel: "",
  discountStartDate: "",
  discountEndDate: "",
  stock: "",
  lowStockThreshold: "",
  isActive: true,
  categoryId: "",
  variants: []
};

const emptyBannerForm = {
  title: "",
  subtitle: "",
  buttonLabel: "",
  sortOrder: 0,
  productId: "",
  isActive: true
};

const SIDE_AD_POSITIONS = {
  left: "Lateral izquierda",
  right: "Lateral derecha"
};

const emptyCouponForm = {
  code: "",
  title: "",
  description: "",
  discountType: "percent",
  discountValue: "",
  minimumCartAmount: 0,
  usageLimit: 1,
  productId: "",
  isActive: true
};

const emptyStoreForm = {
  name: "",
  slug: "",
  contactEmail: "",
  contactPhone: "",
  whatsapp: "",
  logo: "",
  primaryColor: "#198754",
  secondaryColor: "#212529",
  backgroundColor: "#f5f5f5",
  surfaceColor: "#ffffff",
  buttonPrimaryColor: "#198754",
  buttonSecondaryColor: "#212529",
  backgroundDecorMode: "soft",
  backgroundPattern: "none",
  backgroundDecorOpacity: "18",
  backgroundImage: "",
  popupEnabled: false,
  popupImage: "",
  popupTargetUrl: "",
  popupTitle: "",
  popupStartDate: "",
  popupEndDate: "",
  popupOnlyHome: false,
  popupOpenInNewTab: true,
  surfaceRadius: "24",
  buttonRadius: "12",
  notificationTag: "",
  heroEyebrow: "Catalogo comercial",
  heroTitle: "",
  heroSubtitle: "",
  showRecommended: true,
  recommendedTitle: "",
  showNewArrivals: true,
  newArrivalsTitle: "",
  showFeaturedCategories: true,
  featuredCategoriesTitle: "",
  featuredCategoryIds: [],
  promoSections: [
    {
      eyebrow: "",
      title: "",
      description: "",
      buttonLabel: "",
      buttonUrl: "",
      image: "",
      isActive: true
    },
    {
      eyebrow: "",
      title: "",
      description: "",
      buttonLabel: "",
      buttonUrl: "",
      image: "",
      isActive: true
    }
  ],
  isActive: true
};

const emptyAdminUserForm = {
  email: "",
  password: "",
  role: "store_admin",
  storeId: ""
};

const emptyNotificationForm = {
  notifyOnNewOrder: true,
  notifyOnLowStock: true,
  orderEmails: "",
  lowStockEmails: ""
};

const REPORTABLE_ORDER_STATUSES = ["pago_validado", "aceptado", "preparando", "enviado", "entregado"];
const CUSTOMER_SEGMENT_LABELS = {
  all: "Todos",
  vip: "VIP",
  recompra: "Recompra",
  recurrente: "Recurrente",
  con_cupon: "Uso cupon",
  inactivo: "Inactivo",
  sin_correo: "Sin correo"
};

const FOLLOW_UP_STATUS_LABELS = {
  none: "Sin seguimiento",
  pending: "Pendiente",
  contacted: "Contactado"
};

const setFlash = (req, type, message) => {
  req.session.flash = { type, message };
};

const getUploadedFileName = (req, fieldName) => req.files?.[fieldName]?.[0]?.filename || "";

const normalizePromoSection = (section = {}, index = 0) => ({
  eyebrow: (section.eyebrow || "").trim(),
  title: (section.title || "").trim(),
  description: (section.description || "").trim(),
  buttonLabel: (section.buttonLabel || "").trim(),
  buttonUrl: (section.buttonUrl || "").trim(),
  image: section.image || "",
  isActive: section.isActive !== false && section.isActive !== "false" && section.isActive !== "off",
  sortOrder: index
});

const getThemePromoSections = (themeConfig = {}) => {
  const sections = Array.isArray(themeConfig.promoSections) ? themeConfig.promoSections : [];
  return [0, 1].map((index) => normalizePromoSection(sections[index] || {}, index));
};

const buildPromoSectionsFromRequest = (req, existingSections = []) =>
  [0, 1].map((index) => {
    const sectionNumber = index + 1;
    const uploadedImage = getUploadedFileName(req, `promoImage${sectionNumber}`);
    const previousSection = existingSections[index] || {};

    return normalizePromoSection({
      eyebrow: req.body[`promoEyebrow${sectionNumber}`],
      title: req.body[`promoTitle${sectionNumber}`],
      description: req.body[`promoDescription${sectionNumber}`],
      buttonLabel: req.body[`promoButtonLabel${sectionNumber}`],
      buttonUrl: req.body[`promoButtonUrl${sectionNumber}`],
      image: uploadedImage || previousSection.image || "",
      isActive: req.body[`promoActive${sectionNumber}`] === "on" || req.body[`promoActive${sectionNumber}`] === true
    }, index);
  });

const removeUploadedAsset = (filename) => {
  if (!filename) {
    return;
  }

  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const removeReplacedPromoImages = (existingSections = [], nextSections = []) => {
  existingSections.forEach((section, index) => {
    const currentImage = section?.image || "";
    const nextImage = nextSections[index]?.image || "";

    if (currentImage && nextImage && currentImage !== nextImage) {
      removeUploadedAsset(currentImage);
    }
  });
};

const removeRequestUploads = (req, fieldNames = []) => {
  fieldNames.forEach((fieldName) => {
    const files = req.files?.[fieldName] || [];
    files.forEach((file) => removeUploadedAsset(file.filename));
  });
};

const getAdminScope = (req) => {
  const adminSession = req.session.admin || {};
  return {
    role: adminSession.role || "store_admin",
    storeId: adminSession.StoreId || null
  };
};

const withStoreScope = (req, where = {}) => {
  const { role, storeId } = getAdminScope(req);

  if (role === "superadmin" || !storeId) {
    return where;
  }

  return {
    ...where,
    StoreId: storeId
  };
};

const isStoreOwnedRecord = (req, record) => {
  const { role, storeId } = getAdminScope(req);

  if (!record) {
    return false;
  }

  if (role === "superadmin" || !storeId) {
    return true;
  }

  return Number(record.StoreId) === Number(storeId);
};

const isProductOwnedRecord = (req, product) => {
  const { role, storeId } = getAdminScope(req);

  if (!product) {
    return false;
  }

  if (role === "superadmin" || !storeId) {
    return true;
  }

  return Number(product.StoreId) === Number(storeId);
};

const getCustomerSegment = (customer) => {
  const successfulOrders = Number(customer.successfulOrders) || 0;
  const lastSuccessfulOrderTime = customer.lastSuccessfulOrderAt
    ? new Date(customer.lastSuccessfulOrderAt).getTime()
    : null;
  const daysSinceLastSuccessfulOrder = lastSuccessfulOrderTime
    ? Math.floor((Date.now() - lastSuccessfulOrderTime) / (1000 * 60 * 60 * 24))
    : null;

  if ((Number(customer.totalSpent) || 0) >= 300000 || (Number(customer.totalOrders) || 0) >= 5) {
    return "vip";
  }

  if (successfulOrders >= 1 && daysSinceLastSuccessfulOrder !== null && daysSinceLastSuccessfulOrder >= 21) {
    return "recompra";
  }

  if ((customer.ordersWithCoupon || 0) > 0) {
    return "con_cupon";
  }

  if ((Number(customer.totalOrders) || 0) >= 2) {
    return "recurrente";
  }

  if (!customer.email) {
    return "sin_correo";
  }

  const lastOrderTime = customer.lastOrderAt ? new Date(customer.lastOrderAt).getTime() : null;
  const daysSinceLastOrder = lastOrderTime
    ? Math.floor((Date.now() - lastOrderTime) / (1000 * 60 * 60 * 24))
    : null;

  if (daysSinceLastOrder === null || daysSinceLastOrder >= 30) {
    return "inactivo";
  }

  return "all";
};

const enrichCustomersWithOrderStats = async (customers) => {
  if (customers.length === 0) {
    return [];
  }

  const orders = await Order.findAll({
    where: {
      CustomerId: customers.map((customer) => customer.id)
    },
    attributes: ["CustomerId", "status", "couponCode", "couponDiscount", "createdAt"]
  });

  const statsByCustomerId = new Map();

  for (const order of orders) {
    const current = statsByCustomerId.get(order.CustomerId) || {
      ordersWithCoupon: 0,
      pendingOrders: 0,
      successfulOrders: 0,
      deliveredOrders: 0,
      rejectedOrders: 0,
      lastSuccessfulOrderAt: null
    };

    if (order.status === "pendiente") current.pendingOrders += 1;
    if (order.status === "rechazado") current.rejectedOrders += 1;
    if (order.status === "entregado") current.deliveredOrders += 1;

    if (REPORTABLE_ORDER_STATUSES.includes(order.status)) {
      current.successfulOrders += 1;
      if (!current.lastSuccessfulOrderAt || new Date(order.createdAt) > new Date(current.lastSuccessfulOrderAt)) {
        current.lastSuccessfulOrderAt = order.createdAt;
      }
    }

    if ((Number(order.couponDiscount) || 0) > 0 || order.couponCode) {
      current.ordersWithCoupon += 1;
    }

    statsByCustomerId.set(order.CustomerId, current);
  }

  return customers.map((customer) => {
    const plainCustomer = customer.toJSON ? customer.toJSON() : customer;
    const stats = statsByCustomerId.get(customer.id) || {
      ordersWithCoupon: 0,
      pendingOrders: 0,
      successfulOrders: 0,
      deliveredOrders: 0,
      rejectedOrders: 0,
      lastSuccessfulOrderAt: null
    };

    return {
      ...plainCustomer,
      ...stats,
      daysSinceLastSuccessfulOrder: stats.lastSuccessfulOrderAt
        ? Math.floor((Date.now() - new Date(stats.lastSuccessfulOrderAt).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      segment: getCustomerSegment({
        ...plainCustomer,
        ...stats
      })
    };
  });
};

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value).replace(/"/g, "\"\"");
  return /[",\n]/.test(stringValue) ? `"${stringValue}"` : stringValue;
};

const buildCsv = (headers, rows) => {
  const headerLine = headers.map((header) => escapeCsvValue(header)).join(",");
  const rowLines = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(","));
  return [headerLine, ...rowLines].join("\n");
};

const sendCsv = (res, filename, headers, rows) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`\uFEFF${buildCsv(headers, rows)}`);
};

const getCustomerListData = async (req, options = {}) => {
  const search = (options.search ?? req.query.search ?? "").trim();
  const segment = options.segment ?? req.query.segment ?? "all";
  const city = (options.city ?? req.query.city ?? "").trim();
  const sort = options.sort ?? req.query.sort ?? "recent";
  const where = withStoreScope(req);

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { phone: { [Op.like]: `%${search}%` } },
      { document: { [Op.like]: `%${search}%` } }
    ];
  }

  if (city) {
    where.city = {
      [Op.like]: `%${city}%`
    };
  }

  const rawCustomers = await Customer.findAll({
    where,
    order: [["lastOrderAt", "DESC"], ["createdAt", "DESC"]]
  });

  const enrichedCustomers = await enrichCustomersWithOrderStats(rawCustomers);
  const summary = {
    total: enrichedCustomers.length,
    vip: enrichedCustomers.filter((customer) => customer.segment === "vip").length,
    recompra: enrichedCustomers.filter((customer) => customer.segment === "recompra").length,
    recurrente: enrichedCustomers.filter((customer) => customer.segment === "recurrente").length,
    con_cupon: enrichedCustomers.filter((customer) => customer.ordersWithCoupon > 0).length,
    inactivo: enrichedCustomers.filter((customer) => customer.segment === "inactivo").length,
    sin_correo: enrichedCustomers.filter((customer) => !customer.email).length,
    pendingFollowUp: enrichedCustomers.filter((customer) => customer.followUpStatus === "pending").length
  };

  let customers = enrichedCustomers;

  if (segment !== "all") {
    customers = customers.filter((customer) => {
      if (segment === "con_cupon") return customer.ordersWithCoupon > 0;
      if (segment === "sin_correo") return !customer.email;
      return customer.segment === segment;
    });
  }

  const sorters = {
    recent: (a, b) => new Date(b.lastOrderAt || b.createdAt) - new Date(a.lastOrderAt || a.createdAt),
    spent_desc: (a, b) => (Number(b.totalSpent) || 0) - (Number(a.totalSpent) || 0),
    orders_desc: (a, b) => (Number(b.totalOrders) || 0) - (Number(a.totalOrders) || 0),
    name_asc: (a, b) => a.name.localeCompare(b.name, "es"),
    inactive_desc: (a, b) => new Date(a.lastOrderAt || 0) - new Date(b.lastOrderAt || 0)
  };

  customers = customers.sort(sorters[sort] || sorters.recent);

  return {
    customers,
    summary,
    filters: { search, segment, city, sort }
  };
};

const getReportData = async (req, query = req.query) => {
  const { where, dateFrom, dateTo } = buildReportWhere(req, query);

  const orders = await Order.findAll({
    where,
    include: [Coupon],
    order: [["createdAt", "DESC"]]
  });

  const salesOrders = orders.filter((order) => REPORTABLE_ORDER_STATUSES.includes(order.status));
  const successfulOrderIds = salesOrders.map((order) => order.id);

  const orderItems = successfulOrderIds.length > 0
    ? await OrderItem.findAll({
      where: { OrderId: successfulOrderIds },
      include: [Product, Order]
    })
    : [];

  const reviews = await Review.findAll({ where });

  const metrics = {
    totalOrders: orders.length,
    successfulOrders: salesOrders.length,
    pendingOrders: orders.filter((order) => order.status === "pendiente").length,
    rejectedOrders: orders.filter((order) => order.status === "rechazado").length,
    grossSales: salesOrders.reduce((total, order) => total + (Number(order.total) || 0), 0),
    totalShipping: salesOrders.reduce((total, order) => total + (Number(order.shippingCost) || 0), 0),
    totalDiscounts: salesOrders.reduce((total, order) => total + (Number(order.couponDiscount) || 0), 0),
    averageTicket: salesOrders.length > 0
      ? salesOrders.reduce((total, order) => total + (Number(order.total) || 0), 0) / salesOrders.length
      : 0,
    couponOrders: salesOrders.filter((order) => Number(order.couponDiscount) > 0).length,
    reviewsPending: reviews.filter((review) => review.status === "pending").length,
    reviewsApproved: reviews.filter((review) => review.status === "approved").length,
    averageRating: reviews.filter((review) => review.status === "approved").length > 0
      ? reviews
        .filter((review) => review.status === "approved")
        .reduce((total, review) => total + (Number(review.rating) || 0), 0) /
        reviews.filter((review) => review.status === "approved").length
      : 0
  };

  const productSummaryMap = new Map();
  orderItems.forEach((item) => {
    const key = String(item.ProductId || item.productName || item.id);
    const current = productSummaryMap.get(key) || {
      productId: item.ProductId,
      productName: item.productName || item.Product?.name || "Producto",
      quantity: 0,
      revenue: 0
    };

    current.quantity += Number(item.quantity) || 0;
    current.revenue += (Number(item.quantity) || 0) * (Number(item.price) || 0);
    productSummaryMap.set(key, current);
  });

  const topProducts = [...productSummaryMap.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  const dailySalesMap = new Map();
  salesOrders.forEach((order) => {
    const key = new Date(order.createdAt).toISOString().slice(0, 10);
    const current = dailySalesMap.get(key) || { date: key, orders: 0, total: 0 };
    current.orders += 1;
    current.total += Number(order.total) || 0;
    dailySalesMap.set(key, current);
  });

  const dailySales = [...dailySalesMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-15);

  const topCouponsMap = new Map();
  salesOrders
    .filter((order) => order.couponCode)
    .forEach((order) => {
      const current = topCouponsMap.get(order.couponCode) || {
        code: order.couponCode,
        uses: 0,
        savings: 0
      };

      current.uses += 1;
      current.savings += Number(order.couponDiscount) || 0;
      topCouponsMap.set(order.couponCode, current);
    });

  const topCoupons = [...topCouponsMap.values()]
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 8);

  return {
    orders,
    metrics,
    topProducts,
    dailySales,
    topCoupons,
    filters: { dateFrom, dateTo }
  };
};

const buildStatusEntry = (status, note) => ({
  status,
  note: note || "",
  createdAt: new Date().toISOString(),
  actor: "admin"
});

const buildPaymentEntry = (note) => ({
  type: "payment_proof",
  note: note || "Comprobante registrado en el panel admin.",
  createdAt: new Date().toISOString(),
  actor: "admin"
});

const ensureArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
};

const normalizeVariantInput = (body = {}) => {
  const ids = ensureArray(body.variantId);
  const names = ensureArray(body.variantName);
  const stocks = ensureArray(body.variantStock);
  const prices = ensureArray(body.variantPrice);
  const maxLength = Math.max(ids.length, names.length, stocks.length, prices.length);
  const variants = [];

  for (let index = 0; index < maxLength; index++) {
    const id = ids[index] ? String(ids[index]).trim() : "";
    const name = names[index] ? String(names[index]).trim() : "";
    const stock = stocks[index] ?? "";
    const price = prices[index] ?? "";
    const hasValues = id || name || stock !== "" || price !== "";

    if (!hasValues) {
      continue;
    }

    variants.push({
      id,
      name,
      stock,
      price
    });
  }

  return variants;
};

const buildVariantInventory = (variants = []) => ({
  stock: variants.reduce((total, variant) => total + variant.stock, 0),
  reservedStock: variants.reduce((total, variant) => total + variant.reservedStock, 0)
});

const variantLabel = (variant) => variant?.name || "Variante";

const getVariantAvailable = (variant) =>
  (Number(variant?.stock) || 0) - (Number(variant?.reservedStock) || 0);

const decorateProductInventory = (product) => {
  const threshold = Number(product.lowStockThreshold) || 0;
  const variants = (product.ProductVariants || []).map((variant) => ({
    ...variant.get({ plain: true }),
    available: getVariantAvailable(variant),
    isLow: getVariantAvailable(variant) <= threshold
  }));
  const available = (Number(product.stock) || 0) - (Number(product.reservedStock) || 0);
  const lowVariants = variants.filter((variant) => variant.isLow);
  const outVariants = variants.filter((variant) => variant.available <= 0);

  product.inventoryMeta = {
    threshold,
    available,
    variantCount: variants.length,
    variants,
    lowVariants,
    outVariants,
    hasVariantAlerts: lowVariants.length > 0
  };

  return product;
};

const buildPdfForOrder = (order, filePath) => new Promise((resolve, reject) => {
  const doc = new PDFDocument();
  const stream = fs.createWriteStream(filePath);
  const logoPath = path.join(__dirname, "../public/logo.jpeg");

  stream.on("finish", resolve);
  stream.on("error", reject);
  doc.on("error", reject);

  doc.pipe(stream);

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 45, {
      fit: [90, 90],
      align: "left"
    });
  }

  doc
    .fontSize(22)
    .text("Pawlia", 155, 55, { align: "left" })
    .fontSize(12)
    .text("Guia de Pedido", 155, 83, { align: "left" });

  doc.moveDown();
  doc.moveDown();
  doc.text(`Pedido #${order.id}`);
  doc.text(`Cliente: ${order.name}`);
  doc.text(`Telefono: ${order.phone}`);
  doc.text(`Direccion: ${order.address}`);
  doc.text(`Ciudad: ${order.city}`);
  doc.text(`Pago: ${order.paymentMethod}`);
  doc.text(`Subtotal: $${Number(order.subtotal ?? 0)}`);
  if (Number(order.couponDiscount || 0) > 0) {
    doc.text(`Cupon: ${order.couponCode || "Aplicado"} (-$${Number(order.couponDiscount ?? 0)})`);
  }
  doc.text(`Envio: $${Number(order.shippingCost ?? 0)}`);
  doc.text(`Total: $${Number(order.total ?? 0)}`);

  doc.moveDown();
  doc.fontSize(14).text("Detalle del pedido");
  doc.moveDown();

  let total = 0;

  order.OrderItems.forEach((item) => {
    const subtotal = item.quantity * item.price;
    total += subtotal;
    const productLabel = item.variantName
      ? `${item.productName || item.Product?.name || "Producto"} (${item.variantName})`
      : item.productName || item.Product?.name || "Producto";

    doc
      .fontSize(12)
      .text(`Producto: ${productLabel}`)
      .text(`Cantidad: ${item.quantity}`)
      .text(`Precio: $${item.price}`)
      .text(`Subtotal: $${subtotal}`)
      .moveDown();
  });

  doc.moveDown();
  doc.fontSize(12).text(`Subtotal productos: $${total}`, { align: "right" });
  if (Number(order.couponDiscount || 0) > 0) {
    doc.fontSize(12).text(`Descuento cupon: -$${Number(order.couponDiscount ?? 0)}`, { align: "right" });
  }
  doc.fontSize(12).text(`Envio: $${Number(order.shippingCost ?? 0)}`, { align: "right" });
  doc.fontSize(14).text(`TOTAL: $${Number(order.total ?? total)}`, { align: "right" });
  doc.end();
});

const normalizeProductInput = (body = {}) => ({
  name: (body.name || "").trim(),
  description: (body.description || "").trim(),
  longDescription: (body.longDescription || "").trim(),
  price: body.price ?? "",
  discountType: ["none", "percent", "fixed"].includes(body.discountType) ? body.discountType : "none",
  discountValue: body.discountValue ?? 0,
  discountLabel: (body.discountLabel || "").trim(),
  discountStartDate: body.discountStartDate || "",
  discountEndDate: body.discountEndDate || "",
  stock: body.stock ?? "",
  lowStockThreshold: body.lowStockThreshold ?? "",
  isActive: body.isActive === "on" || body.isActive === true,
  categoryId: body.categoryId ?? "",
  variants: normalizeVariantInput(body)
});

const normalizeBannerInput = (body = {}) => ({
  title: (body.title || "").trim(),
  subtitle: (body.subtitle || "").trim(),
  buttonLabel: (body.buttonLabel || "").trim(),
  sortOrder: body.sortOrder ?? 0,
  productId: body.productId ?? "",
  isActive: body.isActive === "on" || body.isActive === true
});

const renderBannersPage = async (req, res, options = {}) => {
  const scopedWhere = withStoreScope(req);
  const banners = await Banner.findAll({
    where: scopedWhere,
    include: [{
      model: Product,
      include: [ProductImage]
    }],
    order: [["sortOrder", "ASC"], ["createdAt", "DESC"]]
  });

  const products = await Product.findAll({
    where: withStoreScope(req, { isActive: true }),
    order: [["name", "ASC"]]
  });

  res.status(options.status || 200).render("admin/banners", {
    layout: "admin/layout",
    banners,
    products,
    errorMessages: options.errorMessages || [],
    formData: options.formData || emptyBannerForm
  });
};

const getManagedStoreForScope = async (req, requestedStoreId) => {
  const { role, storeId } = getAdminScope(req);
  const selectedStoreId = role === "superadmin"
    ? Number(requestedStoreId || req.query.storeId || storeId || 0)
    : Number(storeId);

  if (!selectedStoreId) {
    return null;
  }

  return Store.findByPk(selectedStoreId);
};

const renderSideAdsPage = async (req, res, options = {}) => {
  const { role } = getAdminScope(req);
  const stores = role === "superadmin"
    ? await Store.findAll({ order: [["name", "ASC"]] })
    : [];
  const selectedStore = options.selectedStore || await getManagedStoreForScope(req, options.storeId);

  if (!selectedStore) {
    setFlash(req, "error", "No se encontro la tienda para administrar publicidad.");
    return res.redirect("/admin");
  }

  const ads = await SideAd.findAll({
    where: { StoreId: selectedStore.id },
    order: [["createdAt", "DESC"]]
  });

  const adsByPosition = {
    left: ads.find((ad) => ad.position === "left") || null,
    right: ads.find((ad) => ad.position === "right") || null
  };

  res.status(options.status || 200).render("admin/sideAds", {
    layout: "admin/layout",
    stores,
    selectedStore,
    adsByPosition,
    errorMessages: options.errorMessages || [],
    positionLabels: SIDE_AD_POSITIONS
  });
};

const renderCouponsPage = async (req, res, options = {}) => {
  const coupons = await Coupon.findAll({
    where: withStoreScope(req),
    include: [Product],
    order: [["createdAt", "DESC"]]
  });

  const products = await Product.findAll({
    where: withStoreScope(req, { isActive: true }),
    order: [["name", "ASC"]]
  });

  res.status(options.status || 200).render("admin/coupons", {
    layout: "admin/layout",
    coupons,
    products,
    errorMessages: options.errorMessages || [],
    formData: options.formData || emptyCouponForm
  });
};

const renderStoresPage = async (req, res, options = {}) => {
  const stores = await Store.findAll({
    include: [Admin],
    order: [["createdAt", "DESC"]]
  });
  const categories = await Category.findAll({
    order: [["name", "ASC"]]
  });

  res.status(options.status || 200).render("admin/stores", {
    layout: "admin/layout",
    stores,
    categories,
    errorMessages: options.errorMessages || [],
    formData: options.formData || emptyStoreForm
  });
};

const renderAdminUsersPage = async (req, res, options = {}) => {
  const admins = await Admin.findAll({
    include: [Store],
    order: [["createdAt", "DESC"]]
  });
  const stores = await Store.findAll({
    where: { isActive: true },
    order: [["name", "ASC"]]
  });

  res.status(options.status || 200).render("admin/adminUsers", {
    layout: "admin/layout",
    admins,
    stores,
    errorMessages: options.errorMessages || [],
    formData: options.formData || emptyAdminUserForm
  });
};

const getShippingSettingsStore = async (req, requestedStoreId) => {
  const { role, storeId } = getAdminScope(req);
  const selectedStoreId = role === "superadmin"
    ? Number(requestedStoreId || req.query.storeId || storeId || 0)
    : Number(storeId);

  if (!selectedStoreId) {
    return null;
  }

  return Store.findByPk(selectedStoreId);
};

const renderShippingSettingsPage = async (req, res, options = {}) => {
  const { role } = getAdminScope(req);
  const stores = role === "superadmin"
    ? await Store.findAll({ order: [["name", "ASC"]] })
    : [];
  const selectedStore = options.selectedStore || await getShippingSettingsStore(req, options.storeId);

  if (!selectedStore) {
    setFlash(req, "error", "No se encontro la tienda para configurar envios.");
    return res.redirect("/admin");
  }

  res.status(options.status || 200).render("admin/shippingSettings", {
    layout: "admin/layout",
    stores,
    selectedStore,
    shippingCities: getStoreShippingConfig(selectedStore).cities,
    errorMessages: options.errorMessages || []
  });
};

const getNotificationsSettingsStore = async (req, requestedStoreId) => {
  const { role, storeId } = getAdminScope(req);
  const selectedStoreId = role === "superadmin"
    ? Number(requestedStoreId || req.query.storeId || storeId || 0)
    : Number(storeId);

  if (!selectedStoreId) {
    return null;
  }

  return Store.findByPk(selectedStoreId);
};

const renderNotificationsSettingsPage = async (req, res, options = {}) => {
  const { role } = getAdminScope(req);
  const stores = role === "superadmin"
    ? await Store.findAll({ order: [["name", "ASC"]] })
    : [];
  const selectedStore = options.selectedStore || await getNotificationsSettingsStore(req, options.storeId);

  if (!selectedStore) {
    setFlash(req, "error", "No se encontro la tienda para configurar notificaciones.");
    return res.redirect("/admin");
  }

  const notificationConfig = getStoreNotificationConfig(selectedStore);
  const formData = options.formData || {
    notifyOnNewOrder: notificationConfig.notifyOnNewOrder,
    notifyOnLowStock: notificationConfig.notifyOnLowStock,
    orderEmails: notificationConfig.orderEmails.join("\n"),
    lowStockEmails: notificationConfig.lowStockEmails.join("\n")
  };

  res.status(options.status || 200).render("admin/notificationSettings", {
    layout: "admin/layout",
    stores,
    selectedStore,
    errorMessages: options.errorMessages || [],
    formData,
    smtpConfigured: isEmailNotificationsConfigured()
  });
};

const getReportDateRange = (query = {}) => {
  const dateTo = (query.dateTo || "").trim();
  const dateFrom = (query.dateFrom || "").trim();
  const hasValidFrom = Boolean(dateFrom);
  const hasValidTo = Boolean(dateTo);

  if (hasValidFrom || hasValidTo) {
    return {
      dateFrom,
      dateTo
    };
  }

  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 29);

  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: now.toISOString().slice(0, 10)
  };
};

const buildReportWhere = (req, query = {}) => {
  const { dateFrom, dateTo } = getReportDateRange(query);
  const where = withStoreScope(req, {});

  if (dateFrom || dateTo) {
    where.createdAt = {};

    if (dateFrom) {
      where.createdAt[Op.gte] = new Date(`${dateFrom}T00:00:00`);
    }

    if (dateTo) {
      where.createdAt[Op.lte] = new Date(`${dateTo}T23:59:59.999`);
    }
  }

  return {
    where,
    dateFrom,
    dateTo
  };
};

const renderReviewsPage = async (req, res, options = {}) => {
  const status = (options.statusFilter || req.query.status || "").trim();
  const where = withStoreScope(req);

  if (status && ["pending", "approved", "rejected"].includes(status)) {
    where.status = status;
  }

  const reviews = await Review.findAll({
    where,
    include: [Product, ReviewImage, Order],
    order: [["createdAt", "DESC"]]
  });

  res.status(options.status || 200).render("admin/reviews", {
    layout: "admin/layout",
    reviews,
    filters: { status },
    statusLabels: {
      pending: "Pendiente",
      approved: "Aprobada",
      rejected: "Rechazada"
    }
  });
};

const renderCustomersPage = async (req, res, options = {}) => {
  const {
    customers,
    summary,
    filters
  } = await getCustomerListData(req, options);

  res.status(options.status || 200).render("admin/customers", {
    layout: "admin/layout",
    customers,
    filters,
    summary,
    segmentLabels: CUSTOMER_SEGMENT_LABELS,
    followUpLabels: FOLLOW_UP_STATUS_LABELS
  });
};

const validateProductInput = async (formData, options = {}) => {
  const errors = [];
  const price = Number(formData.price);
  const discountValue = Number(formData.discountValue);
  const stock = Number(formData.stock);
  const lowStockThreshold = Number(formData.lowStockThreshold);
  const existingVariantMap = new Map(
    (options.existingVariants || []).map((variant) => [String(variant.id), variant])
  );
  const normalizedVariants = [];
  const variantNames = new Set();

  if (!formData.name) errors.push("El nombre es obligatorio.");
  if (!formData.description) errors.push("La descripcion corta es obligatoria.");
  if (formData.price === "" || Number.isNaN(price) || price < 0) {
    errors.push("El precio debe ser un numero mayor o igual a 0.");
  }
  if (formData.discountType !== "none") {
    if (Number.isNaN(discountValue) || discountValue <= 0) {
      errors.push("El descuento debe ser un numero mayor a 0.");
    }
    if (formData.discountType === "percent" && discountValue > 100) {
      errors.push("El descuento porcentual no puede ser mayor al 100%.");
    }
  }
  if (formData.discountStartDate && formData.discountEndDate && formData.discountStartDate > formData.discountEndDate) {
    errors.push("La fecha de inicio del descuento no puede ser posterior a la fecha final.");
  }
  if (formData.lowStockThreshold === "" || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
    errors.push("El umbral de bajo stock debe ser un numero entero mayor o igual a 0.");
  }
  if (!formData.categoryId) {
    errors.push("Debes seleccionar una categoria.");
  } else {
    const category = await Category.findByPk(formData.categoryId);
    if (!category) {
      errors.push("La categoria seleccionada no existe.");
    } else if (options.storeId && options.role !== "superadmin" && category.StoreId !== options.storeId) {
      errors.push("No puedes usar una categoria de otra tienda.");
    }
  }

  for (const variant of formData.variants || []) {
    const variantStock = Number(variant.stock);
    const variantPrice = variant.price === "" ? null : Number(variant.price);
    const existingVariant = variant.id ? existingVariantMap.get(String(variant.id)) : null;
    const normalizedName = variant.name.toLowerCase();

    if (!variant.name) {
      errors.push("Cada variante debe tener un nombre.");
    } else if (variantNames.has(normalizedName)) {
      errors.push(`La variante "${variant.name}" esta repetida.`);
    } else {
      variantNames.add(normalizedName);
    }

    if (!Number.isInteger(variantStock) || variantStock < 0) {
      errors.push(`El stock de la variante "${variantLabel(variant)}" debe ser un numero entero mayor o igual a 0.`);
    }

    if (variant.price !== "" && (Number.isNaN(variantPrice) || variantPrice < 0)) {
      errors.push(`El precio de la variante "${variantLabel(variant)}" debe ser un numero mayor o igual a 0.`);
    }

    if (existingVariant && Number.isInteger(variantStock) && variantStock < (Number(existingVariant.reservedStock) || 0)) {
      errors.push(`No puedes dejar el stock de "${existingVariant.name}" por debajo de su reserva actual.`);
    }

    normalizedVariants.push({
      id: variant.id || null,
      name: variant.name,
      stock: Number.isNaN(variantStock) ? variant.stock : variantStock,
      reservedStock: Number(existingVariant?.reservedStock) || 0,
      price: variant.price === ""
        ? null
        : (Number.isNaN(variantPrice) ? variant.price : variantPrice)
    });
  }

  const hasVariants = normalizedVariants.length > 0;
  if (!hasVariants && (formData.stock === "" || !Number.isInteger(stock) || stock < 0)) {
    errors.push("El stock debe ser un numero entero mayor o igual a 0.");
  }
  const variantInventory = hasVariants
    ? buildVariantInventory(normalizedVariants.map((variant) => ({
      stock: Number(variant.stock) || 0,
      reservedStock: Number(variant.reservedStock) || 0
    })))
    : null;

  return {
    errors,
    values: {
      name: formData.name,
      description: formData.description,
      longDescription: formData.longDescription,
      price: Number.isNaN(price) ? formData.price : price,
      discountType: formData.discountType,
      discountValue: formData.discountType === "none" ? 0 : (Number.isNaN(discountValue) ? formData.discountValue : discountValue),
      discountLabel: formData.discountLabel,
      discountStartDate: formData.discountStartDate || null,
      discountEndDate: formData.discountEndDate || null,
      stock: hasVariants
        ? variantInventory.stock
        : (Number.isNaN(stock) ? formData.stock : stock),
      reservedStock: hasVariants ? variantInventory.reservedStock : undefined,
      lowStockThreshold: Number.isNaN(lowStockThreshold) ? formData.lowStockThreshold : lowStockThreshold,
      isActive: Boolean(formData.isActive),
      categoryId: formData.categoryId,
      variants: normalizedVariants
    }
  };
};

const renderCreateProductForm = async (res, options = {}) => {
  const categories = await Category.findAll({
    where: options.categoryWhere || {}
  });
  res.status(options.status || 200).render("admin/createProduct", {
    layout: "admin/layout",
    categories,
    errorMessages: options.errorMessages || [],
    formData: options.formData || emptyProductForm
  });
};

const renderEditProductForm = async (res, productId, options = {}) => {
  const product = await Product.findByPk(productId, {
    include: [Category, ProductImage, ProductVariant]
  });
  const categories = await Category.findAll({
    where: options.categoryWhere || {}
  });

  if (!product || (options.storeId && options.role !== "superadmin" && product.StoreId !== options.storeId)) {
    return res.redirect("/admin/products");
  }

  res.status(options.status || 200).render("admin/editProduct", {
    layout: "admin/layout",
    product,
    categories,
    errorMessages: options.errorMessages || [],
    formData: options.formData || {
      name: product.name,
      description: product.description,
      longDescription: product.longDescription || "",
      price: product.price,
      discountType: product.discountType || "none",
      discountValue: product.discountValue || 0,
      discountLabel: product.discountLabel || "",
      discountStartDate: product.discountStartDate || "",
      discountEndDate: product.discountEndDate || "",
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      isActive: product.isActive,
      categoryId: product.CategoryId,
      variants: (product.ProductVariants || []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        stock: variant.stock,
        price: variant.price ?? ""
      }))
    }
  });
};

const updateOrderStatus = async (req, orderId, nextStatus, note) => {
  const allowedPreviousStatuses = Object.entries(ORDER_TRANSITIONS)
    .filter(([, nextStatuses]) => nextStatuses.includes(nextStatus))
    .map(([status]) => status);

  const order = await Order.findByPk(orderId);
  if (!order) {
    throw new Error("Pedido no encontrado.");
  }

  if (!isStoreOwnedRecord(req, order)) {
    throw new Error("No puedes actualizar un pedido de otra tienda.");
  }

  if (!allowedPreviousStatuses.includes(order.status)) {
    throw new Error(`No puedes mover un pedido ${order.status} a ${nextStatus}.`);
  }

  const payload = {
    status: nextStatus,
    statusHistory: [
      ...(order.statusHistory || []),
      buildStatusEntry(nextStatus, note)
    ]
  };

  const dateField = STATUS_DATE_FIELDS[nextStatus];
  if (dateField) {
    payload[dateField] = new Date();
  }

  await order.update(payload);
  return order;
};

exports.dashboard = async (req, res) => {
  const scopedProductWhere = withStoreScope(req);
  const scopedCategoryWhere = withStoreScope(req);
  const scopedBannerWhere = withStoreScope(req, { isActive: true });
  const scopedCouponWhere = withStoreScope(req, { isActive: true });
  const totalProducts = await Product.count({ where: scopedProductWhere });
  const totalCategories = await Category.count({ where: scopedCategoryWhere });
  const totalActiveBanners = await Banner.count({ where: scopedBannerWhere });
  const totalActiveCoupons = await Coupon.count({ where: scopedCouponWhere });
  const activeProducts = await Product.count({ where: withStoreScope(req, { isActive: true }) });
  const inactiveProducts = await Product.count({ where: withStoreScope(req, { isActive: false }) });
  const lowStock = await Product.count({
    where: {
      ...withStoreScope(req),
      [Op.and]: [
        db.Sequelize.where(
          db.Sequelize.literal("stock - reservedStock"),
          "<=",
          db.Sequelize.col("lowStockThreshold")
        )
      ]
    }
  });
  const latestProducts = await Product.findAll({
    where: scopedProductWhere,
    include: [ProductVariant],
    limit: 5,
    order: [["createdAt", "DESC"]]
  });
  const productsWithVariants = (await Product.findAll({
    where: scopedProductWhere,
    include: [ProductVariant]
  })).filter((product) => (product.ProductVariants || []).length > 0);

  const decoratedLatestProducts = latestProducts.map((product) => decorateProductInventory(product));
  const variantAlerts = productsWithVariants
    .map((product) => decorateProductInventory(product))
    .flatMap((product) =>
      product.inventoryMeta.lowVariants.map((variant) => ({
        productId: product.id,
        productName: product.name,
        variantName: variant.name,
        available: variant.available,
        threshold: product.inventoryMeta.threshold
      }))
    )
    .sort((a, b) => a.available - b.available);

  res.render("admin/dashboard", {
    layout: "admin/layout",
    totalProducts,
    totalCategories,
    totalActiveBanners,
    totalActiveCoupons,
    activeProducts,
    inactiveProducts,
    lowStock,
    latestProducts: decoratedLatestProducts,
    lowVariantStock: variantAlerts.length,
    variantAlerts: variantAlerts.slice(0, 5)
  });
};

exports.reports = async (req, res) => {
  const {
    metrics,
    topProducts,
    dailySales,
    topCoupons,
    filters
  } = await getReportData(req, req.query);

  res.render("admin/reports", {
    layout: "admin/layout",
    filters,
    metrics: {
      ...metrics,
      averageRatingLabel: metrics.averageRating > 0 ? metrics.averageRating.toFixed(1) : "0.0"
    },
    topProducts,
    dailySales,
    topCoupons
  });
};

exports.customers = async (req, res) => {
  await renderCustomersPage(req, res);
};

exports.exportCustomersCsv = async (req, res) => {
  const { customers } = await getCustomerListData(req);

  sendCsv(
    res,
    "clientes.csv",
    [
      "Cliente",
      "Documento",
      "Correo",
      "Telefono",
      "Ciudad",
      "Pedidos",
      "Pedidos exitosos",
      "Pedidos con cupon",
      "Total gastado",
      "Segmento",
      "Ultimo pedido"
    ],
    customers.map((customer) => ([
      customer.name,
      customer.document,
      customer.email || "",
      customer.phone || "",
      customer.city || "",
      customer.totalOrders || 0,
      customer.successfulOrders || 0,
      customer.ordersWithCoupon || 0,
      Number(customer.totalSpent || 0).toFixed(2),
      CUSTOMER_SEGMENT_LABELS[customer.segment] || customer.segment,
      customer.lastOrderAt ? new Date(customer.lastOrderAt).toISOString() : ""
    ]))
  );
};

exports.exportReportsCsv = async (req, res) => {
  const { orders } = await getReportData(req, req.query);

  sendCsv(
    res,
    "reporte-pedidos.csv",
    [
      "Pedido",
      "Fecha",
      "Cliente",
      "Documento",
      "Correo",
      "Ciudad",
      "Estado",
      "Metodo de pago",
      "Subtotal",
      "Envio",
      "Descuento",
      "Total",
      "Cupon"
    ],
    orders.map((order) => ([
      order.id,
      new Date(order.createdAt).toISOString(),
      order.name,
      order.document,
      order.email || "",
      order.city || "",
      order.status,
      order.paymentMethod,
      Number(order.subtotal || 0).toFixed(2),
      Number(order.shippingCost || 0).toFixed(2),
      Number(order.couponDiscount || 0).toFixed(2),
      Number(order.total || 0).toFixed(2),
      order.couponCode || ""
    ]))
  );
};

exports.customerDetail = async (req, res) => {
  const customer = await Customer.findByPk(req.params.id);

  if (!isStoreOwnedRecord(req, customer)) {
    setFlash(req, "error", "Cliente no encontrado.");
    return res.redirect("/admin/customers");
  }

  const orders = await Order.findAll({
    where: {
      StoreId: customer.StoreId,
      CustomerId: customer.id
    },
    include: [Coupon],
    order: [["createdAt", "DESC"]]
  });

  const successfulOrders = orders.filter((order) => REPORTABLE_ORDER_STATUSES.includes(order.status));
  const metrics = {
    totalOrders: orders.length,
    successfulOrders: successfulOrders.length,
    totalSpent: successfulOrders.reduce((total, order) => total + (Number(order.total) || 0), 0),
    averageOrderValue: successfulOrders.length > 0
      ? successfulOrders.reduce((total, order) => total + (Number(order.total) || 0), 0) / successfulOrders.length
      : 0,
    lastOrderAt: orders[0]?.createdAt || customer.lastOrderAt || null,
    deliveredOrders: orders.filter((order) => order.status === "entregado").length,
    pendingOrders: orders.filter((order) => order.status === "pendiente").length,
    couponOrders: orders.filter((order) => (Number(order.couponDiscount) || 0) > 0 || order.couponCode).length,
    lastSuccessfulOrderAt: successfulOrders[0]?.createdAt || null,
    daysSinceLastSuccessfulOrder: successfulOrders[0]?.createdAt
      ? Math.floor((Date.now() - new Date(successfulOrders[0].createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : null,
    segment: getCustomerSegment({
      ...customer.toJSON(),
      successfulOrders: successfulOrders.length,
      ordersWithCoupon: orders.filter((order) => (Number(order.couponDiscount) || 0) > 0 || order.couponCode).length,
      lastSuccessfulOrderAt: successfulOrders[0]?.createdAt || null
    })
  };

  res.render("admin/customerDetail", {
    layout: "admin/layout",
    customer,
    orders,
    metrics,
    followUpLabels: FOLLOW_UP_STATUS_LABELS
  });
};

exports.updateCustomerFollowUp = async (req, res) => {
  const customer = await Customer.findByPk(req.params.id);

  if (!isStoreOwnedRecord(req, customer)) {
    setFlash(req, "error", "Cliente no encontrado.");
    return res.redirect("/admin/customers");
  }

  const followUpStatus = (req.body.followUpStatus || "none").trim();
  const followUpNotes = (req.body.followUpNotes || "").trim();

  if (!FOLLOW_UP_STATUS_LABELS[followUpStatus]) {
    setFlash(req, "error", "Estado de seguimiento no valido.");
    return res.redirect(`/admin/customers/${customer.id}`);
  }

  await customer.update({
    followUpStatus,
    followUpNotes: followUpNotes || null,
    lastContactAt: followUpStatus === "contacted" ? new Date() : customer.lastContactAt
  });

  setFlash(req, "success", "Seguimiento del cliente actualizado correctamente.");
  res.redirect(`/admin/customers/${customer.id}`);
};

exports.banners = async (req, res) => {
  await renderBannersPage(req, res);
};

exports.sideAds = async (req, res) => {
  await renderSideAdsPage(req, res);
};

exports.updateSideAd = async (req, res) => {
  const position = (req.params.position || "").trim();

  if (!SIDE_AD_POSITIONS[position]) {
    setFlash(req, "error", "Posicion de publicidad no valida.");
    return res.redirect("/admin/side-ads");
  }

  const selectedStore = await getManagedStoreForScope(req, req.body.storeId);

  if (!selectedStore) {
    setFlash(req, "error", "Tienda no encontrada.");
    return res.redirect("/admin");
  }

  const targetUrl = (req.body.targetUrl || "").trim();
  const title = (req.body.title || "").trim();
  const isActive = req.body.isActive === "on";
  const existingAd = await SideAd.findOne({
    where: {
      StoreId: selectedStore.id,
      position
    }
  });

  if (!existingAd && !req.file) {
    return renderSideAdsPage(req, res, {
      status: 400,
      selectedStore,
      errorMessages: [`Debes adjuntar una imagen para la ${SIDE_AD_POSITIONS[position].toLowerCase()}.`]
    });
  }

  if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
    return renderSideAdsPage(req, res, {
      status: 400,
      selectedStore,
      errorMessages: ["La URL de redireccion debe empezar por http:// o https://."]
    });
  }

  const nextImage = req.file?.filename || existingAd?.image || null;

  if (!existingAd) {
    await SideAd.create({
      position,
      image: nextImage,
      targetUrl: targetUrl || null,
      title: title || null,
      isActive,
      StoreId: selectedStore.id
    });
  } else {
    if (req.file && existingAd.image && existingAd.image !== req.file.filename) {
      const previousPath = path.join(uploadsDir, existingAd.image);
      if (fs.existsSync(previousPath)) {
        fs.unlinkSync(previousPath);
      }
    }

    await existingAd.update({
      image: nextImage,
      targetUrl: targetUrl || null,
      title: title || null,
      isActive
    });
  }

  setFlash(req, "success", `Publicidad ${SIDE_AD_POSITIONS[position].toLowerCase()} actualizada correctamente.`);
  res.redirect(
    getAdminScope(req).role === "superadmin"
      ? `/admin/side-ads?storeId=${selectedStore.id}`
      : "/admin/side-ads"
  );
};

exports.createBanner = async (req, res) => {
  const formData = normalizeBannerInput(req.body);
  const errors = [];
  const scope = getAdminScope(req);
  const sortOrder = Number(formData.sortOrder);

  if (!formData.title) {
    errors.push("El titulo del banner es obligatorio.");
  }

  if (!req.file) {
    errors.push("Debes adjuntar una imagen para el banner.");
  }

  if (!formData.productId) {
    errors.push("Debes seleccionar el producto al que redirige el banner.");
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.push("El orden debe ser un numero entero mayor o igual a 0.");
  }

  const product = formData.productId
    ? await Product.findByPk(formData.productId)
    : null;

  if (!product) {
    errors.push("El producto seleccionado no existe.");
  } else if (scope.role !== "superadmin" && scope.storeId && product.StoreId !== scope.storeId) {
    errors.push("No puedes enlazar banners a productos de otra tienda.");
  }

  if (errors.length > 0) {
    return renderBannersPage(req, res, {
      status: 400,
      errorMessages: errors,
      formData
    });
  }

  await Banner.create({
    title: formData.title,
    subtitle: formData.subtitle || null,
    buttonLabel: formData.buttonLabel || "Ver producto",
    sortOrder,
    isActive: formData.isActive,
    image: req.file.filename,
    ProductId: product.id,
    StoreId: product.StoreId
  });

  setFlash(req, "success", "Banner creado correctamente.");
  res.redirect("/admin/banners");
};

exports.updateBanner = async (req, res) => {
  const banner = await Banner.findByPk(req.params.id, {
    include: [Product]
  });
  const scope = getAdminScope(req);

  if (!banner || (scope.role !== "superadmin" && scope.storeId && banner.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Banner no encontrado.");
    return res.redirect("/admin/banners");
  }

  const formData = normalizeBannerInput(req.body);
  const errors = [];
  const sortOrder = Number(formData.sortOrder);

  if (!formData.title) {
    errors.push("El titulo del banner es obligatorio.");
  }

  if (!formData.productId) {
    errors.push("Debes seleccionar el producto al que redirige el banner.");
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.push("El orden debe ser un numero entero mayor o igual a 0.");
  }

  const product = formData.productId
    ? await Product.findByPk(formData.productId)
    : null;

  if (!product) {
    errors.push("El producto seleccionado no existe.");
  } else if (scope.role !== "superadmin" && scope.storeId && product.StoreId !== scope.storeId) {
    errors.push("No puedes enlazar banners a productos de otra tienda.");
  }

  if (errors.length > 0) {
    setFlash(req, "error", errors[0]);
    return res.redirect("/admin/banners");
  }

  const nextImage = req.file?.filename || banner.image;

  if (req.file && banner.image) {
    const previousImagePath = path.join(uploadsDir, banner.image);
    if (fs.existsSync(previousImagePath)) {
      fs.unlinkSync(previousImagePath);
    }
  }

  await banner.update({
    title: formData.title,
    subtitle: formData.subtitle || null,
    buttonLabel: formData.buttonLabel || "Ver producto",
    sortOrder,
    isActive: formData.isActive,
    image: nextImage,
    ProductId: product.id,
    StoreId: product.StoreId
  });

  setFlash(req, "success", "Banner actualizado correctamente.");
  res.redirect("/admin/banners");
};

exports.toggleBannerStatus = async (req, res) => {
  const banner = await Banner.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!banner || (scope.role !== "superadmin" && scope.storeId && banner.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Banner no encontrado.");
    return res.redirect("/admin/banners");
  }

  await banner.update({ isActive: !banner.isActive });
  setFlash(req, "success", `Banner ${banner.isActive ? "desactivado" : "activado"} correctamente.`);
  res.redirect("/admin/banners");
};

exports.deleteBanner = async (req, res) => {
  const banner = await Banner.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!banner || (scope.role !== "superadmin" && scope.storeId && banner.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Banner no encontrado.");
    return res.redirect("/admin/banners");
  }

  const imagePath = path.join(uploadsDir, banner.image);
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }

  await banner.destroy();
  setFlash(req, "success", "Banner eliminado correctamente.");
  res.redirect("/admin/banners");
};

exports.coupons = async (req, res) => {
  await renderCouponsPage(req, res);
};

exports.createCoupon = async (req, res) => {
  const scope = getAdminScope(req);
  const formData = {
    code: (req.body.code || "").trim().toUpperCase(),
    title: (req.body.title || "").trim(),
    description: (req.body.description || "").trim(),
    discountType: (req.body.discountType || "percent").trim(),
    discountValue: req.body.discountValue ?? "",
    minimumCartAmount: req.body.minimumCartAmount ?? 0,
    usageLimit: req.body.usageLimit ?? "",
    productId: (req.body.productId || "").trim(),
    isActive: req.body.isActive === "on" || req.body.isActive === true
  };
  const errors = [];
  const discountValue = Number(formData.discountValue);
  const minimumCartAmount = Number(formData.minimumCartAmount);
  const usageLimit = Number(formData.usageLimit);

  if (!formData.code) {
    errors.push("El codigo del cupon es obligatorio.");
  }

  if (!formData.title) {
    errors.push("El nombre interno del cupon es obligatorio.");
  }

  if (!["percent", "fixed"].includes(formData.discountType)) {
    errors.push("El tipo de descuento no es valido.");
  }

  if (Number.isNaN(discountValue) || discountValue <= 0) {
    errors.push("El valor del descuento debe ser mayor a 0.");
  }

  if (formData.discountType === "percent" && discountValue > 100) {
    errors.push("El porcentaje no puede ser mayor a 100.");
  }

  if (!Number.isInteger(usageLimit) || usageLimit < 1) {
    errors.push("El limite de usos debe ser un numero entero mayor o igual a 1.");
  }

  if (Number.isNaN(minimumCartAmount) || minimumCartAmount < 0) {
    errors.push("El monto minimo debe ser un numero mayor o igual a 0.");
  }

  const existingCoupon = formData.code
    ? await Coupon.findOne({ where: withStoreScope(req, { code: formData.code }) })
    : null;

  if (existingCoupon) {
    errors.push("Ya existe un cupon con ese codigo en esta tienda.");
  }

  let product = null;
  if (formData.productId) {
    product = await Product.findByPk(formData.productId);

    if (!product) {
      errors.push("El producto seleccionado no existe.");
    } else if (scope.role !== "superadmin" && scope.storeId && product.StoreId !== scope.storeId) {
      errors.push("No puedes asociar cupones a productos de otra tienda.");
    }
  }

  if (errors.length > 0) {
    return renderCouponsPage(req, res, {
      status: 400,
      errorMessages: errors,
      formData
    });
  }

  await Coupon.create({
    code: formData.code,
    title: formData.title,
    description: formData.description || null,
    discountType: formData.discountType,
    discountValue,
    minimumCartAmount,
    usageLimit,
    isActive: formData.isActive,
    ProductId: product?.id || null,
    StoreId: product?.StoreId || scope.storeId
  });

  setFlash(req, "success", "Cupon creado correctamente.");
  res.redirect("/admin/coupons");
};

exports.updateCoupon = async (req, res) => {
  const scope = getAdminScope(req);
  const coupon = await Coupon.findByPk(req.params.id);

  if (!coupon || (scope.role !== "superadmin" && scope.storeId && coupon.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Cupon no encontrado.");
    return res.redirect("/admin/coupons");
  }

  const formData = {
    code: (req.body.code || "").trim().toUpperCase(),
    title: (req.body.title || "").trim(),
    description: (req.body.description || "").trim(),
    discountType: (req.body.discountType || "percent").trim(),
    discountValue: req.body.discountValue ?? "",
    minimumCartAmount: req.body.minimumCartAmount ?? 0,
    usageLimit: req.body.usageLimit ?? "",
    productId: (req.body.productId || "").trim(),
    isActive: req.body.isActive === "on" || req.body.isActive === true
  };
  const errors = [];
  const discountValue = Number(formData.discountValue);
  const minimumCartAmount = Number(formData.minimumCartAmount);
  const usageLimit = Number(formData.usageLimit);

  if (!formData.code) errors.push("El codigo del cupon es obligatorio.");
  if (!formData.title) errors.push("El nombre interno del cupon es obligatorio.");
  if (!["percent", "fixed"].includes(formData.discountType)) errors.push("El tipo de descuento no es valido.");
  if (Number.isNaN(discountValue) || discountValue <= 0) errors.push("El valor del descuento debe ser mayor a 0.");
  if (formData.discountType === "percent" && discountValue > 100) errors.push("El porcentaje no puede ser mayor a 100.");
  if (Number.isNaN(minimumCartAmount) || minimumCartAmount < 0) errors.push("El monto minimo debe ser un numero mayor o igual a 0.");
  if (!Number.isInteger(usageLimit) || usageLimit < 1) errors.push("El limite de usos debe ser un numero entero mayor o igual a 1.");
  if (usageLimit < (Number(coupon.usageCount) || 0)) errors.push("El limite de usos no puede quedar por debajo del consumo actual.");

  const duplicate = formData.code
    ? await Coupon.findOne({
      where: {
        ...withStoreScope(req, { code: formData.code }),
        id: { [Op.ne]: coupon.id }
      }
    })
    : null;

  if (duplicate) {
    errors.push("Ya existe otro cupon con ese codigo en esta tienda.");
  }

  let product = null;
  if (formData.productId) {
    product = await Product.findByPk(formData.productId);

    if (!product) {
      errors.push("El producto seleccionado no existe.");
    } else if (scope.role !== "superadmin" && scope.storeId && product.StoreId !== scope.storeId) {
      errors.push("No puedes asociar cupones a productos de otra tienda.");
    }
  }

  if (errors.length > 0) {
    setFlash(req, "error", errors[0]);
    return res.redirect("/admin/coupons");
  }

  await coupon.update({
    code: formData.code,
    title: formData.title,
    description: formData.description || null,
    discountType: formData.discountType,
    discountValue,
    minimumCartAmount,
    usageLimit,
    isActive: formData.isActive,
    ProductId: product?.id || null,
    StoreId: product?.StoreId || coupon.StoreId
  });

  setFlash(req, "success", "Cupon actualizado correctamente.");
  res.redirect("/admin/coupons");
};

exports.toggleCouponStatus = async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!coupon || (scope.role !== "superadmin" && scope.storeId && coupon.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Cupon no encontrado.");
    return res.redirect("/admin/coupons");
  }

  await coupon.update({ isActive: !coupon.isActive });
  setFlash(req, "success", `Cupon ${coupon.isActive ? "desactivado" : "activado"} correctamente.`);
  res.redirect("/admin/coupons");
};

exports.deleteCoupon = async (req, res) => {
  const coupon = await Coupon.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!coupon || (scope.role !== "superadmin" && scope.storeId && coupon.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Cupon no encontrado.");
    return res.redirect("/admin/coupons");
  }

  await coupon.destroy();
  setFlash(req, "success", "Cupon eliminado correctamente.");
  res.redirect("/admin/coupons");
};

exports.stores = async (req, res) => {
  await renderStoresPage(req, res);
};

exports.createStore = async (req, res) => {
  const promoSections = buildPromoSectionsFromRequest(req);
  const featuredCategoryIds = []
    .concat(req.body.featuredCategoryIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 3);

  const formData = {
    name: (req.body.name || "").trim(),
    slug: (req.body.slug || "").trim().toLowerCase(),
    contactEmail: (req.body.contactEmail || "").trim(),
    contactPhone: (req.body.contactPhone || "").trim(),
    whatsapp: (req.body.whatsapp || "").trim(),
    logo: getUploadedFileName(req, "storeLogo"),
    primaryColor: (req.body.primaryColor || "#198754").trim(),
    secondaryColor: (req.body.secondaryColor || "#212529").trim(),
    backgroundColor: (req.body.backgroundColor || "#f5f5f5").trim(),
    surfaceColor: (req.body.surfaceColor || "#ffffff").trim(),
    buttonPrimaryColor: (req.body.buttonPrimaryColor || req.body.primaryColor || "#198754").trim(),
    buttonSecondaryColor: (req.body.buttonSecondaryColor || req.body.secondaryColor || "#212529").trim(),
    backgroundDecorMode: ["soft", "mesh", "none"].includes(req.body.backgroundDecorMode) ? req.body.backgroundDecorMode : "soft",
    backgroundPattern: ["none", "dots", "grid", "diagonal"].includes(req.body.backgroundPattern) ? req.body.backgroundPattern : "none",
    backgroundDecorOpacity: String(Math.min(Math.max(Number(req.body.backgroundDecorOpacity) || 18, 0), 30)),
    backgroundImage: getUploadedFileName(req, "backgroundImage"),
    popupEnabled: req.body.popupEnabled === "on" || req.body.popupEnabled === true,
    popupImage: getUploadedFileName(req, "popupImage"),
    popupTargetUrl: (req.body.popupTargetUrl || "").trim(),
    popupTitle: (req.body.popupTitle || "").trim(),
    popupStartDate: (req.body.popupStartDate || "").trim(),
    popupEndDate: (req.body.popupEndDate || "").trim(),
    popupOnlyHome: req.body.popupOnlyHome === "on" || req.body.popupOnlyHome === true,
    popupOpenInNewTab: req.body.popupOpenInNewTab === "on" || req.body.popupOpenInNewTab === true,
    surfaceRadius: String(Math.min(Math.max(Number(req.body.surfaceRadius) || 24, 12), 40)),
    buttonRadius: String(Math.min(Math.max(Number(req.body.buttonRadius) || 12, 6), 24)),
    notificationTag: (req.body.notificationTag || "").trim().toUpperCase(),
    heroEyebrow: (req.body.heroEyebrow || "Catalogo comercial").trim(),
    heroTitle: (req.body.heroTitle || "").trim(),
    heroSubtitle: (req.body.heroSubtitle || "").trim(),
    showRecommended: req.body.showRecommended === "on" || req.body.showRecommended === true,
    recommendedTitle: (req.body.recommendedTitle || "").trim(),
    showNewArrivals: req.body.showNewArrivals === "on" || req.body.showNewArrivals === true,
    newArrivalsTitle: (req.body.newArrivalsTitle || "").trim(),
    showFeaturedCategories: req.body.showFeaturedCategories === "on" || req.body.showFeaturedCategories === true,
    featuredCategoriesTitle: (req.body.featuredCategoriesTitle || "").trim(),
    featuredCategoryIds,
    promoSections,
    isActive: req.body.isActive === "on" || req.body.isActive === true
  };
  const errors = [];

  if (!formData.name) {
    errors.push("El nombre de la tienda es obligatorio.");
  }

  if (!formData.slug) {
    errors.push("El slug de la tienda es obligatorio.");
  } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
    errors.push("El slug solo puede tener letras minusculas, numeros y guiones.");
  }

  const existingStore = formData.slug
    ? await Store.findOne({ where: { slug: formData.slug } })
    : null;

  if (existingStore) {
    errors.push("Ya existe una tienda con ese slug.");
  }

  if (errors.length > 0) {
    removeRequestUploads(req, ["storeLogo", "backgroundImage", "popupImage", "promoImage1", "promoImage2"]);
    return renderStoresPage(req, res, {
      status: 400,
      errorMessages: errors,
      formData
    });
  }

  await Store.create({
    name: formData.name,
    slug: formData.slug,
    contactEmail: formData.contactEmail || null,
    contactPhone: formData.contactPhone || null,
    whatsapp: formData.whatsapp || null,
    logo: formData.logo || null,
    primaryColor: formData.primaryColor || "#198754",
    secondaryColor: formData.secondaryColor || "#212529",
    themeConfig: {
      heroEyebrow: formData.heroEyebrow || "Catalogo comercial",
      heroTitle: formData.heroTitle || null,
      heroSubtitle: formData.heroSubtitle || null,
      backgroundColor: formData.backgroundColor || "#f5f5f5",
      surfaceColor: formData.surfaceColor || "#ffffff",
      buttonPrimaryColor: formData.buttonPrimaryColor || formData.primaryColor || "#198754",
      buttonSecondaryColor: formData.buttonSecondaryColor || formData.secondaryColor || "#212529",
      backgroundDecorMode: formData.backgroundDecorMode,
      backgroundPattern: formData.backgroundPattern,
      backgroundDecorOpacity: formData.backgroundDecorOpacity,
      backgroundImage: formData.backgroundImage || null,
      popupEnabled: formData.popupEnabled,
      popupImage: formData.popupImage || null,
      popupTargetUrl: formData.popupTargetUrl || null,
      popupTitle: formData.popupTitle || null,
      popupStartDate: formData.popupStartDate || null,
      popupEndDate: formData.popupEndDate || null,
      popupOnlyHome: formData.popupOnlyHome,
      popupOpenInNewTab: formData.popupOpenInNewTab,
      surfaceRadius: formData.surfaceRadius,
      buttonRadius: formData.buttonRadius,
      notificationTag: formData.notificationTag || null,
      showRecommended: formData.showRecommended,
      recommendedTitle: formData.recommendedTitle || null,
      showNewArrivals: formData.showNewArrivals,
      newArrivalsTitle: formData.newArrivalsTitle || null,
      showFeaturedCategories: formData.showFeaturedCategories,
      featuredCategoriesTitle: formData.featuredCategoriesTitle || null,
      featuredCategoryIds: formData.featuredCategoryIds,
      promoSections: formData.promoSections
    },
    shippingConfig: buildDefaultShippingConfig(),
    notificationConfig: DEFAULT_NOTIFICATION_CONFIG,
    isActive: formData.isActive
  });

  setFlash(req, "success", "Tienda creada correctamente.");
  res.redirect("/admin/stores");
};

exports.updateStore = async (req, res) => {
  const store = await Store.findByPk(req.params.id);

  if (!store) {
    setFlash(req, "error", "Tienda no encontrada.");
    return res.redirect("/admin/stores");
  }

  const existingPromoSections = getThemePromoSections(store.themeConfig);
  const promoSections = buildPromoSectionsFromRequest(req, existingPromoSections);
  const featuredCategoryIds = []
    .concat(req.body.featuredCategoryIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 3);

  const formData = {
    name: (req.body.name || "").trim(),
    slug: (req.body.slug || "").trim().toLowerCase(),
    contactEmail: (req.body.contactEmail || "").trim(),
    contactPhone: (req.body.contactPhone || "").trim(),
    whatsapp: (req.body.whatsapp || "").trim(),
    logo: getUploadedFileName(req, "storeLogo") || store.logo || "",
    primaryColor: (req.body.primaryColor || "#198754").trim(),
    secondaryColor: (req.body.secondaryColor || "#212529").trim(),
    backgroundColor: (req.body.backgroundColor || store.themeConfig?.backgroundColor || "#f5f5f5").trim(),
    surfaceColor: (req.body.surfaceColor || store.themeConfig?.surfaceColor || "#ffffff").trim(),
    buttonPrimaryColor: (req.body.buttonPrimaryColor || store.themeConfig?.buttonPrimaryColor || req.body.primaryColor || store.primaryColor || "#198754").trim(),
    buttonSecondaryColor: (req.body.buttonSecondaryColor || store.themeConfig?.buttonSecondaryColor || req.body.secondaryColor || store.secondaryColor || "#212529").trim(),
    backgroundDecorMode: ["soft", "mesh", "none"].includes(req.body.backgroundDecorMode)
      ? req.body.backgroundDecorMode
      : (store.themeConfig?.backgroundDecorMode || "soft"),
    backgroundPattern: ["none", "dots", "grid", "diagonal"].includes(req.body.backgroundPattern)
      ? req.body.backgroundPattern
      : (store.themeConfig?.backgroundPattern || "none"),
    backgroundDecorOpacity: String(Math.min(Math.max(
      Number(req.body.backgroundDecorOpacity ?? store.themeConfig?.backgroundDecorOpacity) || 18,
      0
    ), 30)),
    backgroundImage: getUploadedFileName(req, "backgroundImage") || store.themeConfig?.backgroundImage || "",
    popupEnabled: req.body.popupEnabled === "on" || req.body.popupEnabled === true,
    popupImage: getUploadedFileName(req, "popupImage") || store.themeConfig?.popupImage || "",
    popupTargetUrl: (req.body.popupTargetUrl || store.themeConfig?.popupTargetUrl || "").trim(),
    popupTitle: (req.body.popupTitle || store.themeConfig?.popupTitle || "").trim(),
    popupStartDate: (req.body.popupStartDate || store.themeConfig?.popupStartDate || "").trim(),
    popupEndDate: (req.body.popupEndDate || store.themeConfig?.popupEndDate || "").trim(),
    popupOnlyHome: req.body.popupOnlyHome === "on" || req.body.popupOnlyHome === true,
    popupOpenInNewTab: req.body.popupOpenInNewTab === "on" || req.body.popupOpenInNewTab === true,
    surfaceRadius: String(Math.min(Math.max(
      Number(req.body.surfaceRadius ?? store.themeConfig?.surfaceRadius) || 24,
      12
    ), 40)),
    buttonRadius: String(Math.min(Math.max(
      Number(req.body.buttonRadius ?? store.themeConfig?.buttonRadius) || 12,
      6
    ), 24)),
    notificationTag: (req.body.notificationTag || store.themeConfig?.notificationTag || "").trim().toUpperCase(),
    heroEyebrow: (req.body.heroEyebrow || store.themeConfig?.heroEyebrow || "Catalogo comercial").trim(),
    heroTitle: (req.body.heroTitle || store.themeConfig?.heroTitle || "").trim(),
    heroSubtitle: (req.body.heroSubtitle || store.themeConfig?.heroSubtitle || "").trim(),
    showRecommended: req.body.showRecommended === "on" || req.body.showRecommended === true,
    recommendedTitle: (req.body.recommendedTitle || store.themeConfig?.recommendedTitle || "").trim(),
    showNewArrivals: req.body.showNewArrivals === "on" || req.body.showNewArrivals === true,
    newArrivalsTitle: (req.body.newArrivalsTitle || store.themeConfig?.newArrivalsTitle || "").trim(),
    showFeaturedCategories: req.body.showFeaturedCategories === "on" || req.body.showFeaturedCategories === true,
    featuredCategoriesTitle: (req.body.featuredCategoriesTitle || store.themeConfig?.featuredCategoriesTitle || "").trim(),
    featuredCategoryIds,
    promoSections,
    isActive: req.body.isActive === "on" || req.body.isActive === true
  };
  const errors = [];

  if (!formData.name) errors.push("El nombre de la tienda es obligatorio.");
  if (!formData.slug) {
    errors.push("El slug de la tienda es obligatorio.");
  } else if (!/^[a-z0-9-]+$/.test(formData.slug)) {
    errors.push("El slug solo puede tener letras minusculas, numeros y guiones.");
  }

  const duplicateStore = formData.slug
    ? await Store.findOne({
      where: {
        slug: formData.slug,
        id: { [Op.ne]: store.id }
      }
    })
    : null;

  if (duplicateStore) {
    errors.push("Ya existe otra tienda con ese slug.");
  }

  if (errors.length > 0) {
    removeRequestUploads(req, ["storeLogo", "backgroundImage", "popupImage", "promoImage1", "promoImage2"]);
    setFlash(req, "error", errors[0]);
    return res.redirect("/admin/stores");
  }

  if (getUploadedFileName(req, "storeLogo") && store.logo && store.logo !== formData.logo) {
    removeUploadedAsset(store.logo);
  }

  if (getUploadedFileName(req, "backgroundImage") && store.themeConfig?.backgroundImage && store.themeConfig.backgroundImage !== formData.backgroundImage) {
    removeUploadedAsset(store.themeConfig.backgroundImage);
  }

  if (getUploadedFileName(req, "popupImage") && store.themeConfig?.popupImage && store.themeConfig.popupImage !== formData.popupImage) {
    removeUploadedAsset(store.themeConfig.popupImage);
  }

  removeReplacedPromoImages(existingPromoSections, formData.promoSections);

  await store.update({
    name: formData.name,
    slug: formData.slug,
    contactEmail: formData.contactEmail || null,
    contactPhone: formData.contactPhone || null,
    whatsapp: formData.whatsapp || null,
    logo: formData.logo || null,
    primaryColor: formData.primaryColor || "#198754",
    secondaryColor: formData.secondaryColor || "#212529",
    themeConfig: {
      ...(store.themeConfig || {}),
      heroEyebrow: formData.heroEyebrow || "Catalogo comercial",
      heroTitle: formData.heroTitle || null,
      heroSubtitle: formData.heroSubtitle || null,
      backgroundColor: formData.backgroundColor || "#f5f5f5",
      surfaceColor: formData.surfaceColor || "#ffffff",
      buttonPrimaryColor: formData.buttonPrimaryColor || formData.primaryColor || "#198754",
      buttonSecondaryColor: formData.buttonSecondaryColor || formData.secondaryColor || "#212529",
      backgroundDecorMode: formData.backgroundDecorMode,
      backgroundPattern: formData.backgroundPattern,
      backgroundDecorOpacity: formData.backgroundDecorOpacity,
      backgroundImage: formData.backgroundImage || null,
      popupEnabled: formData.popupEnabled,
      popupImage: formData.popupImage || null,
      popupTargetUrl: formData.popupTargetUrl || null,
      popupTitle: formData.popupTitle || null,
      popupStartDate: formData.popupStartDate || null,
      popupEndDate: formData.popupEndDate || null,
      popupOnlyHome: formData.popupOnlyHome,
      popupOpenInNewTab: formData.popupOpenInNewTab,
      surfaceRadius: formData.surfaceRadius,
      buttonRadius: formData.buttonRadius,
      notificationTag: formData.notificationTag || null,
      showRecommended: formData.showRecommended,
      recommendedTitle: formData.recommendedTitle || null,
      showNewArrivals: formData.showNewArrivals,
      newArrivalsTitle: formData.newArrivalsTitle || null,
      showFeaturedCategories: formData.showFeaturedCategories,
      featuredCategoriesTitle: formData.featuredCategoriesTitle || null,
      featuredCategoryIds: formData.featuredCategoryIds,
      promoSections: formData.promoSections
    },
    shippingConfig: store.shippingConfig || buildDefaultShippingConfig(),
    notificationConfig: store.notificationConfig || DEFAULT_NOTIFICATION_CONFIG,
    isActive: formData.isActive
  });

  const currentAdmin = req.session.admin || {};
  if (Number(currentAdmin.StoreId) === Number(store.id)) {
    req.session.admin = {
      ...currentAdmin,
      storeName: formData.name,
      storeSlug: formData.slug,
      storeLogo: formData.logo || null,
      primaryColor: formData.primaryColor || "#198754",
      secondaryColor: formData.secondaryColor || "#212529"
    };
  }

  setFlash(req, "success", "Tienda actualizada correctamente.");
  res.redirect("/admin/stores");
};

exports.shippingSettings = async (req, res) => {
  await renderShippingSettingsPage(req, res);
};

exports.updateShippingSettings = async (req, res) => {
  const selectedStore = await getShippingSettingsStore(req, req.body.storeId);

  if (!selectedStore) {
    setFlash(req, "error", "Tienda no encontrada.");
    return res.redirect("/admin");
  }

  const shippingCities = getShippingCities().map((city) => {
    const rawCost = req.body[`shippingCost_${city.key}`];
    const chargeShipping = req.body[`chargeShipping_${city.key}`] === "on";
    const allowCashOnDelivery = req.body[`allowCashOnDelivery_${city.key}`] === "on";
    const parsedCost = Number(rawCost);

    return {
      key: city.key,
      label: city.label,
      chargeShipping,
      allowCashOnDelivery,
      rawCost,
      cost: Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : 0
    };
  });

  const invalidCity = shippingCities.find((city) =>
    city.chargeShipping && (
      city.rawCost === undefined ||
      city.rawCost === "" ||
      !Number.isFinite(Number(city.rawCost)) ||
      Number(city.rawCost) < 0
    )
  );
  if (invalidCity) {
    return renderShippingSettingsPage(req, res, {
      status: 400,
      selectedStore,
      errorMessages: [`El costo de envio para ${invalidCity.label} debe ser un numero mayor o igual a 0.`]
    });
  }

  await selectedStore.update({
    shippingConfig: {
      cities: shippingCities.map(({ rawCost, ...city }) => city)
    }
  });

  setFlash(req, "success", `Configuracion de envios actualizada para ${selectedStore.name}.`);
  res.redirect(
    getAdminScope(req).role === "superadmin"
      ? `/admin/shipping-settings?storeId=${selectedStore.id}`
      : "/admin/shipping-settings"
  );
};

exports.notificationsSettings = async (req, res) => {
  await renderNotificationsSettingsPage(req, res);
};

exports.updateNotificationsSettings = async (req, res) => {
  const selectedStore = await getNotificationsSettingsStore(req, req.body.storeId);

  if (!selectedStore) {
    setFlash(req, "error", "Tienda no encontrada.");
    return res.redirect("/admin");
  }

  const formData = {
    notifyOnNewOrder: req.body.notifyOnNewOrder === "on",
    notifyOnLowStock: req.body.notifyOnLowStock === "on",
    orderEmails: (req.body.orderEmails || "").trim(),
    lowStockEmails: (req.body.lowStockEmails || "").trim()
  };

  const orderEmails = parseRecipients(formData.orderEmails);
  const lowStockEmails = parseRecipients(formData.lowStockEmails);
  const invalidEmail = [...orderEmails, ...lowStockEmails].find((email) => !isValidEmail(email));

  if (invalidEmail) {
    return renderNotificationsSettingsPage(req, res, {
      status: 400,
      selectedStore,
      formData,
      errorMessages: [`El correo ${invalidEmail} no tiene un formato valido.`]
    });
  }

  await selectedStore.update({
    notificationConfig: {
      notifyOnNewOrder: formData.notifyOnNewOrder,
      notifyOnLowStock: formData.notifyOnLowStock,
      orderEmails,
      lowStockEmails
    }
  });

  setFlash(req, "success", `Configuracion de notificaciones actualizada para ${selectedStore.name}.`);
  res.redirect(
    getAdminScope(req).role === "superadmin"
      ? `/admin/notifications?storeId=${selectedStore.id}`
      : "/admin/notifications"
  );
};

exports.sendTestNotificationEmail = async (req, res) => {
  const selectedStore = await getNotificationsSettingsStore(req, req.body.storeId);

  if (!selectedStore) {
    setFlash(req, "error", "Tienda no encontrada.");
    return res.redirect("/admin");
  }

  const config = getStoreNotificationConfig(selectedStore);
  const recipients = [...new Set([...config.orderEmails, ...config.lowStockEmails])];

  if (!getEmailProvider()) {
    setFlash(req, "error", "No hay un proveedor de correo configurado correctamente.");
  } else if (recipients.length === 0) {
    setFlash(req, "error", "Debes guardar al menos un correo destinatario antes de enviar una prueba.");
  } else {
    try {
      await sendTestNotification(selectedStore, recipients);
      setFlash(req, "success", `Correo de prueba enviado a ${recipients.join(", ")}.`);
    } catch (error) {
      console.error("Error al enviar correo de prueba:", error);
      setFlash(req, "error", error.message || "No se pudo enviar el correo de prueba.");
    }
  }

  res.redirect(
    getAdminScope(req).role === "superadmin"
      ? `/admin/notifications?storeId=${selectedStore.id}`
      : "/admin/notifications"
  );
};

exports.adminUsers = async (req, res) => {
  await renderAdminUsersPage(req, res);
};

exports.createAdminUser = async (req, res) => {
  const formData = {
    email: (req.body.email || "").trim().toLowerCase(),
    password: req.body.password || "",
    role: (req.body.role || "store_admin").trim(),
    storeId: (req.body.storeId || "").trim()
  };
  const errors = [];

  if (!formData.email) errors.push("El correo del admin es obligatorio.");
  if (!formData.password || formData.password.length < 6) errors.push("La contrasena debe tener al menos 6 caracteres.");
  if (!["superadmin", "store_admin"].includes(formData.role)) errors.push("El rol seleccionado no es valido.");

  const existingAdmin = formData.email
    ? await Admin.findOne({ where: { email: formData.email } })
    : null;

  if (existingAdmin) {
    errors.push("Ya existe un admin con ese correo.");
  }

  let store = null;
  if (formData.role === "store_admin") {
    if (!formData.storeId) {
      errors.push("Debes asignar una tienda al admin de tienda.");
    } else {
      store = await Store.findByPk(formData.storeId);
      if (!store) {
        errors.push("La tienda asignada no existe.");
      }
    }
  } else if (formData.storeId) {
    store = await Store.findByPk(formData.storeId);
  }

  if (errors.length > 0) {
    return renderAdminUsersPage(req, res, {
      status: 400,
      errorMessages: errors,
      formData
    });
  }

  const password = await bcrypt.hash(formData.password, 10);

  await Admin.create({
    email: formData.email,
    password,
    role: formData.role,
    StoreId: formData.role === "store_admin" ? store.id : (store?.id || null)
  });

  setFlash(req, "success", "Usuario admin creado correctamente.");
  res.redirect("/admin/admin-users");
};

exports.updateAdminUser = async (req, res) => {
  const adminUser = await Admin.findByPk(req.params.id);

  if (!adminUser) {
    setFlash(req, "error", "Usuario admin no encontrado.");
    return res.redirect("/admin/admin-users");
  }

  const formData = {
    email: (req.body.email || "").trim().toLowerCase(),
    password: req.body.password || "",
    role: (req.body.role || "store_admin").trim(),
    storeId: (req.body.storeId || "").trim()
  };
  const errors = [];

  if (!formData.email) errors.push("El correo del admin es obligatorio.");
  if (!["superadmin", "store_admin"].includes(formData.role)) errors.push("El rol seleccionado no es valido.");

  const duplicateAdmin = formData.email
    ? await Admin.findOne({
      where: {
        email: formData.email,
        id: { [Op.ne]: adminUser.id }
      }
    })
    : null;

  if (duplicateAdmin) {
    errors.push("Ya existe otro admin con ese correo.");
  }

  let store = null;
  if (formData.role === "store_admin") {
    if (!formData.storeId) {
      errors.push("Debes asignar una tienda al admin de tienda.");
    } else {
      store = await Store.findByPk(formData.storeId);
      if (!store) {
        errors.push("La tienda asignada no existe.");
      }
    }
  } else if (formData.storeId) {
    store = await Store.findByPk(formData.storeId);
  }

  if (errors.length > 0) {
    setFlash(req, "error", errors[0]);
    return res.redirect("/admin/admin-users");
  }

  const payload = {
    email: formData.email,
    role: formData.role,
    StoreId: formData.role === "store_admin" ? store.id : (store?.id || null)
  };

  if (formData.password) {
    if (formData.password.length < 6) {
      setFlash(req, "error", "La nueva contrasena debe tener al menos 6 caracteres.");
      return res.redirect("/admin/admin-users");
    }

    payload.password = await bcrypt.hash(formData.password, 10);
  }

  await adminUser.update(payload);

  setFlash(req, "success", "Usuario admin actualizado correctamente.");
  res.redirect("/admin/admin-users");
};

exports.deleteAdminUser = async (req, res) => {
  const adminUser = await Admin.findByPk(req.params.id);
  const currentAdminId = req.session.admin?.id;

  if (!adminUser) {
    setFlash(req, "error", "Usuario admin no encontrado.");
    return res.redirect("/admin/admin-users");
  }

  if (Number(adminUser.id) === Number(currentAdminId)) {
    setFlash(req, "error", "No puedes eliminar tu propio usuario mientras estas conectado.");
    return res.redirect("/admin/admin-users");
  }

  await adminUser.destroy();
  setFlash(req, "success", "Usuario admin eliminado correctamente.");
  res.redirect("/admin/admin-users");
};

exports.reviews = async (req, res) => {
  await renderReviewsPage(req, res);
};

exports.approveReview = async (req, res) => {
  const review = await Review.findByPk(req.params.id);

  if (!isStoreOwnedRecord(req, review)) {
    setFlash(req, "error", "Resena no encontrada.");
    return res.redirect("/admin/reviews");
  }

  await review.update({
    status: "approved",
    adminNotes: (req.body.adminNotes || "").trim() || review.adminNotes || null
  });

  setFlash(req, "success", "Resena aprobada correctamente.");
  res.redirect("/admin/reviews");
};

exports.rejectReview = async (req, res) => {
  const review = await Review.findByPk(req.params.id);

  if (!isStoreOwnedRecord(req, review)) {
    setFlash(req, "error", "Resena no encontrada.");
    return res.redirect("/admin/reviews");
  }

  await review.update({
    status: "rejected",
    adminNotes: (req.body.adminNotes || "").trim() || review.adminNotes || null
  });

  setFlash(req, "success", "Resena rechazada correctamente.");
  res.redirect("/admin/reviews");
};

exports.products = async (req, res) => {
  const search = (req.query.search || "").trim();
  const category = (req.query.category || "").trim();
  const status = (req.query.status || "").trim();
  const stockFilter = (req.query.stockFilter || "").trim();
  const where = withStoreScope(req);

  if (search) {
    where.name = { [Op.like]: `%${search}%` };
  }

  if (category) {
    where.CategoryId = category;
  }

  if (status === "active") {
    where.isActive = true;
  }

  if (status === "inactive") {
    where.isActive = false;
  }

  if (stockFilter === "out") {
    where.stock = 0;
  }

  const products = await Product.findAll({
    where,
    include: [Category, ProductImage, ProductVariant],
    order: [[ProductImage, "isMain", "DESC"]]
  });

  const filteredProducts = products.filter((product) => {
    decorateProductInventory(product);
    const available = product.inventoryMeta.available;
    const threshold = product.inventoryMeta.threshold;

    if (stockFilter === "low") {
      return available <= threshold;
    }

    if (stockFilter === "variant-low") {
      return product.inventoryMeta.lowVariants.length > 0;
    }

    if (stockFilter === "variant-out") {
      return product.inventoryMeta.outVariants.length > 0;
    }

    return true;
  });

  const categories = await Category.findAll({
    where: withStoreScope(req)
  });

  res.render("admin/products", {
    layout: "admin/layout",
    products: filteredProducts,
    categories,
    filters: {
      search,
      category,
      status,
      stockFilter
    }
  });
};

exports.createProductForm = async (req, res) => {
  await renderCreateProductForm(res, {
    categoryWhere: withStoreScope(req)
  });
};

exports.createProduct = async (req, res) => {
  const formData = normalizeProductInput(req.body);
  const scope = getAdminScope(req);
  const { errors, values } = await validateProductInput(formData, {
    storeId: scope.storeId,
    role: scope.role
  });

  if (errors.length > 0) {
    return renderCreateProductForm(res, {
      status: 400,
      errorMessages: errors,
      formData
    });
  }

  await db.sequelize.transaction(async (transaction) => {
    const product = await Product.create({
      name: values.name,
      description: values.description,
      longDescription: values.longDescription || null,
      price: values.price,
      discountType: values.discountType,
      discountValue: values.discountValue,
      discountLabel: values.discountLabel || null,
      discountStartDate: values.discountStartDate,
      discountEndDate: values.discountEndDate,
      stock: values.stock,
      reservedStock: values.reservedStock || 0,
      lowStockThreshold: values.lowStockThreshold,
      isActive: values.isActive,
      CategoryId: values.categoryId,
      StoreId: scope.storeId
    }, { transaction });

    if (values.variants.length > 0) {
      for (const variant of values.variants) {
        await ProductVariant.create({
          name: variant.name,
          stock: variant.stock,
          reservedStock: 0,
          price: variant.price,
          ProductId: product.id
        }, { transaction });
      }
    }

    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        await ProductImage.create({
          image: file.filename,
          ProductId: product.id,
          isMain: i === 0
        }, { transaction });
      }
    }
  });

  res.redirect("/admin/products");
};

exports.editProductForm = async (req, res) => {
  const scope = getAdminScope(req);
  await renderEditProductForm(res, req.params.id, {
    categoryWhere: withStoreScope(req),
    storeId: scope.storeId,
    role: scope.role
  });
};

exports.updateProduct = async (req, res) => {
  const formData = normalizeProductInput(req.body);
  const product = await Product.findByPk(req.params.id, {
    include: [ProductVariant]
  });
  const scope = getAdminScope(req);

  if (!product || (scope.role !== "superadmin" && scope.storeId && product.StoreId !== scope.storeId)) {
    return res.redirect("/admin/products");
  }

  const { errors, values } = await validateProductInput(formData, {
    existingVariants: product.ProductVariants || [],
    storeId: scope.storeId,
    role: scope.role
  });
  if (errors.length > 0) {
    return renderEditProductForm(res, req.params.id, {
      status: 400,
      errorMessages: errors,
      formData,
      categoryWhere: withStoreScope(req),
      storeId: scope.storeId,
      role: scope.role
    });
  }

  let image = product.image;
  const lowStockAlerts = [];

  if (req.files && req.files.length > 0) {
    image = req.files[0].filename;
  }

  try {
    await db.sequelize.transaction(async (transaction) => {
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await ProductImage.create({
            image: file.filename,
            ProductId: product.id
          }, { transaction });
        }
      }

      const existingVariants = product.ProductVariants || [];
      const existingVariantIds = new Set(existingVariants.map((variant) => String(variant.id)));
      const submittedVariantIds = new Set(
        values.variants
          .filter((variant) => variant.id)
          .map((variant) => String(variant.id))
      );

      for (const variant of existingVariants) {
        if (!submittedVariantIds.has(String(variant.id))) {
          if ((Number(variant.reservedStock) || 0) > 0) {
            throw new Error(`No puedes eliminar la variante "${variant.name}" porque tiene unidades reservadas.`);
          }

          await variant.destroy({ transaction });
        }
      }

      for (const variant of values.variants) {
        if (variant.id && existingVariantIds.has(String(variant.id))) {
          const currentVariant = existingVariants.find((item) => String(item.id) === String(variant.id));
          const threshold = Number(values.lowStockThreshold) || 0;
          const beforeAvailable = (Number(currentVariant?.stock) || 0) - (Number(currentVariant?.reservedStock) || 0);
          const afterAvailable = (Number(variant.stock) || 0) - (Number(currentVariant?.reservedStock) || 0);

          if (beforeAvailable > threshold && afterAvailable <= threshold) {
            lowStockAlerts.push({
              productName: product.name,
              variantName: variant.name,
              available: afterAvailable,
              threshold
            });
          }

          await ProductVariant.update({
            name: variant.name,
            stock: variant.stock,
            price: variant.price
          }, {
            where: { id: variant.id, ProductId: product.id },
            transaction
          });
        } else {
          await ProductVariant.create({
            name: variant.name,
            stock: variant.stock,
            reservedStock: 0,
            price: variant.price,
            ProductId: product.id
          }, { transaction });
        }
      }

      if (values.variants.length === 0) {
        const beforeAvailable = (Number(product.stock) || 0) - (Number(product.reservedStock) || 0);
        const afterAvailable = (Number(values.stock) || 0) - (Number(product.reservedStock) || 0);
        const threshold = Number(values.lowStockThreshold) || 0;

        if (beforeAvailable > threshold && afterAvailable <= threshold) {
          lowStockAlerts.push({
            productName: product.name,
            variantName: "",
            available: afterAvailable,
            threshold
          });
        }
      }

      await product.update({
        name: values.name,
        description: values.description,
        longDescription: values.longDescription || null,
        price: values.price,
        discountType: values.discountType,
        discountValue: values.discountValue,
        discountLabel: values.discountLabel || null,
        discountStartDate: values.discountStartDate,
        discountEndDate: values.discountEndDate,
        stock: values.stock,
        reservedStock: values.reservedStock ?? product.reservedStock,
        lowStockThreshold: values.lowStockThreshold,
        isActive: values.isActive,
        image,
        CategoryId: values.categoryId
        }, { transaction });
      });
  } catch (error) {
    return renderEditProductForm(res, req.params.id, {
      status: 400,
      errorMessages: [error.message || "No fue posible actualizar las variantes del producto."],
      formData,
      categoryWhere: withStoreScope(req),
      storeId: scope.storeId,
      role: scope.role
    });
  }

  if (lowStockAlerts.length > 0) {
    const store = await Store.findByPk(product.StoreId);
    notifyLowStock(store, lowStockAlerts, "actualizacion manual de inventario").catch((error) => {
      console.error("No se pudo enviar la alerta de bajo stock.", error);
    });
  }

  setFlash(req, "success", "Producto actualizado correctamente.");
  res.redirect("/admin/products");
};

exports.deleteProductPost = async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!product || (scope.role !== "superadmin" && scope.storeId && product.StoreId !== scope.storeId)) {
    return res.redirect("/admin/products");
  }

  await ProductImage.destroy({
    where: { ProductId: req.params.id }
  });

  await Product.destroy({ where: { id: req.params.id } });

  res.redirect("/admin/products");
};

exports.toggleProductStatus = async (req, res) => {
  const product = await Product.findByPk(req.params.id);

  if (!isProductOwnedRecord(req, product)) {
    setFlash(req, "error", "Producto no encontrado.");
    return res.redirect("/admin/products");
  }

  const nextStatus = !product.isActive;
  await product.update({ isActive: nextStatus });

  setFlash(req, "success", `Producto ${nextStatus ? "activado" : "desactivado"} correctamente.`);
  res.redirect("/admin/products");
};

exports.updateVariantStockQuick = async (req, res) => {
  const variant = await ProductVariant.findByPk(req.params.id, {
    include: [Product]
  });

  if (!variant || !isProductOwnedRecord(req, variant.Product)) {
    setFlash(req, "error", "Variante no encontrada.");
    return res.redirect("/admin/products");
  }

  const stock = Number(req.body.stock);
  const reservedStock = Number(variant.reservedStock) || 0;

  if (!Number.isInteger(stock) || stock < 0) {
    setFlash(req, "error", `El stock de ${variant.name} debe ser un numero entero mayor o igual a 0.`);
    return res.redirect("/admin/products");
  }

  if (stock < reservedStock) {
    setFlash(req, "error", `No puedes dejar ${variant.name} por debajo de sus ${reservedStock} unidades reservadas.`);
    return res.redirect("/admin/products");
  }

  try {
    const threshold = Number(variant.Product?.lowStockThreshold) || 0;
    const beforeAvailable = (Number(variant.stock) || 0) - reservedStock;
    const afterAvailable = stock - reservedStock;
    const crossedToLowStock = beforeAvailable > threshold && afterAvailable <= threshold;

    await db.sequelize.transaction(async (transaction) => {
      await variant.update({ stock }, { transaction });

      const siblingVariants = await ProductVariant.findAll({
        where: { ProductId: variant.ProductId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      const totals = buildVariantInventory(siblingVariants.map((item) => ({
        stock: item.id === variant.id ? stock : item.stock,
        reservedStock: item.reservedStock
      })));

      await variant.Product.update({
        stock: totals.stock,
        reservedStock: totals.reservedStock
      }, { transaction });
    });

    if (crossedToLowStock) {
      const store = await Store.findByPk(variant.Product.StoreId);
      notifyLowStock(store, [{
        productName: variant.Product?.name || "Producto",
        variantName: variant.name,
        available: afterAvailable,
        threshold
      }], "ajuste rapido de stock").catch((error) => {
        console.error("No se pudo enviar la alerta de bajo stock.", error);
      });
    }

    setFlash(req, "success", `Stock de ${variant.Product?.name || "producto"} / ${variant.name} actualizado correctamente.`);
  } catch (error) {
    setFlash(req, "error", error.message || "No fue posible actualizar el stock de la variante.");
  }

  res.redirect("/admin/products");
};

exports.categories = async (req, res) => {
  const categories = await Category.findAll({
    where: withStoreScope(req)
  });

  res.render("admin/categories", {
    layout: "admin/layout",
    categories,
    errorMessages: [],
    formData: { name: "" }
  });
};

exports.createCategory = async (req, res) => {
  const name = (req.body.name || "").trim();
  const categories = await Category.findAll({
    where: withStoreScope(req)
  });

  if (!name) {
    return res.status(400).render("admin/categories", {
      layout: "admin/layout",
      categories,
      errorMessages: ["El nombre de la categoria es obligatorio."],
      formData: { name }
    });
  }

  const existingCategory = await Category.findOne({
    where: withStoreScope(req, { name })
  });
  if (existingCategory) {
    return res.status(400).render("admin/categories", {
      layout: "admin/layout",
      categories,
      errorMessages: ["Ya existe una categoria con ese nombre."],
      formData: { name }
    });
  }

  await Category.create({
    name,
    StoreId: getAdminScope(req).storeId
  });
  res.redirect("/admin/categories");
};

exports.deleteCategoryPost = async (req, res) => {
  const category = await Category.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!category || (scope.role !== "superadmin" && scope.storeId && category.StoreId !== scope.storeId)) {
    return res.redirect("/admin/categories");
  }

  await Category.destroy({ where: { id: req.params.id } });
  res.redirect("/admin/categories");
};

exports.deleteImage = async (req, res) => {
  const image = await ProductImage.findByPk(req.params.id, {
    include: [Product]
  });

  if (!image || !isProductOwnedRecord(req, image.Product)) {
    setFlash(req, "error", "Imagen no encontrada.");
    return res.redirect(req.get("Referer") || "/admin/products");
  }

  const imagePath = path.join(uploadsDir, image.image);

  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }

  await image.destroy();

  res.redirect(req.get("Referer") || "/admin/products");
};

exports.setMainImage = async (req, res) => {
  const image = await ProductImage.findByPk(req.params.id, {
    include: [Product]
  });

  if (!image || !isProductOwnedRecord(req, image.Product)) {
    setFlash(req, "error", "Imagen no encontrada.");
    return res.redirect("/admin/products");
  }

  await ProductImage.update(
    { isMain: false },
    { where: { ProductId: image.ProductId } }
  );

  await image.update({ isMain: true });

  res.redirect(req.get("Referer") || "/admin/products");
};

exports.orders = async (req, res) => {
  const status = (req.query.status || "").trim();
  const search = (req.query.search || "").trim();
  const dateFrom = (req.query.dateFrom || "").trim();
  const dateTo = (req.query.dateTo || "").trim();
  const sort = (req.query.sort || "newest").trim();
  const where = withStoreScope(req);

  if (status && STATUS_LABELS[status]) {
    where.status = status;
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { phone: { [Op.like]: `%${search}%` } },
      { document: { [Op.like]: `%${search}%` } }
    ];
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};

    if (dateFrom) {
      where.createdAt[Op.gte] = new Date(`${dateFrom}T00:00:00`);
    }

    if (dateTo) {
      where.createdAt[Op.lte] = new Date(`${dateTo}T23:59:59.999`);
    }
  }

  const orderBy =
    sort === "oldest"
      ? [["createdAt", "ASC"]]
      : sort === "status"
        ? [["status", "ASC"], ["createdAt", "DESC"]]
        : [["createdAt", "DESC"]];

  const orders = await Order.findAll({
    where,
    include: [Customer],
    order: orderBy
  });

  const allOrders = await Order.findAll({
    where: withStoreScope(req),
    attributes: ["status"]
  });

  const summary = {
    total: allOrders.length,
    pendiente: allOrders.filter((order) => order.status === "pendiente").length,
    pago_validado: allOrders.filter((order) => order.status === "pago_validado").length,
    aceptado: allOrders.filter((order) => order.status === "aceptado").length,
    preparando: allOrders.filter((order) => order.status === "preparando").length,
    enviado: allOrders.filter((order) => order.status === "enviado").length,
    entregado: allOrders.filter((order) => order.status === "entregado").length,
    rechazado: allOrders.filter((order) => order.status === "rechazado").length
  };

  res.render("admin/orders", {
    layout: "admin/layout",
    orders,
    statusLabels: STATUS_LABELS,
    filters: {
      status,
      search,
      dateFrom,
      dateTo,
      sort
    },
    summary
  });
};

exports.orderDetail = async (req, res) => {
  const order = await Order.findByPk(req.params.id, {
    include: [
      Customer,
      {
        model: OrderItem,
        include: Product
      },
      Coupon
    ]
  });
  const scope = getAdminScope(req);

  if (!order || (scope.role !== "superadmin" && scope.storeId && order.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Pedido no encontrado.");
    return res.redirect("/admin/orders");
  }

  res.render("admin/orderDetail", {
    layout: "admin/layout",
    order,
    statusLabels: STATUS_LABELS,
    availableTransitions: ORDER_TRANSITIONS[order.status] || []
  });
};

exports.saveOrderNotes = async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!order || (scope.role !== "superadmin" && scope.storeId && order.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Pedido no encontrado.");
    return res.redirect("/admin/orders");
  }

  await order.update({
    internalNotes: (req.body.internalNotes || "").trim() || null
  });

  setFlash(req, "success", `Notas guardadas para el pedido #${order.id}.`);
  res.redirect(`/admin/orders/${order.id}`);
};

exports.savePaymentProof = async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!order || (scope.role !== "superadmin" && scope.storeId && order.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Pedido no encontrado.");
    return res.redirect("/admin/orders");
  }

  const paymentReference = (req.body.paymentReference || "").trim();
  const note = (req.body.paymentNote || "").trim();
  const hasNewProof = Boolean(req.file);

  if (!paymentReference && !hasNewProof && !order.paymentProofImage) {
    setFlash(req, "error", "Agrega una referencia o adjunta el comprobante antes de guardar.");
    return res.redirect(`/admin/orders/${order.id}`);
  }

  const nextHistory = [...(order.statusHistory || [])];
  nextHistory.push(buildPaymentEntry(
    note || `Comprobante ${hasNewProof ? "adjuntado" : "actualizado"} desde el panel admin.`
  ));

  await order.update({
    paymentReference: paymentReference || order.paymentReference || null,
    paymentProofImage: req.file?.filename || order.paymentProofImage || null,
    paymentReceivedAt: new Date(),
    statusHistory: nextHistory
  });

  setFlash(req, "success", `Comprobante registrado para el pedido #${order.id}.`);
  res.redirect(`/admin/orders/${order.id}`);
};

exports.validatePayment = async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  const scope = getAdminScope(req);

  if (!order || (scope.role !== "superadmin" && scope.storeId && order.StoreId !== scope.storeId)) {
    setFlash(req, "error", "Pedido no encontrado.");
    return res.redirect("/admin/orders");
  }

  if (order.status !== "pendiente") {
    setFlash(req, "error", "Solo puedes validar el pago de pedidos pendientes.");
    return res.redirect(`/admin/orders/${order.id}`);
  }

  if (order.paymentMethod === "transferencia" && !order.paymentReceivedAt && !order.paymentReference && !order.paymentProofImage) {
    setFlash(req, "error", "Registra primero el comprobante o la referencia antes de validar el pago.");
    return res.redirect(`/admin/orders/${order.id}`);
  }

  await order.update({
    status: "pago_validado",
    paymentValidatedAt: new Date(),
    statusHistory: [
      ...(order.statusHistory || []),
      buildStatusEntry("pago_validado", "Pago validado desde el panel admin.")
    ]
  });

  setFlash(req, "success", `Pago validado para el pedido #${order.id}.`);
  res.redirect(`/admin/orders/${order.id}`);
};

exports.acceptOrder = async (req, res) => {
  try {
    const order = await db.sequelize.transaction(async (transaction) => {
      const currentOrder = await Order.findByPk(req.params.id, {
        include: {
          model: OrderItem,
          include: Product
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!currentOrder) {
        throw new Error("Pedido no encontrado.");
      }

      if (!isStoreOwnedRecord(req, currentOrder)) {
        throw new Error("No puedes aceptar pedidos de otra tienda.");
      }

      if (!["pendiente", "pago_validado"].includes(currentOrder.status)) {
        throw new Error("Solo puedes aceptar pedidos pendientes o con pago validado.");
      }

      for (const item of currentOrder.OrderItems) {
        const product = await Product.findByPk(item.ProductId, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        const variant = item.ProductVariantId
          ? await ProductVariant.findByPk(item.ProductVariantId, {
            transaction,
            lock: transaction.LOCK.UPDATE
          })
          : null;

        if (!product) {
          throw new Error(`El producto ${item.Product?.name || item.ProductId} ya no existe.`);
        }

        if (product.reservedStock < item.quantity || product.stock < item.quantity) {
          throw new Error(`No hay stock suficiente para aceptar ${product.name}.`);
        }

        if (item.ProductVariantId) {
          if (!variant || variant.ProductId !== product.id) {
            throw new Error(`La variante ${item.variantName || item.ProductVariantId} ya no existe.`);
          }

          if (variant.reservedStock < item.quantity || variant.stock < item.quantity) {
            throw new Error(`No hay stock suficiente para aceptar ${product.name} (${item.variantName || variant.name}).`);
          }

          await variant.update({
            stock: variant.stock - item.quantity,
            reservedStock: variant.reservedStock - item.quantity
          }, { transaction });
        }

        await product.update({
          stock: product.stock - item.quantity,
          reservedStock: product.reservedStock - item.quantity
        }, { transaction });
      }

      await currentOrder.update({
        status: "aceptado",
        acceptedAt: new Date(),
        statusHistory: [
          ...(currentOrder.statusHistory || []),
          buildStatusEntry("aceptado", "Pedido aceptado desde el panel admin.")
        ]
      }, { transaction });

      return currentOrder;
    });

    const fileName = `order_${order.id}.pdf`;
    const filePath = path.join(pdfsDir, fileName);

    await buildPdfForOrder(order, filePath);
    await order.update({ pdf: fileName });

    setFlash(req, "success", `Pedido #${order.id} aceptado correctamente.`);
    res.redirect("/admin/orders");
  } catch (error) {
    console.log(error);
    setFlash(req, "error", error.message || "No fue posible aceptar el pedido.");
    res.redirect(`/admin/orders/${req.params.id}`);
  }
};

exports.rejectOrder = async (req, res) => {
  try {
    const orderId = req.params.id;

      await db.sequelize.transaction(async (transaction) => {
        const order = await Order.findByPk(orderId, {
          include: [OrderItem, Coupon, Customer],
          transaction,
          lock: transaction.LOCK.UPDATE
        });

      if (!order) {
        throw new Error("Pedido no encontrado.");
      }

      if (!isStoreOwnedRecord(req, order)) {
        throw new Error("No puedes rechazar pedidos de otra tienda.");
      }

      if (order.status !== "pendiente") {
        throw new Error("Solo puedes rechazar pedidos pendientes.");
      }

      for (const item of order.OrderItems) {
        const product = await Product.findByPk(item.ProductId, {
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        const variant = item.ProductVariantId
          ? await ProductVariant.findByPk(item.ProductVariantId, {
            transaction,
            lock: transaction.LOCK.UPDATE
          })
          : null;

        if (!product) {
          continue;
        }

        if (product.reservedStock < item.quantity) {
          throw new Error(`La reserva actual de ${product.name} es inconsistente.`);
        }

        if (item.ProductVariantId) {
          if (!variant || variant.ProductId !== product.id) {
            throw new Error(`La variante ${item.variantName || item.ProductVariantId} ya no existe.`);
          }

          if (variant.reservedStock < item.quantity) {
            throw new Error(`La reserva actual de ${product.name} (${item.variantName || variant.name}) es inconsistente.`);
          }

          await variant.update({
            reservedStock: variant.reservedStock - item.quantity
          }, { transaction });
        }

        await product.update({
          reservedStock: product.reservedStock - item.quantity
        }, { transaction });
      }

      await order.update({
        status: "rechazado",
        rejectedAt: new Date(),
        statusHistory: [
          ...(order.statusHistory || []),
          buildStatusEntry("rechazado", "Pedido rechazado desde el panel admin.")
        ]
      }, { transaction });

      if (order.Coupon && (Number(order.Coupon.usageCount) || 0) > 0) {
        await order.Coupon.update({
          usageCount: (Number(order.Coupon.usageCount) || 0) - 1
        }, { transaction });
      }

      if (order.Customer) {
        await order.Customer.update({
          totalOrders: Math.max((Number(order.Customer.totalOrders) || 1) - 1, 0),
          totalSpent: Math.max((Number(order.Customer.totalSpent) || 0) - (Number(order.total) || 0), 0),
          lastOrderAt: order.Customer.lastOrderAt
        }, { transaction });
      }
    });

    setFlash(req, "success", `Pedido #${orderId} rechazado correctamente.`);
    res.redirect("/admin/orders");
  } catch (error) {
    console.log(error);
    setFlash(req, "error", error.message || "No fue posible rechazar el pedido.");
    res.redirect(`/admin/orders/${req.params.id}`);
  }
};

exports.advanceOrderStatus = async (req, res) => {
  const { nextStatus } = req.body;

  if (!STATUS_LABELS[nextStatus]) {
    setFlash(req, "error", "Estado de pedido no valido.");
    return res.redirect(`/admin/orders/${req.params.id}`);
  }

  try {
    const order = await updateOrderStatus(
      req,
      req.params.id,
      nextStatus,
      `Pedido actualizado a ${STATUS_LABELS[nextStatus].toLowerCase()} desde el panel admin.`
    );

    setFlash(req, "success", `Pedido #${order.id} actualizado a ${STATUS_LABELS[nextStatus]}.`);
    res.redirect(`/admin/orders/${order.id}`);
  } catch (error) {
    setFlash(req, "error", error.message || "No fue posible actualizar el estado.");
    res.redirect(`/admin/orders/${req.params.id}`);
  }
};
