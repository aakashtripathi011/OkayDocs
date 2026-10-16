
import {
  extractPassportText,
  extractMRZLines,
  validateMRZ,
  analyzePassportMRZ,
  calculateCheckDigit,
} from "../lib/verification/mrz.mjs";


const imagePath = "tests/p.webp";

console.log("\n===== TEST 1: CHECK DIGIT =====");
console.log(
  "Expected 6, got:",
  (await import("../lib/verification/mrz.mjs"))
    .calculateCheckDigit("L898902C3")
);

console.log("\n===== TEST 2: OCR + MRZ =====");

const ocr = await extractPassportText(imagePath);

console.log("OCR confidence:", ocr.confidence);
console.log("Preprocessing:", ocr.preprocessing);
console.log("Raw text:\n", ocr.text);

console.log("\n===== TEST 3: EXTRACT MRZ =====");

const extracted = extractMRZLines(ocr.text);

console.log("Detected lines:", extracted.lines);
console.log("Extraction successful:", extracted.success);

console.log("\n===== TEST 4: VALIDATE MRZ =====");

if (extracted.success) {
  console.log(
    JSON.stringify(validateMRZ(extracted.lines), null, 2)
  );
} else {
  console.log("Unable to validate:", extracted.error);
}

console.log("\n===== TEST 5: COMPLETE MRZ PIPELINE =====");

const result = await analyzePassportMRZ(imagePath);

console.log("Final status:", result.status);
console.log("Fields:", result.fields);
console.log("Errors:", result.errors);


console.log("\n===== TEST: CALENDAR VALIDATION =====");

const dateTests = [
  ["000229", true],  // 29 Feb 2000: leap year
  ["010229", false], // 29 Feb 2001: not a leap year
  ["230231", false], // 31 Feb: impossible
  ["350901", true],  // 1 Sep 2035
  ["231300", false], // Invalid month
];

for (const [date, expected] of dateTests) {
  // Temporarily test through validateMRZ or export
  // isValidYYMMDD from mrz.mjs for direct unit tests.
  console.log(date, "expected:", expected);
}
const lines = ocr.text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

console.log(
  "MRZ-like line lengths:",
  lines
    .filter((line) => /[<A-Z0-9]{20,}/.test(line))
    .map((line) => ({
      length: line.length,
      text: line,
    }))
);