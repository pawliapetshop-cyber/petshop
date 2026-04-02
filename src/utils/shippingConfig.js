const MAIN_COLOMBIA_CITIES = [
  { key: "armenia", label: "Armenia" },
  { key: "barranquilla", label: "Barranquilla" },
  { key: "bogota", label: "Bogota" },
  { key: "bucaramanga", label: "Bucaramanga" },
  { key: "cali", label: "Cali" },
  { key: "cartagena", label: "Cartagena" },
  { key: "cucuta", label: "Cucuta" },
  { key: "ibague", label: "Ibague" },
  { key: "manizales", label: "Manizales" },
  { key: "medellin", label: "Medellin" },
  { key: "monteria", label: "Monteria" },
  { key: "neiva", label: "Neiva" },
  { key: "pasto", label: "Pasto" },
  { key: "pereira", label: "Pereira" },
  { key: "popayan", label: "Popayan" },
  { key: "santa-marta", label: "Santa Marta" },
  { key: "sincelejo", label: "Sincelejo" },
  { key: "tunja", label: "Tunja" },
  { key: "valledupar", label: "Valledupar" },
  { key: "villavicencio", label: "Villavicencio" }
];

const DEFAULT_SHIPPING_COST = 12000;

const normalizeCityKey = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildDefaultShippingConfig = () => ({
  cities: MAIN_COLOMBIA_CITIES.map((city) => ({
    key: city.key,
    label: city.label,
    chargeShipping: true,
    cost: DEFAULT_SHIPPING_COST,
    allowCashOnDelivery: city.key === "cali"
  }))
});

const mergeShippingConfig = (config = {}) => {
  const sourceCities = Array.isArray(config?.cities) ? config.cities : [];
  const byKey = new Map(
    sourceCities
      .filter((city) => city?.key)
      .map((city) => [normalizeCityKey(city.key), city])
  );

  return {
    cities: MAIN_COLOMBIA_CITIES.map((city) => {
      const existing = byKey.get(city.key) || {};
      const cost = Number(existing.cost);

      return {
        key: city.key,
        label: city.label,
        chargeShipping: existing.chargeShipping !== undefined ? Boolean(existing.chargeShipping) : true,
        cost: Number.isFinite(cost) && cost >= 0 ? cost : DEFAULT_SHIPPING_COST,
        allowCashOnDelivery: existing.allowCashOnDelivery !== undefined
          ? Boolean(existing.allowCashOnDelivery)
          : city.key === "cali"
      };
    })
  };
};

const getShippingCities = () => MAIN_COLOMBIA_CITIES.map((city) => ({ ...city }));

const getStoreShippingConfig = (store) => mergeShippingConfig(store?.shippingConfig || {});

const findShippingCityConfig = (store, cityValue) => {
  const normalizedKey = normalizeCityKey(cityValue);
  return getStoreShippingConfig(store).cities.find((city) => city.key === normalizedKey) || null;
};

const isValidShippingCity = (cityValue) => Boolean(findShippingCityConfig({ shippingConfig: buildDefaultShippingConfig() }, cityValue));

module.exports = {
  DEFAULT_SHIPPING_COST,
  MAIN_COLOMBIA_CITIES,
  normalizeCityKey,
  buildDefaultShippingConfig,
  mergeShippingConfig,
  getShippingCities,
  getStoreShippingConfig,
  findShippingCityConfig,
  isValidShippingCity
};
