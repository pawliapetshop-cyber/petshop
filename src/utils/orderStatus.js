const ORDER_TRANSITIONS = {
  pendiente: ["pago_validado", "aceptado", "rechazado"],
  pago_validado: ["aceptado"],
  aceptado: ["preparando"],
  preparando: ["enviado"],
  enviado: ["entregado"],
  entregado: [],
  rechazado: []
};

const STATUS_DATE_FIELDS = {
  pago_validado: "paymentValidatedAt",
  aceptado: "acceptedAt",
  preparando: "preparingAt",
  enviado: "shippedAt",
  entregado: "deliveredAt",
  rechazado: "rejectedAt"
};

const STATUS_LABELS = {
  pendiente: "Pendiente",
  pago_validado: "Pago validado",
  aceptado: "Aceptado",
  preparando: "Preparando",
  enviado: "Enviado",
  entregado: "Entregado",
  rechazado: "Rechazado"
};

const getNextStatuses = (status) => ORDER_TRANSITIONS[status] || [];

const canTransition = (fromStatus, toStatus) => getNextStatuses(fromStatus).includes(toStatus);

module.exports = {
  ORDER_TRANSITIONS,
  STATUS_DATE_FIELDS,
  STATUS_LABELS,
  getNextStatuses,
  canTransition
};
