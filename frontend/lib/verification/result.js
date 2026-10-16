
export const CHECK_STATUS = {
  PENDING: "pending",
  PASS: "pass",
  FLAG: "flag",
  FAIL: "fail",
  UNABLE: "unable",
};

export function createLayerResult(name) {
  return {
    name,
    status: CHECK_STATUS.PENDING,
    score: null,
    flags: [],
    reasons: [],
    details: {},
  };
}

export function createVerificationResult() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),

    document: {
      countryCode: null,
      documentType: "passport",
      extractedFields: {
        surname: null,
        givenNames: null,
        dateOfBirth: null,
        expiryDate: null,
        nationality: null,
      },
    },

    layers: {
      mrz: createLayerResult("MRZ check"),
      rules: createLayerResult("Rules check"),
      tampering: createLayerResult("Tampering check"),
      face: createLayerResult("Face match"),
      record: createLayerResult("Audit record"),
    },

    risk: {
      score: null,
      level: "pending",
      flags: [],
      reasons: [],
    },

    referenceData: {
      status: "not_checked",
      countryCode: null,
      sourceUrl: null,
      fetchedAt: null,
      flags: [],
    },

    decision: "pending",

    audit: {
      previousHash: null,
      entryHash: null,
      status: "not_written",
    },
  };
}
