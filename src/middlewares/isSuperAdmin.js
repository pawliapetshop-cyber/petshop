module.exports = (req, res, next) => {
  const adminSession = req.session.admin || {};

  if (adminSession.role !== "superadmin") {
    req.session.flash = {
      type: "error",
      message: "No tienes permisos para acceder a esa seccion."
    };
    return res.redirect("/admin");
  }

  next();
};
