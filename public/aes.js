// ============================================================
// 1. GF(2^8) Multiply - Peasant's algorithm
// ============================================================
function gmul(a, b) {
    let x = a & 0xff;
    let y = b & 0xff;
    let result = 0;

    for (let i = 0; i < 8; i++) {
        if (y & 1) result ^= x;
        const carry = x & 0x80;
        x = (x << 1) & 0xff;
        if (carry) x ^= 0x1b;  // reduction polynomial
        y >>>= 1;
    }

    return result & 0xff;
}

// ============================================================
// 2. S-Box Generation (derived, not hardcoded)
// ============================================================
function gfInv(v) {
    if ((v & 0xff) === 0) return 0;
    let result = 1;
    let x = v & 0xff;
    for (let i = 0; i < 254; i++) {
        result = gmul(result, x);
    }
    return result & 0xff;
}

function rotlByte(v, s) {
    const shift = s & 7;
    return ((v << shift) | (v >>> (8 - shift))) & 0xff;
}

function buildSBox() {
    const sBox = new Uint8Array(256);
    for (let b = 0; b < 256; b++) {
        const inv = gfInv(b);
        sBox[b] = (inv ^ rotlByte(inv, 1) ^ rotlByte(inv, 2) ^
            rotlByte(inv, 3) ^ rotlByte(inv, 4) ^ 0x63) & 0xff;
    }
    return sBox;
}

function buildInvSBox(sBox) {
    const invSBox = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        invSBox[sBox[i]] = i;
    }
    return invSBox;
}

// ============================================================
// 3. Key Expansion
// ============================================================
function keyExpansion(keyBytes) {
    const key = new Uint8Array(keyBytes);
    const Nk = key.length / 4;
    const Nr = Nk === 4 ? 10 : Nk === 6 ? 12 : 14;
    const sBox = buildSBox();
    const totalWords = 4 * (Nr + 1);
    const expanded = new Uint8Array(totalWords * 4);

    expanded.set(key, 0);
    let rcon = 0x01;

    for (let i = Nk; i < totalWords; i++) {
        let temp = expanded.slice((i - 1) * 4, i * 4);

        if (i % Nk === 0) {
            temp = new Uint8Array([
                sBox[temp[1]] ^ rcon, sBox[temp[2]], sBox[temp[3]], sBox[temp[0]]
            ]);
            rcon = gmul(rcon, 0x02);
        } else if (Nk > 6 && i % Nk === 4) {
            temp = new Uint8Array([sBox[temp[0]], sBox[temp[1]], sBox[temp[2]], sBox[temp[3]]]);
        }

        for (let j = 0; j < 4; j++) {
            expanded[i * 4 + j] = expanded[(i - Nk) * 4 + j] ^ temp[j];
        }
    }

    return { expanded, Nr, sBox, invSBox: buildInvSBox(sBox) };
}

// ============================================================
// 4. State Operations
// ============================================================
function toState(block16) {
    const state = [];
    for (let r = 0; r < 4; r++) {
        state[r] = [];
        for (let c = 0; c < 4; c++) {
            state[r][c] = block16[c * 4 + r];
        }
    }
    return state;
}

function fromState(state) {
    const out = new Uint8Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            out[c * 4 + r] = state[r][c] & 0xff;
        }
    }
    return out;
}

function subBytes(state, sBox) {
    const out = [];
    for (let r = 0; r < 4; r++) {
        out[r] = [];
        for (let c = 0; c < 4; c++) {
            out[r][c] = sBox[state[r][c]];
        }
    }
    return out;
}

function invSubBytes(state, invSBox) {
    const out = [];
    for (let r = 0; r < 4; r++) {
        out[r] = [];
        for (let c = 0; c < 4; c++) {
            out[r][c] = invSBox[state[r][c]];
        }
    }
    return out;
}

function shiftRows(state) {
    const out = [];
    for (let r = 0; r < 4; r++) {
        out[r] = [];
        for (let c = 0; c < 4; c++) {
            out[r][c] = state[r][(c + r) % 4];
        }
    }
    return out;
}

function invShiftRows(state) {
    const out = [];
    for (let r = 0; r < 4; r++) {
        out[r] = [];
        for (let c = 0; c < 4; c++) {
            out[r][c] = state[r][(c - r + 4) % 4];
        }
    }
    return out;
}

function mixColumns(state) {
    const out = [];
    for (let r = 0; r < 4; r++) out[r] = [];
    for (let c = 0; c < 4; c++) {
        const s0 = state[0][c], s1 = state[1][c], s2 = state[2][c], s3 = state[3][c];
        out[0][c] = gmul(0x02, s0) ^ gmul(0x03, s1) ^ s2 ^ s3;
        out[1][c] = s0 ^ gmul(0x02, s1) ^ gmul(0x03, s2) ^ s3;
        out[2][c] = s0 ^ s1 ^ gmul(0x02, s2) ^ gmul(0x03, s3);
        out[3][c] = gmul(0x03, s0) ^ s1 ^ s2 ^ gmul(0x02, s3);
    }
    return out;
}

function invMixColumns(state) {
    const out = [];
    for (let r = 0; r < 4; r++) out[r] = [];
    for (let c = 0; c < 4; c++) {
        const s0 = state[0][c], s1 = state[1][c], s2 = state[2][c], s3 = state[3][c];
        out[0][c] = gmul(0x0e, s0) ^ gmul(0x0b, s1) ^ gmul(0x0d, s2) ^ gmul(0x09, s3);
        out[1][c] = gmul(0x09, s0) ^ gmul(0x0e, s1) ^ gmul(0x0b, s2) ^ gmul(0x0d, s3);
        out[2][c] = gmul(0x0d, s0) ^ gmul(0x09, s1) ^ gmul(0x0e, s2) ^ gmul(0x0b, s3);
        out[3][c] = gmul(0x0b, s0) ^ gmul(0x0d, s1) ^ gmul(0x09, s2) ^ gmul(0x0e, s3);
    }
    return out;
}

function addRoundKey(state, rk, round) {
    const out = [];
    for (let r = 0; r < 4; r++) {
        out[r] = [];
        for (let c = 0; c < 4; c++) {
            out[r][c] = state[r][c] ^ rk[round * 16 + c * 4 + r];
        }
    }
    return out;
}

// ============================================================
// 5. Block Cipher
// ============================================================
function encryptBlock(block16, expanded, Nr, sBox) {
    let state = toState(block16);
    state = addRoundKey(state, expanded, 0);
    for (let round = 1; round < Nr; round++) {
        state = subBytes(state, sBox);
        state = shiftRows(state);
        state = mixColumns(state);
        state = addRoundKey(state, expanded, round);
    }
    state = subBytes(state, sBox);
    state = shiftRows(state);
    state = addRoundKey(state, expanded, Nr);
    return fromState(state);
}

function decryptBlock(block16, expanded, Nr, invSBox) {
    let state = toState(block16);
    state = addRoundKey(state, expanded, Nr);
    for (let round = Nr - 1; round >= 1; round--) {
        state = invShiftRows(state);
        state = invSubBytes(state, invSBox);
        state = addRoundKey(state, expanded, round);
        state = invMixColumns(state);
    }
    state = invShiftRows(state);
    state = invSubBytes(state, invSBox);
    state = addRoundKey(state, expanded, 0);
    return fromState(state);
}

// ============================================================
// 6. CBC Mode & Padding
// ============================================================
function pkcs7Pad(data) {
    const pad = 16 - (data.length % 16 || 16) + 16 * Number(data.length % 16 === 0);
    const out = new Uint8Array(data.length + pad);
    out.set(data, 0);
    out.fill(pad, data.length);
    return out;
}

function pkcs7Unpad(data) {
    if (data.length === 0 || data.length % 16 !== 0) throw new Error('Invalid padding');
    const pad = data[data.length - 1];
    if (pad < 1 || pad > 16 || pad > data.length) throw new Error('Invalid padding');
    for (let i = data.length - pad; i < data.length; i++) {
        if (data[i] !== pad) throw new Error('Invalid padding');
    }
    return data.slice(0, data.length - pad);
}

function cbcEncrypt(dataBytes, keyBytes, iv16) {
    const { expanded, Nr, sBox } = keyExpansion(keyBytes);
    const padded = pkcs7Pad(new Uint8Array(dataBytes));
    const out = new Uint8Array(padded.length);
    let prev = new Uint8Array(iv16);
    for (let offset = 0; offset < padded.length; offset += 16) {
        const block = padded.slice(offset, offset + 16);
        for (let i = 0; i < 16; i++) block[i] ^= prev[i];
        const cipher = encryptBlock(block, expanded, Nr, sBox);
        out.set(cipher, offset);
        prev = cipher;
    }
    return out;
}

function cbcDecrypt(dataBytes, keyBytes, iv16) {
    const data = new Uint8Array(dataBytes);
    if (data.length === 0 || data.length % 16 !== 0) throw new Error('Invalid ciphertext length');
    const { expanded, Nr, invSBox } = keyExpansion(keyBytes);
    const out = new Uint8Array(data.length);
    let prev = new Uint8Array(iv16);
    for (let offset = 0; offset < data.length; offset += 16) {
        const block = data.slice(offset, offset + 16);
        const plain = decryptBlock(block, expanded, Nr, invSBox);
        for (let i = 0; i < 16; i++) plain[i] ^= prev[i];
        out.set(plain, offset);
        prev = block;
    }
    return pkcs7Unpad(out);
}

// ============================================================
// 7. Utilities
// ============================================================
function randomBytes(n) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
}

function toBytes(str) {
    return new TextEncoder().encode(str);
}

function fromBytes(bytes) {
    return new TextDecoder().decode(bytes);
}

function deriveKey(password, salt, length) {
    const pw = toBytes(password || '');
    const seed = new Uint8Array(length);
    const key = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        const p = pw.length === 0 ? 0 : pw[i % pw.length];
        const s = salt[i % 16];
        seed[i] = p ^ s;
    }
    for (let i = 0; i < length; i++) {
        key[i] = seed[i] ^ rotlByte(seed[(i + 7) % length], i % 8);
    }
    return key;
}

// ============================================================
// 8. High-level File API
// ============================================================
function encryptBytes(fileBytes, password) {
    const salt = randomBytes(16);
    const iv = randomBytes(16);
    const key = deriveKey(password, salt, 32);
    const cipher = cbcEncrypt(fileBytes, key, iv);
    const magic = toBytes('AES1');
    const out = new Uint8Array(4 + 16 + 16 + cipher.length);
    out.set(magic, 0);
    out.set(salt, 4);
    out.set(iv, 20);
    out.set(cipher, 36);
    return out;
}

function decryptBytes(encBytes, password) {
    const data = new Uint8Array(encBytes);
    if (data.length < 52) throw new Error('Invalid encrypted file');
    const magic = data.slice(0, 4);
    const magicStr = fromBytes(magic);
    if (magicStr !== 'AES1') throw new Error('Invalid file magic');
    const salt = data.slice(4, 20);
    const iv = data.slice(20, 36);
    const cipher = data.slice(36);
    const key = deriveKey(password, salt, 32);
    return cbcDecrypt(cipher, key, iv);
}

// ============================================================
// Export Module
// ============================================================
const SimpleAES = {
    gmul,
    buildSBox,
    buildInvSBox,
    keyExpansion,
    encryptBlock,
    decryptBlock,
    cbcEncrypt,
    cbcDecrypt,
    deriveKey,
    encryptBytes,
    decryptBytes,
    toBytes,
    fromBytes
};

if (typeof window !== 'undefined') {
    window.SimpleAES = SimpleAES;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleAES;
}
