const { createApp } = require('./src/app');
const { CLEANUP_INTERVAL_MS, PORT } = require('./src/config/constants');
const { cleanupExpiredFiles, ensureUploadDir } = require('./src/services/shareService');

async function bootstrap() {
    try {
        await ensureUploadDir();
    } catch (err) {
        console.error('Failed to ensure uploads directory:', err);
        process.exit(1);
    }

    const app = createApp();

    setInterval(() => {
        cleanupExpiredFiles().catch((err) => {
            console.error('Scheduled cleanup error:', err);
        });
    }, CLEANUP_INTERVAL_MS).unref();

    app.listen(PORT, () => {
        console.log(`Secure transfer server is running on http://localhost:${PORT}`);
    });
}

bootstrap();
