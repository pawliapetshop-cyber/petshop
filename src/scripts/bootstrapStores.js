require("dotenv").config();
const db = require("../models");

(async () => {
  try {
    await db.sequelize.sync();

    let pawliaStore = await db.Store.findOne({
      where: { slug: "pawlia" }
    });

    if (!pawliaStore) {
      pawliaStore = await db.Store.create({
        name: "Pawlia",
        slug: "pawlia",
        logo: "logo.jpeg",
        contactEmail: process.env.ADMIN_EMAIL || "admin@pawlia.com"
      });
    }

    await db.Category.update(
      { StoreId: pawliaStore.id },
      { where: { StoreId: null } }
    );

    await db.Product.update(
      { StoreId: pawliaStore.id },
      { where: { StoreId: null } }
    );

    await db.Order.update(
      { StoreId: pawliaStore.id },
      { where: { StoreId: null } }
    );

    await db.Admin.update(
      { StoreId: pawliaStore.id, role: "superadmin" },
      { where: { StoreId: null } }
    );

    console.log("Tienda base Pawlia preparada y datos existentes enlazados.");
    process.exit(0);
  } catch (error) {
    console.error("Error preparando tiendas:", error);
    process.exit(1);
  }
})();
