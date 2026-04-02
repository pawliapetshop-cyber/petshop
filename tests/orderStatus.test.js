const test = require("node:test");
const assert = require("node:assert/strict");
const {
  STATUS_LABELS,
  STATUS_DATE_FIELDS,
  getNextStatuses,
  canTransition
} = require("../src/utils/orderStatus");

test("getNextStatuses devuelve la siguiente transicion valida", () => {
  assert.deepEqual(getNextStatuses("aceptado"), ["preparando"]);
  assert.deepEqual(getNextStatuses("enviado"), ["entregado"]);
  assert.deepEqual(getNextStatuses("rechazado"), []);
});

test("canTransition valida correctamente el flujo de pedido", () => {
  assert.equal(canTransition("pendiente", "aceptado"), true);
  assert.equal(canTransition("aceptado", "entregado"), false);
  assert.equal(canTransition("preparando", "enviado"), true);
});

test("los estados visibles tienen etiquetas y fechas esperadas", () => {
  assert.equal(STATUS_LABELS.preparando, "Preparando");
  assert.equal(STATUS_LABELS.entregado, "Entregado");
  assert.equal(STATUS_DATE_FIELDS.enviado, "shippedAt");
});
