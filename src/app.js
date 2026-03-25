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

    app.use('/api', apiRouter);

    app.get(['/', '/receive/:shareId'], (_req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });

    return app;
}

module.exports = {
    createApp
};
