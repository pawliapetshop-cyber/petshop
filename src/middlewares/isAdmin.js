// src/middlewares/isAdmin.js
module.exports = (req, res, next) => {
  const adminSession = req.session.admin;
  const hasAdmin =
    Boolean(adminSession) &&
    (typeof adminSession === "number" || typeof adminSession === "string" || Boolean(adminSession.id));

  if (!hasAdmin) {
    return res.redirect("/login");
  }
  next();
};
