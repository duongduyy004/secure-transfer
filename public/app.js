const senderPanel = document.getElementById('senderPanel');
const receiverPanel = document.getElementById('receiverPanel');
const modeTag = document.getElementById('modeTag');
const title = document.getElementById('title');
const subtitle = document.getElementById('subtitle');

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const dropzoneTitle = document.getElementById('dropzoneTitle');
const dropzoneMeta = document.getElementById('dropzoneMeta');
const senderCipherType = document.getElementById('senderCipherType');
const senderPassword = document.getElementById('senderPassword');
const strengthEl = document.getElementById('strength');
const encryptUploadBtn = document.getElementById('encryptUploadBtn');
const uploadBar = document.getElementById('uploadBar');
const uploadStatus = document.getElementById('uploadStatus');
const shareArea = document.getElementById('shareArea');
const shareLink = document.getElementById('shareLink');
const copyBtn = document.getElementById('copyBtn');
const qr = document.getElementById('qr');
const expiryTimer = document.getElementById('expiryTimer');

const rxShareId = document.getElementById('rxShareId');
const rxFilename = document.getElementById('rxFilename');
const rxFilesize = document.getElementById('rxFilesize');
const rxCipherType = document.getElementById('rxCipherType');
const rxExpiry = document.getElementById('rxExpiry');
const receiverCipherType = document.getElementById('receiverCipherType');
const receiverPassword = document.getElementById('receiverPassword');
const downloadDecryptBtn = document.getElementById('downloadDecryptBtn');
const downloadBar = document.getElementById('downloadBar');
const downloadStatus = document.getElementById('downloadStatus');

const MAGIC = new Uint8Array([0x53, 0x54, 0x52, 0x32]); // STR2
const SALT_SIZE = 16;
const IV_SIZE = 12;
const PBKDF2_ITERATIONS = 210000;
const GENERIC_DECRYPT_ERROR = 'Unable to decrypt file. Check encryption type and password.';

const CIPHER_CONFIGS = {
    'AES-128': { bits: 128, code: 1 },
    'AES-192': { bits: 192, code: 2 },
    'AES-256': { bits: 256, code: 3 }
};

const CIPHER_BY_CODE = {
    1: 'AES-128',
    2: 'AES-192',
    3: 'AES-256'
};

let selectedFile = null;
let currentExpiryInterval = null;
let receiverMeta = null;

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let v = bytes;
    while (v >= 1024 && idx < units.length - 1) {
        v /= 1024;
        idx += 1;
    }
    return `${v.toFixed(v < 10 && idx > 0 ? 2 : 1)} ${units[idx]}`;
}

function setStatus(el, message, type = '') {
    el.textContent = message;
    el.className = `status ${type}`.trim();
}

function setProgress(bar, fraction) {
    const p = Math.max(0, Math.min(1, fraction || 0));
    bar.style.width = `${(p * 100).toFixed(1)}%`;
}

function checkPasswordStrength(value) {
    let score = 0;
    if (value.length >= 12) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[a-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    if (value.length === 0) return { label: '-', cls: 'muted' };
    if (score <= 2) return { label: 'Weak', cls: 'warn' };
    if (score === 3 || score === 4) return { label: 'Medium', cls: 'ok' };
    return { label: 'Strong', cls: 'ok' };
}

function updateSenderReady() {
    encryptUploadBtn.disabled = !(selectedFile && senderPassword.value.length > 0);
}

function ensureCryptoSupport() {
    if (!(window.crypto && window.crypto.subtle)) {
        throw new Error('Web Crypto API is not available in this browser.');
    }
}

function getCipherConfig(cipherType) {
    const cfg = CIPHER_CONFIGS[cipherType];
    if (!cfg) {
        throw new Error(`Unsupported encryption type: ${cipherType}`);
    }
    return cfg;
}

function getCipherTypeByCode(code) {
    return CIPHER_BY_CODE[code] || null;
}

function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        merged.set(part, offset);
        offset += part.length;
    }
    return merged;
}

function readCipherTypeFromPayload(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < MAGIC.length + 1 + SALT_SIZE + IV_SIZE + 1) {
        throw new Error(GENERIC_DECRYPT_ERROR);
    }

    for (let i = 0; i < MAGIC.length; i += 1) {
        if (bytes[i] !== MAGIC[i]) {
            throw new Error(GENERIC_DECRYPT_ERROR);
        }
    }

    const cipherType = getCipherTypeByCode(bytes[MAGIC.length]);
    if (!cipherType) {
        throw new Error(GENERIC_DECRYPT_ERROR);
    }
    return cipherType;
}

async function deriveAesKey(password, salt, bits, usage) {
    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        baseKey,
        {
            name: 'AES-GCM',
            length: bits
        },
        false,
        [usage]
    );
}

async function encryptFile(file, password, cipherType) {
    ensureCryptoSupport();
    const { bits, code } = getCipherConfig(cipherType);

    const plain = new Uint8Array(await file.arrayBuffer());
    const salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_SIZE));
    const key = await deriveAesKey(password, salt, bits, 'encrypt');

    const cipherBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plain
    );

    return concatBytes([
        MAGIC,
        new Uint8Array([code]),
        salt,
        iv,
        new Uint8Array(cipherBuffer)
    ]);
}

async function decryptFile(encBuffer, password, selectedCipherType) {
    ensureCryptoSupport();

    const bytes = new Uint8Array(encBuffer);
    const payloadCipherType = readCipherTypeFromPayload(bytes);

    if (payloadCipherType !== selectedCipherType) {
        throw new Error(GENERIC_DECRYPT_ERROR);
    }

    const { bits } = getCipherConfig(selectedCipherType);
    const offsetCipherCode = MAGIC.length;
    const offsetSalt = offsetCipherCode + 1;
    const offsetIv = offsetSalt + SALT_SIZE;
    const offsetCiphertext = offsetIv + IV_SIZE;

    const salt = bytes.slice(offsetSalt, offsetIv);
    const iv = bytes.slice(offsetIv, offsetCiphertext);
    const ciphertext = bytes.slice(offsetCiphertext);

    try {
        const key = await deriveAesKey(password, salt, bits, 'decrypt');
        const plainBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
        return new Uint8Array(plainBuffer);
    } catch {
        throw new Error(GENERIC_DECRYPT_ERROR);
    }
}

function updateCountdown(expiresAtIso) {
    if (currentExpiryInterval) {
        clearInterval(currentExpiryInterval);
    }

    const tick = () => {
        const remain = new Date(expiresAtIso).getTime() - Date.now();
        if (remain <= 0) {
            expiryTimer.textContent = 'Expired';
            clearInterval(currentExpiryInterval);
            currentExpiryInterval = null;
            return;
        }
        const hours = Math.floor(remain / 3600000);
        const mins = Math.floor((remain % 3600000) / 60000);
        const secs = Math.floor((remain % 60000) / 1000);
        expiryTimer.textContent = `Expires in ${hours}h ${mins}m ${secs}s`;
    };

    tick();
    currentExpiryInterval = setInterval(tick, 1000);
}

function setSelectedFile(file) {
    selectedFile = file;
    if (file) {
        dropzoneTitle.textContent = file.name;
        dropzoneMeta.textContent = formatBytes(file.size);
    } else {
        dropzoneTitle.textContent = 'Drop file here';
        dropzoneMeta.textContent = 'Max encrypted upload size: 100MB';
    }
    updateSenderReady();
}

async function uploadEncrypted(encArray, meta) {
    return new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append('encfile', new Blob([encArray], { type: 'application/octet-stream' }), 'file.enc');
        fd.append('meta', JSON.stringify(meta));

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.responseType = 'json';

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                setProgress(uploadBar, e.loaded / e.total);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                if (xhr.status === 413) {
                    reject(new Error('Upload rejected (413). Request body is too large for the current server/proxy limit.'));
                    return;
                }
                reject(new Error(xhr.response?.error || `Upload failed (${xhr.status})`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload.'));
        xhr.send(fd);
    });
}

async function fetchWithProgress(url, onProgress) {
    const resp = await fetch(url);
    if (!resp.ok) {
        let msg = `Download failed (${resp.status})`;
        try {
            const body = await resp.json();
            if (body?.error) msg = body.error;
        } catch { }
        throw new Error(msg);
    }

    const total = Number(resp.headers.get('content-length')) || 0;
    const reader = resp.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (onProgress) {
            onProgress(total > 0 ? loaded / total : 0);
        }
    }

    const all = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
        all.set(c, offset);
        offset += c.length;
    }

    return { data: all.buffer, headers: resp.headers };
}

function triggerDownload(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download.bin';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function readOriginalNameFromHeaders(headers) {
    const raw = headers.get('x-original-name-encoded') || headers.get('x-original-name');
    if (raw) {
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
    return 'download.bin';
}

function readCipherTypeFromHeaders(headers) {
    const raw = headers.get('x-cipher-type');
    return CIPHER_CONFIGS[raw] ? raw : null;
}

async function renderQr(link) {
    qr.classList.remove('muted');
    qr.textContent = 'Generating QR...';

    try {
        const encodedLink = encodeURIComponent(link);
        const candidates = [
            `/api/qrcode?text=${encodedLink}`,
            `/qrcode?text=${encodedLink}`
        ];

        let resp = null;
        let lastReason = '';

        for (const url of candidates) {
            resp = await fetch(url);
            if (resp.ok) {
                break;
            }

            let reason = `HTTP ${resp.status}`;
            try {
                const body = await resp.json();
                if (body && body.error) {
                    reason = body.error;
                }
            } catch {
                // Ignore parse errors and keep fallback reason.
            }
            lastReason = reason;
            resp = null;
        }

        if (!resp) {
            throw new Error(lastReason || 'No QR endpoint available');
        }

        const svg = await resp.text();
        qr.innerHTML = svg;

        const svgEl = qr.querySelector('svg');
        if (svgEl) {
            svgEl.setAttribute('width', '128');
            svgEl.setAttribute('height', '128');
            svgEl.setAttribute('aria-label', 'Share link QR code');
            svgEl.setAttribute('role', 'img');
        }
    } catch (err) {
        qr.textContent = `Could not render QR: ${err.message || 'unknown error'}. Copy and share the link above.`;
        qr.classList.add('muted');
    }
}

async function initReceiverMode(shareId) {
    senderPanel.classList.remove('active');
    receiverPanel.classList.add('active');
    modeTag.textContent = 'Receiver Mode';
    title.textContent = 'Decrypt Shared File';
    subtitle.textContent = 'Choose encryption type and enter password to decrypt locally in your browser.';

    rxShareId.textContent = shareId;

    try {
        const headResp = await fetch(`/api/download/${encodeURIComponent(shareId)}`, { method: 'HEAD' });
        if (!headResp.ok) {
            throw new Error('Link expired or not found.');
        }
        const name = readOriginalNameFromHeaders(headResp.headers);
        const size = Number(headResp.headers.get('x-file-size') || 0);
        const exp = headResp.headers.get('x-expires-at');
        const cipherType = readCipherTypeFromHeaders(headResp.headers);

        if (cipherType) {
            receiverCipherType.value = cipherType;
        }

        receiverMeta = { originalName: name, fileSize: size, expiresAt: exp, cipherType };
        rxFilename.textContent = name;
        rxFilesize.textContent = formatBytes(size);
        rxCipherType.textContent = cipherType || '-';
        rxExpiry.textContent = exp ? new Date(exp).toLocaleString() : '-';
    } catch (err) {
        receiverMeta = null;
        rxFilename.textContent = '-';
        rxFilesize.textContent = '-';
        rxCipherType.textContent = '-';
        rxExpiry.textContent = '-';
        setStatus(downloadStatus, err.message || 'Failed to load file metadata.', 'error');
    }
}

function initSenderMode() {
    senderPanel.classList.add('active');
    receiverPanel.classList.remove('active');
    modeTag.textContent = 'Sender Mode';
    title.textContent = 'Secure AES File Transfer';
    subtitle.textContent = 'Choose AES type, encrypt in browser, upload ciphertext, and share a temporary link.';
}

fileInput.addEventListener('change', () => {
    setSelectedFile(fileInput.files[0] || null);
});

['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('drag');
    });
});

['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag');
    });
});

dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
});

senderPassword.addEventListener('input', () => {
    const st = checkPasswordStrength(senderPassword.value);
    strengthEl.textContent = `Password strength: ${st.label}`;
    strengthEl.className = `strength ${st.cls}`;
    updateSenderReady();
});

senderCipherType.addEventListener('change', () => {
    updateSenderReady();
});

copyBtn.addEventListener('click', async () => {
    const link = shareLink.textContent.trim();
    if (!link) return;
    try {
        await navigator.clipboard.writeText(link);
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 1200);
    } catch {
        copyBtn.textContent = 'Copy failed';
        setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 1200);
    }
});

encryptUploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    const password = senderPassword.value;
    const cipherType = senderCipherType.value;

    if (!password) {
        setStatus(uploadStatus, 'Password is required.', 'warn');
        return;
    }

    encryptUploadBtn.disabled = true;
    setProgress(uploadBar, 0);
    shareArea.style.display = 'none';
    qr.innerHTML = '';
    setStatus(uploadStatus, `Encrypting file with ${cipherType}...`, '');

    try {
        const encrypted = await encryptFile(selectedFile, password, cipherType);
        setStatus(uploadStatus, 'Uploading encrypted blob...', '');

        const meta = {
            originalName: selectedFile.name,
            fileSize: selectedFile.size,
            cipherType
        };
        const response = await uploadEncrypted(encrypted, meta);

        const link = `${window.location.origin}/receive/${encodeURIComponent(response.shareId)}`;
        shareLink.textContent = link;
        shareArea.style.display = 'block';
        setProgress(uploadBar, 1);
        setStatus(uploadStatus, 'Upload complete. Share link and password securely.', 'ok');

        await renderQr(link);

        if (response.expiresAt) {
            updateCountdown(response.expiresAt);
        }
    } catch (err) {
        setStatus(uploadStatus, err.message || 'Encrypt/upload failed.', 'error');
        setProgress(uploadBar, 0);
    } finally {
        encryptUploadBtn.disabled = false;
        updateSenderReady();
    }
});

downloadDecryptBtn.addEventListener('click', async () => {
    const pathMatch = location.pathname.match(/^\/receive\/([^/]+)$/);
    const shareId = pathMatch?.[1];
    if (!shareId) {
        setStatus(downloadStatus, 'Missing share ID in URL.', 'error');
        return;
    }

    const password = receiverPassword.value;
    const selectedCipherType = receiverCipherType.value;

    if (!password) {
        setStatus(downloadStatus, 'Password is required.', 'warn');
        return;
    }

    downloadDecryptBtn.disabled = true;
    setProgress(downloadBar, 0);
    setStatus(downloadStatus, 'Downloading encrypted file...', '');

    try {
        const { data, headers } = await fetchWithProgress(`/api/download/${encodeURIComponent(shareId)}`, (p) => {
            setProgress(downloadBar, p);
        });

        setStatus(downloadStatus, `Decrypting with ${selectedCipherType}...`, '');
        const plain = await decryptFile(data, password, selectedCipherType);
        const filename = receiverMeta?.originalName || readOriginalNameFromHeaders(headers);
        triggerDownload(plain, filename);
        setStatus(downloadStatus, 'Download ready and decrypted.', 'ok');
    } catch (err) {
        const msg = err.message || '';
        if (/expired|not found/i.test(msg)) {
            setStatus(downloadStatus, 'Link expired or file missing.', 'error');
        } else if (/Unable to decrypt file/i.test(msg)) {
            setStatus(downloadStatus, GENERIC_DECRYPT_ERROR, 'error');
        } else {
            setStatus(downloadStatus, 'Unable to decrypt file. Check encryption type and password.', 'error');
        }
    } finally {
        downloadDecryptBtn.disabled = false;
    }
});

(function bootstrap() {
    const receiveMatch = location.pathname.match(/^\/receive\/([^/]+)$/);
    if (receiveMatch) {
        initReceiverMode(decodeURIComponent(receiveMatch[1]));
    } else {
        initSenderMode();
    }
})();
