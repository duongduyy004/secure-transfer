        const MAGIC = new TextEncoder().encode('AES1');
        const SALT_BYTES = 16;
        const IV_BYTES = 12;
        const PBKDF2_ITERATIONS = 310000;

        const senderPanel = document.getElementById('senderPanel');
        const receiverPanel = document.getElementById('receiverPanel');
        const modeTag = document.getElementById('modeTag');
        const title = document.getElementById('title');
        const subtitle = document.getElementById('subtitle');

        const fileInput = document.getElementById('fileInput');
        const dropzone = document.getElementById('dropzone');
        const dropzoneTitle = document.getElementById('dropzoneTitle');
        const dropzoneMeta = document.getElementById('dropzoneMeta');
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
        const rxExpiry = document.getElementById('rxExpiry');
        const receiverPassword = document.getElementById('receiverPassword');
        const downloadDecryptBtn = document.getElementById('downloadDecryptBtn');
        const downloadBar = document.getElementById('downloadBar');
        const downloadStatus = document.getElementById('downloadStatus');

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

        async function deriveAesKey(password, salt, usage) {
            const passKey = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                'PBKDF2',
                false,
                ['deriveKey']
            );

            return crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt,
                    iterations: PBKDF2_ITERATIONS,
                    hash: 'SHA-256'
                },
                passKey,
                { name: 'AES-GCM', length: 256 },
                false,
                [usage]
            );
        }

        async function encryptFile(file, password) {
            const plain = new Uint8Array(await file.arrayBuffer());
            const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
            const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
            const key = await deriveAesKey(password, salt, 'encrypt');

            const cipherBuf = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                plain
            );

            const cipher = new Uint8Array(cipherBuf);
            const out = new Uint8Array(MAGIC.length + SALT_BYTES + IV_BYTES + cipher.length);
            out.set(MAGIC, 0);
            out.set(salt, MAGIC.length);
            out.set(iv, MAGIC.length + SALT_BYTES);
            out.set(cipher, MAGIC.length + SALT_BYTES + IV_BYTES);
            return out;
        }

        async function decryptFile(encBuffer, password) {
            const data = new Uint8Array(encBuffer);
            const minLength = MAGIC.length + SALT_BYTES + IV_BYTES + 16;
            if (data.length < minLength) {
                throw new Error('Invalid encrypted payload.');
            }

            const magic = data.slice(0, MAGIC.length);
            if (!magic.every((v, i) => v === MAGIC[i])) {
                throw new Error('Invalid file magic. Unsupported or corrupted file.');
            }

            const saltStart = MAGIC.length;
            const ivStart = saltStart + SALT_BYTES;
            const cipherStart = ivStart + IV_BYTES;
            const salt = data.slice(saltStart, ivStart);
            const iv = data.slice(ivStart, cipherStart);
            const cipher = data.slice(cipherStart);

            const key = await deriveAesKey(password, salt, 'decrypt');
            try {
                const plainBuf = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv },
                    key,
                    cipher
                );
                return new Uint8Array(plainBuf);
            } catch {
                throw new Error('Wrong password or tampered file.');
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

        async function initReceiverMode(shareId) {
            senderPanel.classList.remove('active');
            receiverPanel.classList.add('active');
            modeTag.textContent = 'Receiver Mode';
            title.textContent = 'Decrypt Shared File';
            subtitle.textContent = 'Enter the password used by the sender to decrypt locally in your browser.';

            rxShareId.textContent = shareId;

            try {
                // Use HEAD to fetch metadata without downloading encrypted bytes.
                const headResp = await fetch(`/api/download/${encodeURIComponent(shareId)}`, { method: 'HEAD' });
                if (!headResp.ok) {
                    throw new Error('Link expired or not found.');
                }
                const name = headResp.headers.get('x-original-name') || 'download.bin';
                const size = Number(headResp.headers.get('x-file-size') || 0);
                const exp = headResp.headers.get('x-expires-at');

                receiverMeta = { originalName: name, fileSize: size, expiresAt: exp };
                rxFilename.textContent = name;
                rxFilesize.textContent = formatBytes(size);
                rxExpiry.textContent = exp ? new Date(exp).toLocaleString() : '-';
            } catch (err) {
                receiverMeta = null;
                rxFilename.textContent = '-';
                rxFilesize.textContent = '-';
                rxExpiry.textContent = '-';
                setStatus(downloadStatus, err.message || 'Failed to load file metadata.', 'error');
            }
        }

        function initSenderMode() {
            senderPanel.classList.add('active');
            receiverPanel.classList.remove('active');
            modeTag.textContent = 'Sender Mode';
            title.textContent = 'Secure AES File Transfer';
            subtitle.textContent = 'Encrypt in your browser, upload ciphertext, and share a temporary link.';
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
            if (!password) {
                setStatus(uploadStatus, 'Password is required.', 'warn');
                return;
            }

            encryptUploadBtn.disabled = true;
            setProgress(uploadBar, 0);
            shareArea.style.display = 'none';
            qr.innerHTML = '';
            setStatus(uploadStatus, 'Encrypting file in browser...', '');

            try {
                const encrypted = await encryptFile(selectedFile, password);
                setStatus(uploadStatus, 'Uploading encrypted blob...', '');

                const meta = {
                    originalName: selectedFile.name,
                    fileSize: selectedFile.size
                };
                const response = await uploadEncrypted(encrypted, meta);

                const link = `${window.location.origin}/receive/${encodeURIComponent(response.shareId)}`;
                shareLink.textContent = link;
                shareArea.style.display = 'block';
                setProgress(uploadBar, 1);
                setStatus(uploadStatus, 'Upload complete. Share this link securely.', 'ok');

                qr.innerHTML = '';
                new QRCode(qr, {
                    text: link,
                    width: 128,
                    height: 128,
                    correctLevel: QRCode.CorrectLevel.M
                });

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

                setStatus(downloadStatus, 'Decrypting in browser...', '');
                const plain = await decryptFile(data, password);
                const filename = receiverMeta?.originalName || headers.get('x-original-name') || 'download.bin';
                triggerDownload(plain, filename);
                setStatus(downloadStatus, 'Download ready and decrypted.', 'ok');
            } catch (err) {
                const msg = err.message || 'Download/decrypt failed.';
                if (/expired|not found/i.test(msg)) {
                    setStatus(downloadStatus, 'Link expired or file missing.', 'error');
                } else if (/tampered|wrong password/i.test(msg)) {
                    setStatus(downloadStatus, 'Wrong password or tampered file.', 'error');
                } else {
                    setStatus(downloadStatus, msg, 'error');
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
