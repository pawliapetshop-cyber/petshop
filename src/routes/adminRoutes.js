const express = require("express");
const router = express.Router();

const admin = require("../controllers/adminController");
const isAdmin = require("../middlewares/isAdmin");
const isSuperAdmin = require("../middlewares/isSuperAdmin");
const upload = require("../config/multer");

router.use("/admin", isAdmin);

const storeAssetsUpload = upload.fields([
  { name: "storeLogo", maxCount: 1 },
  { name: "backgroundImage", maxCount: 1 },
  { name: "popupImage", maxCount: 1 },
  { name: "promoImage1", maxCount: 1 },
  { name: "promoImage2", maxCount: 1 }
]);

router.get("/admin", admin.dashboard);
router.get("/admin/reports", admin.reports);
router.get("/admin/reports/export.csv", admin.exportReportsCsv);
router.get("/admin/shipping-settings", admin.shippingSettings);
router.post("/admin/shipping-settings", admin.updateShippingSettings);
router.get("/admin/notifications", admin.notificationsSettings);
router.post("/admin/notifications", admin.updateNotificationsSettings);
router.post("/admin/notifications/test", admin.sendTestNotificationEmail);
router.get("/admin/customers", admin.customers);
router.get("/admin/customers/export.csv", admin.exportCustomersCsv);
router.get("/admin/customers/:id", admin.customerDetail);
router.post("/admin/customers/:id/follow-up", admin.updateCustomerFollowUp);

router.get("/admin/stores", isSuperAdmin, admin.stores);
router.post("/admin/stores/create", isSuperAdmin, storeAssetsUpload, admin.createStore);
router.post("/admin/stores/:id/update", isSuperAdmin, storeAssetsUpload, admin.updateStore);

router.get("/admin/admin-users", isSuperAdmin, admin.adminUsers);
router.post("/admin/admin-users/create", isSuperAdmin, admin.createAdminUser);
router.post("/admin/admin-users/:id/update", isSuperAdmin, admin.updateAdminUser);
router.post("/admin/admin-users/:id/delete", isSuperAdmin, admin.deleteAdminUser);

router.get("/admin/banners", admin.banners);
router.post("/admin/banners/create", upload.single("bannerImage"), admin.createBanner);
router.post("/admin/banners/:id/update", upload.single("bannerImage"), admin.updateBanner);
router.post("/admin/banners/:id/toggle-status", admin.toggleBannerStatus);
router.post("/admin/banners/:id/delete", admin.deleteBanner);
router.get("/admin/side-ads", admin.sideAds);
router.post("/admin/side-ads/:position", upload.single("adImage"), admin.updateSideAd);

router.get("/admin/coupons", admin.coupons);
router.post("/admin/coupons/create", admin.createCoupon);
router.post("/admin/coupons/:id/update", admin.updateCoupon);
router.post("/admin/coupons/:id/toggle-status", admin.toggleCouponStatus);
router.post("/admin/coupons/:id/delete", admin.deleteCoupon);

router.get("/admin/reviews", admin.reviews);
router.post("/admin/reviews/:id/approve", admin.approveReview);
router.post("/admin/reviews/:id/reject", admin.rejectReview);

router.post("/admin/images/main/:id", admin.setMainImage);
router.get("/admin/products/edit/:id", admin.editProductForm);
router.post("/admin/images/delete/:id", admin.deleteImage);
router.post("/admin/products/edit/:id", upload.array("images", 5), admin.updateProduct);

router.get("/admin/products", admin.products);
router.get("/admin/products/create", admin.createProductForm);
router.post("/admin/products/create", upload.array("images", 5), admin.createProduct);
router.post("/admin/products/delete/:id", admin.deleteProductPost);
router.post("/admin/products/toggle-status/:id", admin.toggleProductStatus);
router.post("/admin/variants/:id/stock", admin.updateVariantStockQuick);

router.get("/admin/categories", admin.categories);
router.post("/admin/categories/create", admin.createCategory);
router.post("/admin/categories/delete/:id", admin.deleteCategoryPost);

router.get("/admin/orders", admin.orders);
router.get("/admin/orders/:id", admin.orderDetail);
router.post("/admin/orders/:id/notes", admin.saveOrderNotes);
router.post("/admin/orders/:id/payment-proof", upload.single("paymentProof"), admin.savePaymentProof);
router.post("/admin/orders/:id/validate-payment", admin.validatePayment);
router.post("/admin/orders/:id/status", admin.advanceOrderStatus);
router.post("/admin/orders/accept/:id", admin.acceptOrder);
router.post("/admin/orders/reject/:id", admin.rejectOrder);

module.exports = router;
