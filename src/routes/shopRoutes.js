const express = require("express");
const router = express.Router();
const shopController = require("../controllers/shopController");
const loadStore = require("../middlewares/loadStore");
const upload = require("../config/multer");

router.get("/tienda", shopController.redirectToDefaultStore);

router.get("/s/:storeSlug", loadStore, shopController.shop);
router.get("/s/:storeSlug/contacto", loadStore, shopController.contactPage);
router.get("/s/:storeSlug/producto/:id", loadStore, shopController.productDetail);
router.post("/s/:storeSlug/producto/:id/reviews", loadStore, upload.array("reviewImages", 3), shopController.createReview);
router.post("/s/:storeSlug/cart/add", loadStore, shopController.addToCart);
router.get("/s/:storeSlug/cart", loadStore, shopController.viewCart);
router.post("/s/:storeSlug/cart/update/:id", loadStore, shopController.updateCartItem);
router.get("/s/:storeSlug/cart/remove/:id", loadStore, shopController.removeFromCart);
router.get("/s/:storeSlug/checkout", loadStore, shopController.checkout);
router.post("/s/:storeSlug/checkout", loadStore, shopController.processCheckout);

module.exports = router;
