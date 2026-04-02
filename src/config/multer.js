const multer = require("multer");
const path = require("path");
const { uploadsDir, ensureStorageDirectories } = require("../utils/storagePaths");

ensureStorageDirectories();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

module.exports = upload;
