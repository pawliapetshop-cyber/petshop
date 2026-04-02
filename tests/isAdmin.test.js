const test = require("node:test");
const assert = require("node:assert/strict");
const isAdmin = require("../src/middlewares/isAdmin");

test("isAdmin redirige a login si no hay sesion admin", () => {
  const req = { session: {} };
  const res = {
    redirectPath: null,
    redirect(path) {
      this.redirectPath = path;
    }
  };

  isAdmin(req, res, () => {
    throw new Error("No deberia avanzar sin admin");
  });

  assert.equal(res.redirectPath, "/login");
});

test("isAdmin continua si existe admin en sesion", () => {
  const req = { session: { admin: 1 } };
  const res = {};
  let called = false;

  isAdmin(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});
