const express = require("express");
const path = require("path");
const session = require("express-session");
require("dotenv").config();
const expressLayouts = require("express-ejs-layouts");
const { ensureCsrfToken, verifyCsrfToken } = require("./middlewares/csrf");
const { uploadsDir, pdfsDir, ensureStorageDirectories } = require("./utils/storagePaths");

const shopRoutes = require("./routes/shopRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const db = require("./models");

const app = express();
ensureStorageDirectories();
app.set("trust proxy", 1);

db.sequelize
  .authenticate()
  .then(() => console.log("Base de datos conectada"))
  .catch((err) => console.log(err));

app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "dev_session_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
}));

app.use(ensureCsrfToken);

app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use(verifyCsrfToken);

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));
app.use("/pdfs", express.static(pdfsDir));
app.use(expressLayouts);
app.set("layout", "layout");

app.use((req, res, next) => {
  res.locals.cart = req.session.cart || [];
  res.locals.currentSearch = typeof req.query.search === "string" ? req.query.search : "";
  res.locals.adminSession = req.session.admin || null;
  res.locals.currentPath = req.path;
  next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(authRoutes);
app.use(adminRoutes);
app.use("/", shopRoutes);

app.use((req, res) => {
  res.status(404).render("errors/notFound", {
    layout: "layout",
    title: "Pagina no encontrada",
    message: "La ruta que intentaste abrir no existe o ya no esta disponible."
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  const isAdminRoute = req.originalUrl.startsWith("/admin");

  res.status(err.status || 500).render("errors/serverError", {
    layout: isAdminRoute ? "admin/layout" : "layout",
    title: "Ocurrio un error",
    message: "No pudimos completar la accion. Intenta de nuevo en un momento."
  });
});

const PORT = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`);
  });
}

module.exports = app;
