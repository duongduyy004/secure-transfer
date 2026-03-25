const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { MAX_FILE_SIZE_BYTES, UPLOAD_DIR } = require('../config/constants');

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Upload rate limit exceeded. Max 10 uploads/hour per IP.' }
});

const uploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, _file, cb) => {
        cb(null, `${uuidv4()}.enc`);
    }
});

const upload = multer({
    storage: uploadStorage,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES
    }
});

module.exports = {
    upload,
    uploadLimiter
};
