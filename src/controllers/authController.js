const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { Admin, Store } = require("../models");

const renderLogin = (res, options = {}) => {
  res.status(options.status || 200).render("admin/login", {
    layout: false,
    errorMessage: options.errorMessage || "",
    email: options.email || ""
  });
};

exports.loginForm = (req, res) => {
  renderLogin(res);
};

exports.login = async (req, res) => {
  const email = (req.body.email || "").trim();
  const password = req.body.password || "";

  if (!email || !password) {
    return renderLogin(res, {
      status: 400,
      errorMessage: "Debes ingresar correo y contrasena.",
      email
    });
  }

  const admin = await Admin.findOne({
    where: { email },
    include: Store
  });

  if (!admin) {
    return renderLogin(res, {
      status: 401,
      errorMessage: "Credenciales invalidas.",
      email
    });
  }

  const valid = await bcrypt.compare(password, admin.password);

  if (!valid) {
    return renderLogin(res, {
      status: 401,
      errorMessage: "Credenciales invalidas.",
      email
    });
  }

  req.session.regenerate((error) => {
    if (error) {
      return renderLogin(res, {
        status: 500,
        errorMessage: "No pudimos iniciar sesion. Intenta de nuevo.",
        email
      });
    }

    req.session.admin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      StoreId: admin.StoreId || null,
      storeName: admin.Store?.name || null,
      storeSlug: admin.Store?.slug || null,
      storeLogo: admin.Store?.logo || null,
      primaryColor: admin.Store?.primaryColor || "#198754",
      secondaryColor: admin.Store?.secondaryColor || "#212529"
    };
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.redirect("/admin");
  });
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
};
