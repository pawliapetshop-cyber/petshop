const DEFAULT_ACTIVE_CITIES = [
  { key: "cali", label: "Cali" }
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

const normalizeCityEntry = (city = {}, index = 0) => {
  const normalizedKey = normalizeCityKey(city.key || city.label || `city-${index + 1}`);
  const parsedCost = Number(city.cost);

  return {
    key: normalizedKey,
    label: (city.label || city.key || `Ciudad ${index + 1}`).toString().trim(),
    isActive: city.isActive !== undefined ? Boolean(city.isActive) : true,
    chargeShipping: city.chargeShipping !== undefined ? Boolean(city.chargeShipping) : true,
    cost: Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : DEFAULT_SHIPPING_COST,
    allowCashOnDelivery: city.allowCashOnDelivery !== undefined
      ? Boolean(city.allowCashOnDelivery)
      : normalizedKey === "cali"
  };
};

const buildDefaultShippingConfig = () => ({
  cities: DEFAULT_ACTIVE_CITIES.map((city, index) => ({
    key: city.key,
    label: city.label,
    isActive: true,
    chargeShipping: true,
    cost: DEFAULT_SHIPPING_COST,
    allowCashOnDelivery: city.key === "cali"
  }))
});

const mergeShippingConfig = (config = {}) => {
  const sourceCities = Array.isArray(config?.cities) ? config.cities : [];
  if (sourceCities.length === 0) {
    return buildDefaultShippingConfig();
  }

  const seenKeys = new Set();
  const cities = [];

  sourceCities.forEach((city, index) => {
    const normalized = normalizeCityEntry(city, index);
    if (!normalized.key || seenKeys.has(normalized.key)) {
      return;
    }

    seenKeys.add(normalized.key);
    cities.push(normalized);
  });

  return {
    cities: cities.length > 0 ? cities : buildDefaultShippingConfig().cities
  };
};

const getShippingCities = (store, options = {}) => {
  const includeInactive = options.includeInactive !== false;
  const cities = getStoreShippingConfig(store).cities;
  return includeInactive ? cities : cities.filter((city) => city.isActive !== false);
};

const getStoreShippingConfig = (store) => mergeShippingConfig(store?.shippingConfig || {});

const findShippingCityConfig = (store, cityValue) => {
  const normalizedKey = normalizeCityKey(cityValue);
  return getStoreShippingConfig(store).cities.find((city) => city.key === normalizedKey && city.isActive !== false) || null;
};

const isValidShippingCity = (store, cityValue) => Boolean(findShippingCityConfig(store, cityValue));

module.exports = {
  DEFAULT_SHIPPING_COST,
  DEFAULT_ACTIVE_CITIES,
  normalizeCityKey,
  normalizeCityEntry,
  buildDefaultShippingConfig,
  mergeShippingConfig,
  getShippingCities,
  getStoreShippingConfig,
  findShippingCityConfig,
  isValidShippingCity
};
