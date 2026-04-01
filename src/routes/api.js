const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { FILE_TTL_MS } = require('../config/constants');
const { upload, uploadLimiter } = require('../middleware/upload');
const {
    cleanFilename,
    cleanupExpiredFiles,
    removeIfExists,
    resolveActiveShare,
    setDownloadHeaders,
    writeShareMeta
} = require('../services/shareService');

const router = express.Router();
const ALLOWED_CIPHER_TYPES = new Set(['AES-128', 'AES-192', 'AES-256']);

router.post('/upload', uploadLimiter, upload.single('encfile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Missing file field 'encfile'." });
        }

        if (!req.body.meta) {
            await removeIfExists(req.file.path);
            return res.status(400).json({ error: "Missing field 'meta'." });
        }

        let parsedMeta;
        try {
            parsedMeta = JSON.parse(req.body.meta);
        } catch {
            await removeIfExists(req.file.path);
            return res.status(400).json({ error: 'Invalid JSON in meta field.' });
        }

        const originalName = cleanFilename(parsedMeta.originalName);
        const fileSize = Number(parsedMeta.fileSize);
        const cipherType = String(parsedMeta.cipherType || '').trim();

        if (!Number.isFinite(fileSize) || fileSize < 0) {
            await removeIfExists(req.file.path);
            return res.status(400).json({ error: 'Invalid meta.fileSize value.' });
        }

        if (!ALLOWED_CIPHER_TYPES.has(cipherType)) {
            await removeIfExists(req.file.path);
            return res.status(400).json({ error: 'Invalid meta.cipherType value.' });
        }

        const shareId = path.basename(req.file.filename, '.enc');
        const expiresAt = new Date(Date.now() + FILE_TTL_MS).toISOString();

        const meta = {
            shareId,
            originalName,
            fileSize,
            cipherType,
            expiresAt,
            createdAt: new Date().toISOString()
        };

        await writeShareMeta(shareId, meta);

        return res.status(200).json({ shareId, expiresAt });
    } catch (err) {
        console.error('Upload error:', err);
        if (req.file && req.file.path) {
            await removeIfExists(req.file.path);
        }
        return res.status(500).json({ error: 'Failed to upload encrypted file.' });
    }
});

router.get('/download/:shareId', async (req, res) => {
    try {
        const shareId = req.params.shareId;
        const share = await resolveActiveShare(shareId);
        if (!share.found) {
            return res.status(404).json({ error: 'File not found or expired.' });
        }

        setDownloadHeaders(res, shareId, share.meta, share.stat);

        const stream = fs.createReadStream(share.encPath);
        stream.on('error', (err) => {
            console.error('Download stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream file.' });
            } else {
                res.destroy(err);
            }
        });
        stream.pipe(res);
    } catch (err) {
        console.error('Download error:', err);
        return res.status(500).json({ error: 'Failed to download file.' });
    }
});

router.head('/download/:shareId', async (req, res) => {
    try {
        const shareId = req.params.shareId;
        const share = await resolveActiveShare(shareId);
        if (!share.found) {
            return res.status(404).end();
        }

        setDownloadHeaders(res, shareId, share.meta, share.stat);
        return res.status(200).end();
    } catch (err) {
        console.error('Download HEAD error:', err);
        return res.status(500).end();
    }
});

router.delete('/cleanup', async (req, res) => {
    try {
        const token = process.env.CLEANUP_TOKEN;
        const localIps = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
        const reqIp = req.ip || '';
        const providedToken = req.get('x-internal-token');

        const isAuthorized = token
            ? providedToken && providedToken === token
            : localIps.has(reqIp);

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const result = await cleanupExpiredFiles();
        return res.status(200).json({
            deletedCount: result.deletedCount,
            deletedShareIds: result.deletedShareIds,
            now: new Date().toISOString()
        });
    } catch (err) {
        console.error('Cleanup error:', err);
        return res.status(500).json({ error: 'Cleanup failed.' });
    }
});

router.get('/qrcode', async (req, res) => {
    try {
        const text = String(req.query.text || '').trim();
        if (!text) {
            return res.status(400).json({ error: 'Missing query param: text' });
        }

        const svg = await QRCode.toString(text, {
            type: 'svg',
            width: 256,
            margin: 1,
            errorCorrectionLevel: 'M'
        });

        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        return res.status(200).send(svg);
    } catch (err) {
        console.error('QR code error:', err);
        return res.status(500).json({ error: 'Failed to generate QR code.' });
    }
});

module.exports = router;
