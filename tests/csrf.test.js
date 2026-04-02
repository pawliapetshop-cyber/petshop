const test = require("node:test");
const assert = require("node:assert/strict");
const { ensureCsrfToken, verifyCsrfToken } = require("../src/middlewares/csrf");

test("ensureCsrfToken crea token y lo expone en locals", () => {
  const req = { session: {} };
  const res = { locals: {} };
  let called = false;

  ensureCsrfToken(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.ok(req.session.csrfToken);
  assert.equal(res.locals.csrfToken, req.session.csrfToken);
});

test("verifyCsrfToken deja pasar POST con token valido", () => {
  const req = {
    method: "POST",
    body: { _csrf: "abc123" },
    session: { csrfToken: "abc123" }
  };
  const res = {};
  let called = false;

  verifyCsrfToken(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});

test("verifyCsrfToken bloquea POST con token invalido", () => {
  const req = {
    method: "POST",
    body: { _csrf: "bad-token" },
    session: { csrfToken: "good-token" },
    get: () => "/admin/products"
  };

  const result = {
    statusCode: null,
    redirectPath: null
  };

  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    redirect(path) {
      result.redirectPath = path;
      return this;
    }
  };

  verifyCsrfToken(req, res, () => {
    throw new Error("No deberia llegar a next()");
  });

  assert.equal(result.statusCode, 403);
  assert.equal(result.redirectPath, "/admin/products");
  assert.equal(req.session.flash.type, "error");
});
