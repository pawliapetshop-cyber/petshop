require("dotenv").config();
const db = require("../models");

(async () => {
  try {
    await db.sequelize.sync({ alter: true });
    console.log("Base de datos sincronizada correctamente.");
    process.exit(0);
  } catch (error) {
    console.error("Error al sincronizar la base de datos:", error);
    process.exit(1);
  }
})();
