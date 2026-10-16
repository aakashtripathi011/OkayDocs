
let currentResult = null;

export function saveVerificationResult(result) {
  currentResult = result;
}

export function getVerificationResult() {
  return currentResult;
}

export function clearVerificationResult() {
  currentResult = null;
}
