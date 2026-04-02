const crypto = require("crypto");

const ensureCsrfToken = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
};

const verifyCsrfToken = (req, res, next) => {
  if (req.method !== "POST") {
    return next();
  }

  const submittedToken =
    req.body?._csrf ||
    req.query?._csrf ||
    req.headers["x-csrf-token"];

  if (submittedToken !== req.session.csrfToken) {
    req.session.flash = {
      type: "error",
      message: "La sesion del formulario expiro. Intenta de nuevo."
    };

    return res.status(403).redirect(req.get("Referer") || "/");
  }

  next();
};

module.exports = {
  ensureCsrfToken,
  verifyCsrfToken
};
