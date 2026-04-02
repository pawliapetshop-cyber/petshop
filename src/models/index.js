// src/models/index.js
const Sequelize = require("sequelize");
const sequelize = require("../config/db");

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// modelos
db.Store = require("./Store")(sequelize, Sequelize);
db.Category = require("./Category")(sequelize, Sequelize);
db.Product = require("./Product")(sequelize, Sequelize);
db.Customer = require("./Customer")(sequelize, Sequelize);
db.Banner = require("./Banner")(sequelize, Sequelize);
db.SideAd = require("./SideAd")(sequelize, Sequelize);
db.Coupon = require("./Coupon")(sequelize, Sequelize);
db.Review = require("./Review")(sequelize, Sequelize);
db.ReviewImage = require("./ReviewImage")(sequelize, Sequelize);
db.ProductVariant = require("./ProductVariants")(sequelize, Sequelize);
db.Admin = require("./Admin")(sequelize, Sequelize);
db.Order = require("./Order")(sequelize, Sequelize);
db.OrderItem = require("./OrderItem")(sequelize, Sequelize);

// relaciones
db.Store.hasMany(db.Category);
db.Category.belongsTo(db.Store);

db.Store.hasMany(db.Product);
db.Product.belongsTo(db.Store);

db.Store.hasMany(db.Customer);
db.Customer.belongsTo(db.Store);

db.Store.hasMany(db.Banner);
db.Banner.belongsTo(db.Store);

db.Store.hasMany(db.SideAd);
db.SideAd.belongsTo(db.Store);

db.Store.hasMany(db.Coupon);
db.Coupon.belongsTo(db.Store);

db.Store.hasMany(db.Review);
db.Review.belongsTo(db.Store);

db.Store.hasMany(db.Order);
db.Order.belongsTo(db.Store);

db.Store.hasMany(db.Admin);
db.Admin.belongsTo(db.Store);

db.Category.hasMany(db.Product);
db.Product.belongsTo(db.Category);
db.ProductImage = require("./ProductImage")(sequelize, Sequelize);

// 🔥 RELACIONES
db.Product.hasMany(db.ProductImage);
db.ProductImage.belongsTo(db.Product);

db.Product.hasMany(db.ProductVariant, {
  onDelete: "CASCADE",
  hooks: true
});
db.ProductVariant.belongsTo(db.Product);

db.Product.hasMany(db.Banner);
db.Banner.belongsTo(db.Product);

db.Product.hasMany(db.Coupon);
db.Coupon.belongsTo(db.Product);

db.Product.hasMany(db.Review);
db.Review.belongsTo(db.Product);

// ORDENES

db.Order.hasMany(db.OrderItem);
db.OrderItem.belongsTo(db.Order);

db.Customer.hasMany(db.Order);
db.Order.belongsTo(db.Customer);

db.Coupon.hasMany(db.Order);
db.Order.belongsTo(db.Coupon);

db.Order.hasMany(db.Review);
db.Review.belongsTo(db.Order);

db.Product.hasMany(db.OrderItem);
db.OrderItem.belongsTo(db.Product);

db.Review.hasMany(db.ReviewImage, {
  onDelete: "CASCADE",
  hooks: true
});
db.ReviewImage.belongsTo(db.Review);




module.exports = db;
