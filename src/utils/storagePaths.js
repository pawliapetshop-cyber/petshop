const fs = require("fs");
const path = require("path");

const storageRoot = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.join(__dirname, "..", "public");

const uploadsDir = path.join(storageRoot, "uploads");
const pdfsDir = path.join(storageRoot, "pdfs");

const ensureStorageDirectories = () => {
  [storageRoot, uploadsDir, pdfsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

module.exports = {
  storageRoot,
  uploadsDir,
  pdfsDir,
  ensureStorageDirectories
};
