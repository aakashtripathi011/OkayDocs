# OkayDocs

**AI-assisted fake identity and document screening, running entirely in the browser.**

OkayDocs reads a passport (or similar travel document), runs five layers of checks, and gives a border officer an explainable risk score in seconds. Passport data never leaves the device.


> OkayDocs is a **screening aid**, not a replacement for officers or for chip and hardware verification. It flags suspicious documents and explains why. It does not prove a document is genuine.

---

## The problem

Border checkpoints process thousands of passports, visas and IDs every day. Verification still relies mostly on human inspection and basic database lookups. Officers must catch fake passports, altered photographs, modified dates of birth, tampered stamps, impersonation and multiple identities, under heavy passenger load, with no standard digital trail.

## How it works: five layers

| Layer | Name | What it checks | Catches |
|---|---|---|---|
| **L1** | MRZ math | Recomputes ICAO 9303 check digits (weights 7-3-1) on the machine-readable zone. Tries common OCR fixes (O/0, I/1, S/5, B/8) before failing. | Careless edits to MRZ data |
| **L2** | Match and rules | Printed text vs MRZ, expiry, DOB sanity, country codes, visa rules from cached official reference data. | Edits where only one copy of the data was changed |
| **L3** | Tampering | Error Level Analysis (ELA) heatmap, region scoring (photo, DOB, MRZ vs the rest of the page), EXIF metadata. | Photo swaps, edited text |
| **L4** | Face check | Passport photo vs live selfie using face embeddings. | A genuine passport used by the wrong person |
| **L5** | Record check | Mock watchlist (hashed passport numbers, fuzzy name + DOB) and same-face-different-identity detection. | Blacklisted or duplicate identities |

All layers feed a **risk engine** that produces a 0 to 100 score with a plain-English reason for every flag.

```
Upload / Webcam
   -> L1 MRZ  -> L2 Match  -> L3 Tamper  -> L4 Face  -> L5 Record
                                  |
                         Risk engine (weighted score + reasons)
                                  |
                Dashboard + hash-chained audit log
```

## Status

Update this table as you build.

| Layer | Status |
|---|---|
| L1 MRZ math | In progress (validator built; OCR tuning ongoing) |
| L2 Match and rules | Planned |
| L3 Tampering | In progress (`tampering.js`: ELA + region scoring; EXIF planned) |
| L4 Face check | Planned |
| L5 Record check | Planned |
| Risk engine + dashboard | Planned |

## Key features

- **On-device processing:** OCR, tamper analysis and face matching run in the browser. No passport image is uploaded.
- **Explainable decisions:** every flag has a reason an officer can read.
- **Self-correcting OCR:** MRZ check digits help recover from OCR mistakes.
- **Reference rules from official sources:** non-sensitive rules are fetched from government websites via TinyFish, validated against a schema, and cached. The app works from the cache if the API is down.
- **Tamper-evident audit log:** each screening is logged with a hash of the previous entry, so edits to old records are detectable.

## Tech stack

| Area | Tools |
|---|---|
| Frontend | Next.js, Tailwind CSS |
| OCR | Tesseract.js |
| MRZ and validation | JavaScript / TypeScript (ICAO 9303) |
| Tampering | Canvas API (ELA), exifr (metadata) |
| Face | MediaPipe (detection), face-api.js (embeddings) |
| Record check | fuse.js (fuzzy match), Web Crypto (SHA-256), IndexedDB |
| Reference data | TinyFish API through a server-side Next.js API route |

## Getting started

### Prerequisites

- Node.js 18 or newer
- A modern browser (Chrome or Edge recommended)

### Install and run

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

Create `frontend/.env.local`:

```
TINYFISH_API_KEY=your_key_here
```

Keep the key **server-side only**. Do not prefix it with `NEXT_PUBLIC_`, and call TinyFish only from an API route, never from browser code.

## Usage example: tampering check

```js
import { analyzeTampering, drawHeatmap } from "./tampering.js";

const result = await analyzeTampering(file); // file from <input type="file">

console.log(result.status);       // "suspicious" | "inconclusive" | "unable"
console.log(result.indicators);   // e.g. ["ELA_ANOMALY_DOB"]
console.log(result.ela?.regions); // { photo: {mean, ratio}, dob: {...}, mrz: {...} }

if (result.heatmap) {
  drawHeatmap(document.getElementById("heatmap"), result.heatmap);
}
```

`inconclusive` means nothing suspicious was found. It does **not** mean the document is genuine.

### Tuning

In `tampering.js`:

- `REGIONS`: boxes (as fractions of the image) for the photo, DOB and MRZ areas. Adjust them to your document layout.
- `ELA_RATIO_LIMIT`: a region is flagged when its ELA score is this many times the page average. Start at 1.8 and tune on your own clean and tampered samples.

## Testing

Use **fake data only**. Never use a real passport.

- **MRZ validator:** the ICAO 9303 specimen (fictional country UTO) should validate:
  ```
  P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<
  L898902C36UTO7408122F1204159ZE184226B<<<<<10
  ```
  Changing any character in a field (for example DOB `740812` to `750812`) should fail that field's check digit.
- **Tampering:** create mock passports in a design tool, export clean and edited versions as **JPEG**, and compare the `ela.regions` ratios.
- **Reference data:** test with the API disabled to confirm the cached rules are used.

## Privacy

- Passport images and extracted fields stay in the browser.
- The watchlist stores **hashed** passport numbers, not raw numbers.
- Only non-sensitive reference rules are fetched from the network.
- The watchlist in this prototype is a **mock**. A production system would connect to official watchlists through secure, authorized APIs.

## Limitations

- **No chip verification.** Real checkpoints rely on ePassport chip signatures, UV/infrared scanners and Interpol databases. DocGuard is the software-only version that works from a camera image. NFC chip verification is future work.
- **ELA gives false alarms** on screenshots, messaging-app images and already-compressed files. It is a medium-strength signal.
- **No liveness detection.** A printed photo could fool face matching.
- **Passing the MRZ check does not mean the passport is genuine.** The algorithm is public, so a careful forger can recompute check digits.
- **No public dataset of real forged passports exists.** Evaluation uses synthetic tampered samples.

## Roadmap

- [ ] Finish L1 OCR cleanup (crop MRZ, threshold, fix `K`/`L` read as `<`)
- [ ] L2 match and rules with cached reference data
- [ ] EXIF check in L3
- [ ] L4 face match
- [ ] L5 mock watchlist and duplicate-identity check
- [ ] Risk engine, dashboard, hash-chained audit log
- [ ] Future: NFC chip verification, liveness detection, official watchlist integration

## References

- SIH26188 problem statement, Ministry of Home Affairs (SSB)
- ICAO Doc 9303, Machine Readable Travel Documents
- India Digital Personal Data Protection Act, 2023
- Library docs: Tesseract.js, MediaPipe, face-api.js, exifr, fuse.js, TinyFish

## License

Add a license before publishing the repository (for example MIT).
