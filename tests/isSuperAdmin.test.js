const test = require("node:test");
const assert = require("node:assert/strict");
const isSuperAdmin = require("../src/middlewares/isSuperAdmin");

test("isSuperAdmin redirige al dashboard si el usuario no es superadmin", () => {
  const req = { session: { admin: { role: "store_admin" } } };
  const res = {
    redirectPath: null,
    redirect(path) {
      this.redirectPath = path;
    }
  };

  isSuperAdmin(req, res, () => {
    throw new Error("No deberia avanzar un admin de tienda");
  });

  assert.equal(res.redirectPath, "/admin");
  assert.equal(req.session.flash?.type, "error");
});

test("isSuperAdmin continua si el usuario es superadmin", () => {
  const req = { session: { admin: { role: "superadmin" } } };
  const res = {};
  let called = false;

  isSuperAdmin(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});
