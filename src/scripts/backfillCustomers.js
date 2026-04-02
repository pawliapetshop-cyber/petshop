require("dotenv").config();

const db = require("../models");

const NON_REJECTED_STATUSES = [
  "pendiente",
  "pago_validado",
  "aceptado",
  "preparando",
  "enviado",
  "entregado"
];

const normalizeValue = (value) => (value || "").toString().trim();
const normalizeEmail = (value) => normalizeValue(value).toLowerCase();

const getCustomerKey = (order) => {
  const document = normalizeValue(order.document);
  const email = normalizeEmail(order.email);

  if (document) {
    return `document:${document}`;
  }

  if (email) {
    return `email:${email}`;
  }

  return null;
};

const buildCustomerPayload = (order) => ({
  name: normalizeValue(order.name) || "Cliente",
  document: normalizeValue(order.document) || `SIN-DOC-${order.StoreId}-${order.id}`,
  email: normalizeEmail(order.email) || null,
  phone: normalizeValue(order.phone) || "Sin telefono",
  city: normalizeValue(order.city) || null,
  address: normalizeValue(order.address) || null,
  StoreId: order.StoreId
});

async function backfillCustomers() {
  await db.sequelize.authenticate();

  const orders = await db.Order.findAll({
    where: {
      CustomerId: null
    },
    order: [["StoreId", "ASC"], ["createdAt", "ASC"], ["id", "ASC"]]
  });

  if (orders.length === 0) {
    console.log("No hay pedidos sin cliente para reconstruir.");
    return;
  }

  let createdCustomers = 0;
  let linkedOrders = 0;

  await db.sequelize.transaction(async (transaction) => {
    const customerCache = new Map();

    for (const order of orders) {
      const customerKey = getCustomerKey(order) || `fallback:${order.StoreId}:${order.id}`;
      const cacheKey = `${order.StoreId}:${customerKey}`;

      let customer = customerCache.get(cacheKey);

      if (!customer) {
        const document = normalizeValue(order.document);
        const email = normalizeEmail(order.email);

        customer = await db.Customer.findOne({
          where: document
            ? { StoreId: order.StoreId, document }
            : email
              ? { StoreId: order.StoreId, email }
              : { id: null },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (!customer) {
          customer = await db.Customer.create(buildCustomerPayload(order), { transaction });
          createdCustomers += 1;
        } else {
          await customer.update({
            name: normalizeValue(order.name) || customer.name,
            email: normalizeEmail(order.email) || customer.email || null,
            phone: normalizeValue(order.phone) || customer.phone,
            city: normalizeValue(order.city) || customer.city || null,
            address: normalizeValue(order.address) || customer.address || null
          }, { transaction });
        }

        customerCache.set(cacheKey, customer);
      }

      await order.update({
        CustomerId: customer.id
      }, { transaction });

      linkedOrders += 1;
    }

    const touchedCustomerIds = [...new Set([...customerCache.values()].map((customer) => customer.id))];

    for (const customerId of touchedCustomerIds) {
      const customerOrders = await db.Order.findAll({
        where: {
          CustomerId: customerId
        },
        order: [["createdAt", "DESC"]],
        transaction
      });

      const activeOrders = customerOrders.filter((order) => NON_REJECTED_STATUSES.includes(order.status));
      const lastOrder = activeOrders[0] || customerOrders[0] || null;

      await db.Customer.update({
        totalOrders: activeOrders.length,
        totalSpent: activeOrders.reduce((total, order) => total + (Number(order.total) || 0), 0),
        lastOrderAt: lastOrder?.createdAt || null
      }, {
        where: { id: customerId },
        transaction
      });
    }
  });

  console.log(`Clientes creados: ${createdCustomers}`);
  console.log(`Pedidos enlazados: ${linkedOrders}`);
}

backfillCustomers()
  .catch((error) => {
    console.error("No se pudo reconstruir el historial de clientes.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
