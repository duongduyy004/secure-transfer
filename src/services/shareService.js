const fs = require('fs');
const path = require('path');
const { FILE_TTL_MS, UPLOAD_DIR } = require('../config/constants');

const fsp = fs.promises;

function cleanFilename(name) {
    return String(name || 'download.bin')
        .replace(/[\\/]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 255);
}

function getSharePaths(shareId) {
    return {
        encPath: path.join(UPLOAD_DIR, `${shareId}.enc`),
        metaPath: path.join(UPLOAD_DIR, `${shareId}.json`)
    };
}

async function ensureUploadDir() {
    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
}

async function fileExists(filePath) {
    try {
        await fsp.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function removeIfExists(filePath) {
    try {
        await fsp.unlink(filePath);
        return true;
    } catch (err) {
        if (err.code === 'ENOENT') {
            return false;
        }
        throw err;
    }
}

async function loadMeta(metaPath) {
    const raw = await fsp.readFile(metaPath, 'utf8');
    return JSON.parse(raw);
}

function isExpired(expiresAt) {
    return Date.now() > new Date(expiresAt).getTime();
}

async function cleanupExpiredFiles() {
    const entries = await fsp.readdir(UPLOAD_DIR);
    const now = Date.now();
    const deleted = [];

    for (const entry of entries) {
        if (!entry.endsWith('.enc')) {
            continue;
        }

        const shareId = entry.slice(0, -4);
        const { encPath, metaPath } = getSharePaths(shareId);

        let shouldDelete = false;
        if (await fileExists(metaPath)) {
            try {
                const meta = await loadMeta(metaPath);
                shouldDelete = now > new Date(meta.expiresAt).getTime();
            } catch {
                shouldDelete = true;
            }
        } else {
            const stats = await fsp.stat(encPath);
            shouldDelete = now - stats.mtimeMs > FILE_TTL_MS;
        }

        if (shouldDelete) {
            const deletedEnc = await removeIfExists(encPath);
            const deletedMeta = await removeIfExists(metaPath);
            if (deletedEnc || deletedMeta) {
                deleted.push(shareId);
            }
        }
    }

    return { deletedCount: deleted.length, deletedShareIds: deleted };
}

async function resolveActiveShare(shareId) {
    const { encPath, metaPath } = getSharePaths(shareId);

    if (!(await fileExists(encPath)) || !(await fileExists(metaPath))) {
        return { found: false };
    }

    let meta;
    try {
        meta = await loadMeta(metaPath);
    } catch {
        await removeIfExists(encPath);
        await removeIfExists(metaPath);
        return { found: false };
    }

    if (isExpired(meta.expiresAt)) {
        await removeIfExists(encPath);
        await removeIfExists(metaPath);
        return { found: false };
    }

    const stat = await fsp.stat(encPath);
    return { found: true, encPath, meta, stat };
}

function setDownloadHeaders(res, shareId, meta, stat) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${shareId}.enc"`);
    res.setHeader('X-Original-Name', meta.originalName || 'download.bin');
    res.setHeader('X-File-Size', String(meta.fileSize || 0));
    res.setHeader('X-Expires-At', meta.expiresAt);
}

async function writeShareMeta(shareId, meta) {
    const { metaPath } = getSharePaths(shareId);
    await fsp.writeFile(metaPath, JSON.stringify(meta), 'utf8');
}

module.exports = {
    cleanFilename,
    cleanupExpiredFiles,
    ensureUploadDir,
    removeIfExists,
    resolveActiveShare,
    setDownloadHeaders,
    writeShareMeta
};
