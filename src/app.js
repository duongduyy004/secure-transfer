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
    app.use(express.json({ limit: '1mb' }));
    app.use(express.static(PUBLIC_DIR));

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

    return app;
}

module.exports = {
    createApp
};
