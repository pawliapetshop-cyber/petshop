require("dotenv").config();
const bcrypt = require("bcrypt");
const db = require("./src/models");

(async () => {
  try {
    await db.sequelize.sync();

    let store = await db.Store.findOne({
      where: { slug: "pawlia" }
    });

    if (!store) {
      store = await db.Store.create({
        name: "Pawlia",
        slug: "pawlia",
        logo: "logo.jpeg",
        contactEmail: process.env.ADMIN_EMAIL || "admin@pawlia.com"
      });
    }

    const email = process.env.ADMIN_EMAIL || "admin@pawlia.com";
    const plainPassword = process.env.ADMIN_PASSWORD || "123456";

    const existingAdmin = await db.Admin.findOne({ where: { email } });
    if (existingAdmin) {
      console.log("Admin ya existe para ese correo.");
      process.exit(0);
    }

    const hash = await bcrypt.hash(plainPassword, 10);

    await db.Admin.create({
      email,
      password: hash,
      role: "superadmin",
      StoreId: store.id
    });

    console.log("Admin creado correctamente");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
})();
