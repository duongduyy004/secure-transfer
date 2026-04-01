const express = require('express');
const helmet = require('helmet');
const path = require('path');
const { PUBLIC_DIR } = require('./config/constants');
const apiRouter = require('./routes/api');

function createApp() {
    const app = express();

    app.use(helmet({
        crossOriginResourcePolicy: false
    }));
    app.use(express.json({ limit: '100mb' }));
    app.use(express.static(PUBLIC_DIR));

    app.get('/favicon.ico', (_req, res) => {
        // Avoid noisy 404s when browser requests favicon by default.
        res.status(204).end();
    });

    // Make frontend assets reachable even when app is served from nested paths.
    app.get(/\/styles\.css$/, (_req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'styles.css'));
    });

    app.get(/\/app\.js$/, (_req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'app.js'));
    });

    app.use('/api', apiRouter);

    app.get('/qrcode', (req, res) => {
        const query = new URLSearchParams(req.query || {}).toString();
        const suffix = query ? `?${query}` : '';
        res.redirect(307, `/api/qrcode${suffix}`);
    });

    app.get(['/', '/receive/:shareId'], (_req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });

    app.use((err, _req, res, _next) => {
        if (err?.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'File too large. Maximum upload size is 100MB.' });
        }

        if (err?.type === 'entity.too.large') {
            return res.status(413).json({ error: 'Payload too large for this endpoint.' });
        }

        if (err) {
            console.error('Unhandled app error:', err);
            return res.status(500).json({ error: 'Internal server error.' });
        }

        return _next();
    });

    return app;
}

module.exports = {
    createApp
};
