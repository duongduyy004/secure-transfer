const path = require('path');

const PORT = process.env.PORT || 3000;
const FILE_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ROOT_DIR = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

module.exports = {
    PORT,
    FILE_TTL_MS,
    CLEANUP_INTERVAL_MS,
    MAX_FILE_SIZE_BYTES,
    UPLOAD_DIR,
    PUBLIC_DIR
};
