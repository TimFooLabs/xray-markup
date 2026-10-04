# xray-markup

Spinal X-ray analyzer: load an X-ray or DICOM image, place Length / Angle / Cobb
Angle measurements, and export the measurements as JSON.

## Development

```sh
npm install
npm run dev
```

`npm run check` runs the build as the pre-merge gate.

## Measurement export

Exports are produced entirely in your browser. Nothing is uploaded anywhere.

**Export Measurements** writes `measurements.json` — plain, readable JSON:

```json
[
  { "type": "Cobb Angle", "value": "24.50", "unit": "degrees" }
]
```

Treat these files as you would any clinical document: they are not encrypted,
so do not share them where you would not share the underlying image.

**Export with Passphrase** writes `measurements.enc.json`, encrypted with a key
derived from a passphrase you type at export time. The passphrase is never
stored by the app, and no key is embedded in the source or the shipped bundle.

- Key derivation: PBKDF2 with SHA-256, 250,000 iterations, a random 16-byte salt.
- Encryption: AES-GCM with a 256-bit key and a random 12-byte IV.

Both are base64-encoded in the file:

```json
{
  "format": "xray-markup-encrypted-v1",
  "kdf": {
    "name": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 250000,
    "salt": "<base64>"
  },
  "cipher": { "name": "AES-GCM", "iv": "<base64>", "keyLength": 256 },
  "ciphertext": "<base64>"
}
```

Decryption with the same passphrase yields the plain measurements JSON above.
There is no in-app import yet; the format is documented here so any AES-GCM
tool can read the file.

A passphrase export with a forgotten passphrase is unrecoverable — there is no
back door, and none should be.
