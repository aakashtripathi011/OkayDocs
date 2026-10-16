
import { createWorker } from "tesseract.js";

// ==================================================
// 1. AUTOMATIC IMAGE PREPROCESSING
// ==================================================

async function preprocessMRZRegion(imageFile) {
  if (
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return null;
  }

  let bitmap;

  try {
    bitmap = await createImageBitmap(imageFile);

    const { width, height } = bitmap;

    if (width < 100 || height < 100) {
      return null;
    }

    // Try different bottom regions because passport layouts vary.
    const cropRatios = [0.15, 0.2, 0.25, 0.35];
    const results = [];

    for (const ratio of cropRatios) {
      const sourceY = Math.floor(height * (1 - ratio));
      const sourceHeight = height - sourceY;
      const scale = Math.max(2, Math.min(4, Math.ceil(1800 / width)));

      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = sourceHeight * scale;

      const context = canvas.getContext("2d");

      if (!context) continue;

      context.filter = "grayscale(1) contrast(1.4)";
      context.drawImage(
        bitmap,
        0,
        sourceY,
        width,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });

      if (blob) {
        results.push({
          image: blob,
          preprocessing: `bottom_crop_${Math.round(ratio * 100)}pct`,
        });
      }
    }

    return results;
  } catch (error) {
    console.warn("Image preprocessing failed:", error.message);
    return null;
  } finally {
    bitmap?.close();
  }
}

// ==================================================
// 2. OCR: EXTRACT TEXT FROM IMAGE
// ==================================================

const MAX_SCORE = 7;

function scoreText(text) {
  const extracted = extractMRZLines(text);

  if (!extracted.success) return -1;

  const validation = validateMRZ(extracted.lines);

  if (!validation.success) return 0;

  return validation.checks.filter((check) => check.passed).length;
}

export async function extractPassportText(imageFile) {
  if (!imageFile) {
    throw new Error("Passport image is required.");
  }

  const worker = await createWorker("eng");

  try {
    const originalResult = await worker.recognize(imageFile);
    const originalText = originalResult.data.text.trim();

    let best = {
      text: originalText,
      confidence: originalResult.data.confidence,
      preprocessing: "original",
      score: scoreText(originalText),
    };

    let attempts = 1;

    if (best.score < MAX_SCORE) {
      const croppedImages = await preprocessMRZRegion(imageFile);

      if (croppedImages?.length) {
        await worker.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
          tessedit_pageseg_mode: "6",
        });

        for (const crop of croppedImages) {
          const result = await worker.recognize(crop.image);
          attempts++;

          const text = result.data.text.trim();
          const score = scoreText(text);

          if (score > best.score) {
            best = {
              text,
              confidence: result.data.confidence,
              preprocessing: crop.preprocessing,
              score,
            };
          }

          // Stop early only when all seven checks pass.
          if (best.score === MAX_SCORE) break;
        }
      }
    }

    return { ...best, attempts };
  } finally {
    await worker.terminate();
  }
}

// ==================================================
// 3. MRZ: FIND AND REBUILD THE TWO TD3 LINES
// ==================================================

function normalizeMRZCandidate(line) {
  return line
    .toUpperCase()
    .replace(/\s/g, "")
    .replace(/[^A-Z0-9<]/g, "");
}

const TO_DIGIT = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  B: "8",
  G: "6",
};

const toDigits = (value) =>
  [...value].map((char) => TO_DIGIT[char] ?? char).join("");

const CONFUSABLES = {
  "0": ["O", "Q", "D"],
  O: ["0"],
  Q: ["0"],
  D: ["0"],
  "1": ["I", "L"],
  I: ["1"],
  L: ["1"],
  "2": ["Z"],
  Z: ["2"],
  "5": ["S"],
  S: ["5"],
  "8": ["B"],
  B: ["8"],
  "6": ["G"],
  G: ["6"],
};

function repairByCheckDigit(value, expectedDigit, maxSwaps = 3) {
  if (calculateCheckDigit(value) === expectedDigit) {
    return value;
  }

  const chars = [...value];

  function search(start, swapsLeft) {
    if (swapsLeft === 0) return null;

    for (let i = start; i < chars.length; i++) {
      const original = chars[i];

      for (const alternative of CONFUSABLES[original] ?? []) {
        chars[i] = alternative;

        if (calculateCheckDigit(chars.join("")) === expectedDigit) {
          return chars.join("");
        }

        const deeper = search(i + 1, swapsLeft - 1);

        if (deeper) return deeper;
      }

      chars[i] = original;
    }

    return null;
  }

  return search(0, maxSwaps);
}

const LINE2_RE =
  /([0-9<])([A-Z]{3})([0-9OQDILZSBG]{6})([0-9OQDILZSBG])([MF<])([0-9OQDILZSBG]{6})([0-9OQDILZSBG])/g;

function rebuildLine2(norm) {
  for (const match of norm.matchAll(LINE2_RE)) {
    if (match.index < 8) continue;

    const prefix = norm.slice(0, match.index);
    const docCheck = toDigits(match[1]);

    const windows = [
      ...new Set([
        prefix.slice(0, 9).padEnd(9, "<"),
        prefix.slice(-9).padStart(9, "<"),
      ]),
    ];

    let docNumber = windows[0];

    if (/^[0-9]$/.test(docCheck)) {
      for (const candidate of windows) {
        const repaired = repairByCheckDigit(candidate, docCheck);

        if (repaired) {
          docNumber = repaired;
          break;
        }
      }
    }

    const tail = norm.slice(match.index + match[0].length);

    const composite = toDigits(tail.slice(-1) || "<");
    const personalRaw = tail.slice(0, -1);

    const emptyPersonal = /^[KLCSE<]*$/.test(personalRaw);

    const personal = emptyPersonal
      ? "<".repeat(14)
      : personalRaw.slice(0, 14).padEnd(14, "<");

    const personalCheck = emptyPersonal
      ? "<"
      : toDigits(personalRaw[14] ?? "<");

    return (
      docNumber +
      docCheck +
      match[2] +
      toDigits(match[3]) +
      toDigits(match[4]) +
      match[5] +
      toDigits(match[6]) +
      toDigits(match[7]) +
      personal +
      personalCheck +
      composite
    );
  }

  return null;
}

// IMPORTANT:
// Never silently truncate an OCR line to 44 characters.
// If the OCR candidate is too long, reject it and try another crop.

function rebuildLine1(norm) {
  const start = norm.indexOf("P<");

  if (start === -1) return null;

  const candidate = norm.slice(start);

  if (candidate.length > 44) {
    return null;
  }

  if (candidate.length < 30) {
    return null;
  }

  let line = candidate;

  // Normalize filler look-alikes only in a trailing run.
  line = line.replace(/[KLCSEG<]{3,}$/, (run) => "<".repeat(run.length));

  return line.padEnd(44, "<");
}

function fixIssuingState(line1, nationality) {
  // Do not guess a missing issuing state.
  // It must be read from the document itself.
  return line1;
}

export function extractMRZLines(ocrText) {
  if (typeof ocrText !== "string" || !ocrText.trim()) {
    return {
      success: false,
      lines: [],
      error: "No OCR text was provided.",
    };
  }

  const rawLines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let line1 = null;
  let line2 = null;

  for (const rawLine of rawLines) {
    const norm = normalizeMRZCandidate(rawLine);

    if (!line1) {
      const start = norm.indexOf("P<");

      if (start !== -1 && norm.length - start >= 30) {
        line1 = rebuildLine1(norm);
      }
    }

    if (!line2) {
      line2 = rebuildLine2(norm);
    }
  }

  if (!line1 || !line2) {
    return {
      success: false,
      lines: [line1, line2].filter(Boolean),
      error:
        "Could not reliably extract two 44-character TD3 MRZ lines. Try a clearer, properly framed passport image.",
    };
  }

  line1 = fixIssuingState(line1, line2.slice(10, 13));

  const structurallyValid =
    line1.length === 44 &&
    line2.length === 44 &&
    /^P<[A-Z]{3}/.test(line1) &&
    /^[A-Z0-9<]{44}$/.test(line1) &&
    /^[A-Z0-9<]{44}$/.test(line2) &&
    /^[A-Z]{3}$/.test(line2.slice(10, 13)) &&
    /^[0-9]{6}$/.test(line2.slice(13, 19)) &&
    /^[0-9]{6}$/.test(line2.slice(21, 27));

  if (!structurallyValid) {
    return {
      success: false,
      lines: [line1, line2],
      error: "Extracted text does not match the expected TD3 MRZ structure.",
    };
  }

  return {
    success: true,
    lines: [line1, line2],
    error: null,
  };
}

// ==================================================
// 4. ICAO: CALCULATE CHECK DIGIT
// ==================================================

export function calculateCheckDigit(value) {
  const weights = [7, 3, 1];
  let sum = 0;

  for (let i = 0; i < value.length; i++) {
    const character = value[i];
    let number;

    if (character >= "0" && character <= "9") {
      number = Number(character);
    } else if (character >= "A" && character <= "Z") {
      number = character.charCodeAt(0) - 55;
    } else if (character === "<") {
      number = 0;
    } else {
      throw new Error(
        `Invalid MRZ character "${character}" at position ${i + 1}.`
      );
    }

    sum += number * weights[i % 3];
  }

  return String(sum % 10);
}

// ==================================================
// 5. VALIDATE CHECK DIGITS AND DATES
// ==================================================

function validateCheckDigit(label, value, actualDigit) {
  try {
    const expectedDigit = calculateCheckDigit(value);

    const emptyField =
      /^<+$/.test(value) && actualDigit === "<";

    return {
      label,
      passed:
        emptyField ||
        (/^[0-9]$/.test(actualDigit) && expectedDigit === actualDigit),
      expected: expectedDigit,
      actual: actualDigit,
    };
  } catch (error) {
    return {
      label,
      passed: false,
      expected: null,
      actual: actualDigit,
      error: error.message,
    };
  }
}

export function isValidYYMMDD(value) {
  if (!/^\d{6}$/.test(value)) return false;

  const year = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  return [1900 + year, 2000 + year].some((fullYear) => {
    const date = new Date(Date.UTC(fullYear, month - 1, day));

    return (
      date.getUTCFullYear() === fullYear &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  });
}

// ==================================================
// 6. VALIDATE TD3 PASSPORT MRZ
// ==================================================

export function validateMRZ(lines) {
  if (
    !Array.isArray(lines) ||
    lines.length !== 2 ||
    lines.some((line) => typeof line !== "string")
  ) {
    return {
      success: false,
      status: "unable",
      errors: ["Exactly two MRZ lines are required."],
      fields: null,
      checks: [],
    };
  }

  const [line1, line2] = lines;

  if (
    line1.length !== 44 ||
    line2.length !== 44 ||
    !/^[A-Z0-9<]{44}$/.test(line1) ||
    !/^[A-Z0-9<]{44}$/.test(line2) ||
    !/^P<[A-Z]{3}/.test(line1)
  ) {
    return {
      success: false,
      status: "unable",
      errors: [
        "OCR output does not match the expected TD3 passport MRZ structure.",
      ],
      fields: null,
      checks: [],
    };
  }

  const documentType = line1.slice(0, 2);
  const issuingState = line1.slice(2, 5);
  const nameParts = line1.slice(5).split("<<");

  const surname = nameParts[0].replace(/</g, " ").trim();
  const givenNames = nameParts
    .slice(1)
    .join("<<")
    .replace(/</g, " ")
    .trim();

  const documentNumber = line2.slice(0, 9);
  const documentNumberDigit = line2[9];

  const nationality = line2.slice(10, 13);
  const dateOfBirth = line2.slice(13, 19);
  const dateOfBirthDigit = line2[19];

  const sex = line2[20];
  const expiryDate = line2.slice(21, 27);
  const expiryDateDigit = line2[27];

  const personalNumber = line2.slice(28, 42);
  const personalNumberDigit = line2[42];
  const compositeDigit = line2[43];

  const compositeInput =
    line2.slice(0, 10) +
    line2.slice(13, 20) +
    line2.slice(21, 43);

  const checks = [
    validateCheckDigit(
      "Passport number",
      documentNumber,
      documentNumberDigit
    ),
    validateCheckDigit(
      "Date of birth",
      dateOfBirth,
      dateOfBirthDigit
    ),
    validateCheckDigit(
      "Expiry date",
      expiryDate,
      expiryDateDigit
    ),
    validateCheckDigit(
      "Personal number",
      personalNumber,
      personalNumberDigit
    ),
    validateCheckDigit(
      "Composite check digit",
      compositeInput,
      compositeDigit
    ),
  ];

  const dateChecks = [
    {
      label: "Date of birth format",
      passed: isValidYYMMDD(dateOfBirth),
    },
    {
      label: "Expiry date format",
      passed: isValidYYMMDD(expiryDate),
    },
  ];

  const errors = [
    ...checks
      .filter((check) => !check.passed)
      .map((check) => `${check.label} is invalid or could not be calculated.`),
    ...dateChecks
      .filter((check) => !check.passed)
      .map((check) => `${check.label} is invalid.`),
  ];

  const allChecksPassed =
    checks.every((check) => check.passed) &&
    dateChecks.every((check) => check.passed);

  return {
    success: true,
    status: allChecksPassed ? "pass" : "fail",
    fields: {
      documentType,
      issuingState,
      surname,
      givenNames,
      documentNumber: documentNumber.replace(/<+$/g, ""),
      nationality,
      dateOfBirth,
      sex,
      expiryDate,
      personalNumber: personalNumber.replace(/<+$/g, ""),
    },
    checks: [...checks, ...dateChecks],
    errors,
    note: "MRZ consistency checks do not establish passport authenticity.",
  };
}

// ==================================================
// 7. COMPLETE MRZ ANALYSIS PIPELINE
// ==================================================

export async function analyzePassportMRZ(imageFile) {
  const ocr = await extractPassportText(imageFile);
  const extracted = extractMRZLines(ocr.text);

  if (!extracted.success) {
    return {
      success: false,
      status: "unable",
      ocrConfidence: ocr.confidence,
      rawText: ocr.text,
      lines: extracted.lines,
      fields: null,
      checks: [],
      errors: [extracted.error],
      preprocessing: ocr.preprocessing,
      attempts: ocr.attempts,
    };
  }

  const validation = validateMRZ(extracted.lines);

  return {
    ...validation,
    ocrConfidence: ocr.confidence,
    rawText: ocr.text,
    lines: extracted.lines,
    preprocessing: ocr.preprocessing,
    attempts: ocr.attempts,
  };
}
