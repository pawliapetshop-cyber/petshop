const { Store, SideAd } = require("../models");

module.exports = async (req, res, next) => {
  const slug = (req.params.storeSlug || "").trim().toLowerCase();

  if (!slug) {
    return res.status(404).render("errors/notFound", {
      layout: "layout",
      title: "Tienda no encontrada",
      message: "No encontramos la tienda que intentaste abrir."
    });
  }

  const store = await Store.findOne({
    where: {
      slug,
      isActive: true
    }
  });

  if (!store) {
    return res.status(404).render("errors/notFound", {
      layout: "layout",
      title: "Tienda no encontrada",
      message: "La tienda solicitada no existe o no se encuentra activa."
    });
  }

  req.store = store;
  res.locals.store = store;
  const sideAds = await SideAd.findAll({
    where: {
      StoreId: store.id,
      isActive: true
    },
    order: [["createdAt", "DESC"]]
  });
  res.locals.sideAds = {
    left: sideAds.find((ad) => ad.position === "left") || null,
    right: sideAds.find((ad) => ad.position === "right") || null
  };
  next();
};
