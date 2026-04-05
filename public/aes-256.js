(function initPureAES256(global) {
    'use strict';

    const KEY_BYTES = 32;

    function ensureCore() {
        if (!global.SimpleAES) {
            throw new Error('SimpleAES core is not loaded.');
        }
    }

    function encrypt(plainBytes, password, salt, iv) {
        ensureCore();
        const key = global.SimpleAES.deriveKey(password, salt, KEY_BYTES);
        return global.SimpleAES.cbcEncrypt(plainBytes, key, iv);
    }

    function decrypt(cipherBytes, password, salt, iv) {
        ensureCore();
        const key = global.SimpleAES.deriveKey(password, salt, KEY_BYTES);
        return global.SimpleAES.cbcDecrypt(cipherBytes, key, iv);
    }

    global.PureAES256 = {
        name: 'AES-256',
        keyBytes: KEY_BYTES,
        encrypt,
        decrypt
    };
})(window);
