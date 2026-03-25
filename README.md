# Secure Transfer

Production-style encrypted file transfer with client-side AES-256-GCM encryption.

## What It Does

- Sender encrypts file **in browser** using password-derived key
- Browser uploads only encrypted `.enc` blob to server
- Server stores blob on disk with UUID filename and 24-hour expiry
- Receiver opens share link, enters password, downloads encrypted blob, decrypts in browser
- Server never sees plaintext or password

## Tech Stack

- Backend: Node.js, Express, Multer, express-rate-limit
- Frontend: Vanilla JS + Web Crypto API
- Storage: Local disk `./uploads/` with UUID filenames
- No database

## Project Structure

```text
secure-transfer/
├── server.js
├── package.json
├── README.md
├── .gitignore
├── public/
│   └── index.html
└── uploads/
```

`uploads/` is created on startup and excluded from git.

## Encryption Format

Client-side encrypted payload format:

```text
[4b magic][16b salt][12b iv][ciphertext+tag]
```

- Magic: `AES1`
- Key derivation: PBKDF2 (SHA-256, 310000 iterations)
- Symmetric cipher: AES-256-GCM

## API

### `POST /api/upload`

- `multipart/form-data`
- Fields:
  - `encfile`: encrypted binary blob (`.enc`)
  - `meta`: JSON string: `{ "originalName": "...", "fileSize": 12345 }`
- Stores file as `./uploads/<uuid>.enc`
- Stores metadata as `./uploads/<uuid>.json`
- Returns:

```json
{ "shareId": "<uuid>", "expiresAt": "<ISO timestamp>" }
```

### `GET /api/download/:shareId`

- Streams encrypted file (`.enc`) from disk
- Headers include:
  - `Content-Disposition: attachment; filename="<uuid>.enc"`
  - `X-Original-Name`
  - `X-File-Size`
  - `X-Expires-At`
- Returns `404` when missing/expired

### `DELETE /api/cleanup`

Internal cleanup endpoint.

- Deletes files older than 24h
- Intended for scheduled internal call every hour
- Auth:
  - If `CLEANUP_TOKEN` is set: requires header `x-internal-token`
  - Else only localhost IP is allowed

## Security Controls

- Password never sent to server
- Plaintext never sent to server
- Encrypted blob only at rest on server
- Upload rate-limit: max 10 uploads/hour/IP
- Max upload size: 100MB (Multer limit)
- Helmet security headers enabled
- Expiring files (24h) + hourly cleanup

## Setup

### 1. Install

```bash
cd secure-transfer
npm install
```

### 2. Run

```bash
npm start
```

Server runs at:

- `http://localhost:3000`

### 3. (Optional) Secure cleanup endpoint

Set a token before start:

```bash
export CLEANUP_TOKEN="your-random-secret"
npm start
```

Then call cleanup:

```bash
curl -X DELETE http://localhost:3000/api/cleanup \
  -H "x-internal-token: your-random-secret"
```

## Usage

### Sender flow (`/`)

1. Select file or drag-drop
2. Enter password (strength indicator shown)
3. Click **Encrypt & Upload**
4. Copy generated link (`/receive/<shareId>`) or scan QR code
5. Share password via separate secure channel

### Receiver flow (`/receive/<shareId>`)

1. Open link
2. Enter password
3. Click **Download & Decrypt**
4. Browser decrypts and downloads original file name

## Ngrok (Share Publicly)

### 1. Install ngrok

See: https://ngrok.com/download

### 2. Authenticate once

```bash
ngrok config add-authtoken <YOUR_AUTHTOKEN>
```

### 3. Expose local app

Keep your app running on `3000`, then:

```bash
ngrok http 3000
```

ngrok prints a public HTTPS URL (example):

- `https://abc123.ngrok-free.app`

Use that URL as sender/receiver base.

## Notes for Production Hardening

- Put app behind TLS reverse proxy (Nginx/Caddy)
- Restrict CORS to trusted origins if serving frontend separately
- Add logging/monitoring and disk quota checks
- Use object storage + signed URLs if scaling beyond single host
- Add virus/malware scanning pipeline for uploaded encrypted blobs if policy requires
