"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createVerificationResult } from "@/lib/verification/result";
import { saveVerificationResult } from "@/lib/verification/store";
import { analyzePassportMRZ } from "@/lib/verification/mrz.mjs";
import { analyzeTampering } from "@/lib/verification/tampering.mjs";
import PassportCropModal from "@/components/PassportCropModal";

const STEPS = [
  { id: "extract", label: "Extract", hint: "Read MRZ and printed text" },
  { id: "validate", label: "Validate", hint: "Check digits, dates, reference data" },
  { id: "tamper", label: "Tampering", hint: "ELA, regions, metadata" },
  { id: "face", label: "Face match", hint: "Document photo vs selfie" },
  { id: "score", label: "Risk score", hint: "Combine flags and reasons" },
  { id: "log", label: "Audit log", hint: "Write to audit chain" },
];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_MB = 10;
const idleStatuses = () =>
  Object.fromEntries(STEPS.map((step) => [step.id, "idle"]));

function addReason(layer, message) {
  if (!layer || !message) return;
  if (!Array.isArray(layer.reasons)) layer.reasons = [];
  if (!layer.reasons.includes(message)) layer.reasons.push(message);
}

function getAnalysisResult(analysis) {
  return analysis?.result ?? analysis?.validation ?? analysis ?? {};
}

function getAnalysisFields(analysis, validation) {
  return analysis?.fields ?? validation?.fields ?? null;
}

async function runStep(id, report, passportFile) {
  const layerByStep = {
    extract: "mrz",
    validate: "rules",
    tamper: "tampering",
    face: "face",
    log: "record",
  };
  const layer = report.layers?.[layerByStep[id]];

  console.group(`[VERIFY] ${id.toUpperCase()}`);
  try {
    if (id === "extract" || id === "validate") {
      if (!passportFile) throw new Error("Passport image is missing.");

      let analysis = report.mrzAnalysis;
      if (id === "extract" || !analysis) {
        console.log("[MRZ] Starting OCR analysis", {
          name: passportFile.name,
          type: passportFile.type,
          size: passportFile.size,
        });
        analysis = await analyzePassportMRZ(passportFile);
        report.mrzAnalysis = analysis;
        console.log("[MRZ] Analysis result:", analysis);
      }

      const validation = getAnalysisResult(analysis);
      const fields = getAnalysisFields(analysis, validation);

      if (id === "extract") {
        report.document.extractedFields = fields
          ? {
              surname: fields.surname ?? null,
              givenNames: fields.givenNames ?? null,
              dateOfBirth: fields.dateOfBirth ?? null,
              expiryDate: fields.expiryDate ?? null,
              nationality: fields.nationality ?? null,
            }
          : {
              surname: null,
              givenNames: null,
              dateOfBirth: null,
              expiryDate: null,
              nationality: null,
            };

        if (layer) {
          layer.status = fields ? "pass" : "unable";
          addReason(
            layer,
            fields
              ? "MRZ fields were extracted locally using OCR."
              : "OCR could not extract reliable passport MRZ fields."
          );
        }
        console.log("[MRZ] Extraction status:", fields ? "done" : "unable");
        return fields ? "done" : "unable";
      }

      const passed =
        validation.success === true || validation.status === "pass";

      if (layer) {
        layer.status = passed ? "pass" : "fail";
        const checks = Array.isArray(validation.checks)
          ? validation.checks
          : [];
        const errors = Array.isArray(validation.errors)
          ? validation.errors
          : [];

        addReason(
          layer,
          passed
            ? "MRZ validation completed successfully."
            : "MRZ validation did not pass."
        );

        checks.forEach((check) => {
          if (typeof check === "string") {
            addReason(layer, check);
          } else if (check && typeof check === "object") {
            const description =
              check.name ??
              check.label ??
              check.message ??
              check.description;
            if (description) {
              const checkPassed =
                check.success === true ||
                check.valid === true ||
                check.passed === true;
              addReason(
                layer,
                `${description}${checkPassed ? " — passed" : ""}`
              );
            }
          }
        });

        errors.forEach((error) =>
          addReason(
            layer,
            typeof error === "string" ? error : JSON.stringify(error)
          )
        );
      }

      report.referenceData.status = "not_checked";
      console.log("[MRZ] Validation result:", {
        passed,
        validation,
        fields,
      });
      return passed ? "done" : "unable";
    }

    if (id === "tamper") {
      console.group("🔍 STEP 3 — TAMPERING ANALYSIS");
      try {
        console.log("[STEP 3] Started");
        console.log("[STEP 3] File:", passportFile?.name);
        console.log("[STEP 3] Type:", passportFile?.type);
        console.log("[STEP 3] Size:", passportFile?.size, "bytes");

        if (!passportFile) {
          if (layer) {
            layer.status = "unable";
            addReason(layer, "Passport image is missing.");
          }
          console.error("[STEP 3] No passport image!");
          return "unable";
        }

        console.time("[STEP 3] Analysis duration");
        console.log("[STEP 3] Calling analyzeTampering()...");
        const analysis = await analyzeTampering(passportFile);
        console.timeEnd("[STEP 3] Analysis duration");

        console.log("[STEP 3] Analysis returned:", analysis);
        console.log("[STEP 3] Status:", analysis?.status);
        console.log("[STEP 3] Metrics:", analysis?.metrics);
        console.log("[STEP 3] ELA:", analysis?.ela);
        console.log("[STEP 3] Findings:", analysis?.findings);
        console.log("[STEP 3] Quality warnings:", analysis?.qualityWarnings);
        console.log("[STEP 3] Notes:", analysis?.notes);

        report.tamperingAnalysis = analysis;

        if (layer) {
          layer.status = analysis?.status === "suspicious" ? "fail" : "unable";
          addReason(layer, `Tampering analysis status: ${analysis?.status ?? "unknown"}`);
          analysis?.findings?.forEach((finding) => addReason(layer, finding));
          analysis?.qualityWarnings?.forEach((warning) =>
            addReason(layer, `Image quality warning: ${warning}`)
          );
          analysis?.notes?.forEach((note) => addReason(layer, note));
          analysis?.indicators?.forEach((indicator) =>
            addReason(layer, `Tampering indicator: ${indicator}`)
          );
        }

        console.log("[STEP 3] Finished");
        return analysis?.status ?? "unable";
      } catch (error) {
        console.error("[STEP 3] FAILED:", error);
        throw error;
      } finally {
        console.groupEnd();
      }
    }

    if (id === "face") {
      if (layer) {
        layer.status = "unable";
        addReason(
          layer,
          "Face detection and passport-photo-to-selfie matching are not implemented yet."
        );
      }
      console.warn("[FACE] Not implemented; marking unable.");
      return "unable";
    }

    if (id === "score") {
      report.risk.score = null;
      report.risk.level = "pending";
      addReason(
        report.risk,
        "Risk scoring is unavailable until the required verification checks are implemented."
      );
      console.warn("[RISK] Scoring not implemented; marking unable.");
      return "unable";
    }

    if (id === "log") {
      report.audit.status = "not_written";
      addReason(
        report.audit,
        "A persistent hash-chained audit log is not implemented yet."
      );
      console.warn("[AUDIT] Persistent audit log not implemented.");
      return "unable";
    }

    return "unable";
  } finally {
    console.groupEnd();
  }
}

function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export default function CheckDocumentPage() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [passportFile, setPassportFile] = useState(null);
  const [passportUrl, setPassportUrl] = useState(null);
  const [passportError, setPassportError] = useState(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [croppedPassportFace, setCroppedPassportFace] = useState(null);
  const [dragging, setDragging] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState(idleStatuses);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    return () => {
      if (passportUrl) URL.revokeObjectURL(passportUrl);
    };
  }, [passportUrl]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  function acceptPassport(file) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPassportError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setPassportError(`Image is larger than ${MAX_FILE_MB} MB. Use a smaller scan.`);
      return;
    }

    setPassportError(null);
    setFormError(null);
    setPassportFile(file);
    setPassportUrl(URL.createObjectURL(file));
    setCroppedPassportFace(null);
    setStatuses(idleStatuses());
    setCropModalOpen(true);
  }

  function clearPassport() {
    setCropModalOpen(false);
    setPassportFile(null);
    setPassportUrl(null);
    setCroppedPassportFace(null);
    setPassportError(null);
    setFormError(null);
    setStatuses(idleStatuses());
  }

  async function startCamera() {
    setCameraError(null);
    setSelfie(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (error) {
      console.error("[CAMERA] Could not start camera:", error);
      setCameraError(
        "Camera is blocked or unavailable. Allow camera access in your browser and try again."
      );
    }
  }

  function captureSelfie() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (context) context.drawImage(video, 0, 0);
    setSelfie(canvas.toDataURL("image/jpeg", 0.92));
    setFormError(null);
    stopCamera();
  }

  async function runCheck() {
    console.log("========== VERIFICATION START ==========");
    if (!passportFile || !croppedPassportFace || !selfie) {
      setFormError("Upload a passport, confirm its portrait crop, and capture a selfie before running the check.");
      console.warn("[VERIFY] Missing input", {
        passportPresent: Boolean(passportFile),
        croppedPortraitPresent: Boolean(croppedPassportFace),
        selfiePresent: Boolean(selfie),
      });
      return;
    }

    setFormError(null);
    setRunning(true);
    setStatuses(idleStatuses());

    try {
      const report = createVerificationResult();
      console.log("[VERIFY] Report created:", report);
      console.log("[VERIFY] Passport:", {
        name: passportFile.name,
        type: passportFile.type,
        size: passportFile.size,
      });
      console.log("[VERIFY] Starting", STEPS.length, "steps");

      
for (const step of STEPS) {
  console.group(`[VERIFY] Step ${step.id}`);
  setStatuses((previous) => ({
    ...previous,
    [step.id]: "running",
  }));

  try {
    console.log("[VERIFY] Running:", step.label);

    const result = await runStep(step.id, report, passportFile);

    const uiStatus =
      result === "done"
        ? "done"
        : result === "suspicious"
          ? "suspicious"
          : result === "inconclusive"
            ? "inconclusive"
            : "unable";

    console.log("[VERIFY] Result:", result);
    console.log("[VERIFY] UI status:", uiStatus);

    setStatuses((previous) => ({
      ...previous,
      [step.id]: uiStatus,
    }));

    // Navigate after Step 3; do not wait for Steps 4, 5, and 6.
    if (step.id === "tamper") {
      console.log(
        "[VERIFY] Saving partial report after Step 3."
      );

      console.log("[VERIFY] Partial report:", report);
      saveVerificationResult(report);

      console.log("[VERIFY] Navigating to /result");
      router.push("/result");

      return;
    }
  } catch (error) {
    console.error(`[VERIFY] Step ${step.id} failed:`, error);
    setStatuses((previous) => ({
      ...previous,
      [step.id]: "unable",
    }));
    throw error;
  } finally {
    console.groupEnd();
  }
}


      console.log("[VERIFY] Final report:", report);
      saveVerificationResult(report);
      console.log("[VERIFY] Report saved");
      console.log("[VERIFY] Navigating to /result");
      router.push("/result");
    } catch (error) {
      console.error("[VERIFY] RUN FAILED:", error);
      setFormError(error?.message || "Verification failed.");
    } finally {
      setRunning(false);
      console.log("========== VERIFICATION END ==========");
    }
  }

  const ready = Boolean(passportFile && croppedPassportFace && selfie);
  const completedCount = Object.values(statuses).filter((status) =>
    ["done", "suspicious", "inconclusive"].includes(status)
  ).length;

  return (
    <div className="min-h-screen bg-[#050505] font-mono text-[#e8edf2] selection:bg-[#61e294] selection:text-[#050505]">
      <header className="sticky top-0 z-40 border-b border-[#292929] bg-[#050505]/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-[68px] max-w-[1440px] items-center justify-between gap-5 px-5 sm:px-8">
          <a href="/" className="group shrink-0">
            <div className="text-[12px] font-black uppercase tracking-[-0.04em] text-[#e8edf2]">
              Okay<span className="text-[#b0b0b0]">Docs</span>
              <span className="ml-2 text-[12px] font-medium tracking-[0.18em] text-[#8b8b8b]">/ VERIFY</span>
            </div>
            <div className="mt-1 text-[12px] uppercase tracking-[0.16em] text-[#b0b0b0]">Document integrity system</div>
          </a>
          <nav aria-label="Main" className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.12em] sm:gap-6">
            <a href="/" aria-current="page" className="border-b border-[#61e294] py-2 text-[#e8edf2]">Check</a>
            <a href="/history" className="py-2 text-[#b0b0b0] transition hover:text-[#e8edf2]">History</a>
            <a href="/reference" className="hidden py-2 text-[#b0b0b0] transition hover:text-[#e8edf2] sm:block">Reference data</a>
          </nav>
          <div className="hidden items-center gap-2 border border-[#343434] px-3 py-2 sm:flex">
            <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-[#61e294]" : "bg-[#e6a45f]"}`} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#c4c4c4]">{online ? "System online" : "Offline"}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 pb-16 pt-10 sm:px-8 lg:pt-14">
        <section className="grid gap-10 border-b border-[#292929] pb-10 lg:grid-cols-[1fr_300px] lg:items-end">
          <div>
            <div className="mb-5 flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.2em] text-[#b0b0b0]">
              <span>01 / Verification desk</span><span className="h-px w-10 bg-[#484848]" /><span>Local processing</span>
            </div>
            <h1 className="max-w-[900px] text-[clamp(3rem,8vw,7.5rem)] font-black uppercase leading-[0.78] tracking-[-0.085em]">Check a<br /><span className="text-[#8b8b8b]">document.</span></h1>
            <p className="mt-8 max-w-[680px] text-[13px] leading-[1.9] text-[#d0d0d0] sm:text-[12px]">Add a passport image and capture a live selfie to prepare a document verification run. Images are handled in this browser and are not uploaded by this page.</p>
          </div>
          <div className="grid grid-cols-2 border border-[#343434] bg-[#0b0b0b]">
            <Metric label="Input types" value="02" detail="DOCUMENT + SELFIE" />
            <Metric label="Max scan size" value="10 MB" detail="JPG / PNG / WEBP" right />
            <div className="col-span-2 border-t border-[#343434] px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-[12px] uppercase tracking-[0.15em]"><span className="text-[#b0b0b0]">Privacy boundary</span><span className="text-[#61e294]">This device</span></div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 py-8 lg:grid-cols-2">
          <section aria-labelledby="passport-title" className="border border-[#343434] bg-[#0b0b0b]">
            <PanelHeading number="02" title="Passport image" status={passportFile ? "FILE LOADED" : "AWAITING INPUT"} />
            <div className="p-4 sm:p-5">
              {passportUrl ? (
                <div>
                  <div className="relative flex h-[270px] items-center justify-center overflow-hidden border border-[#343434] bg-[#030303] p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={passportUrl} alt="Uploaded passport preview" className="max-h-full max-w-full object-contain" />
                    <span className="absolute left-3 top-3 border border-[#484848] bg-[#050505]/90 px-2 py-1 text-[12px] uppercase tracking-[0.12em] text-[#c4c4c4]">Local preview</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[12px] text-[#c4c4c4]">{passportFile?.name}</p>
                    <button type="button" onClick={clearPassport} disabled={running} className="shrink-0 border border-[#484848] px-3 py-2 text-[13px] font-bold uppercase tracking-[0.12em] text-[#d0d0d0] transition hover:border-[#e6a45f] hover:text-[#e6a45f] disabled:opacity-40">Remove ×</button>
                  </div>
                </div>
              ) : (
                <label onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptPassport(event.dataTransfer.files?.[0]); }} className={`group flex min-h-[270px] cursor-pointer flex-col items-center justify-center border border-dashed px-5 py-8 text-center transition ${dragging ? "border-[#61e294] bg-[#111111]" : "border-[#484848] bg-[#050505] hover:border-[#8b8b8b] hover:bg-[#0d0d0d]"}`}>
                  <span className="mb-6 flex h-12 w-12 items-center justify-center border border-[#484848] text-[22px] text-[#b0b0b0] transition group-hover:border-[#61e294] group-hover:text-[#61e294]">+</span>
                  <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#e8edf2]">Drop passport scan here</span>
                  <span className="mt-3 text-[12px] leading-[1.8] text-[#b8b8b8]">Or click to browse files<br />JPG, PNG, WebP / Up to {MAX_FILE_MB} MB</span>
                  <input type="file" accept={ACCEPTED_TYPES.join(",")} className="sr-only" disabled={running} onChange={(event) => acceptPassport(event.target.files?.[0])} />
                </label>
              )}
              {passportError && <p role="alert" className="mt-3 border-l-2 border-[#e6a45f] bg-[#1c1a18] px-3 py-2 text-[12px] leading-[1.7] text-[#ffd19c]">{passportError}</p>}
              <div className="mt-4 flex items-center justify-between border-t border-[#292929] pt-3 text-[12px] uppercase tracking-[0.12em]"><span className="text-[#b0b0b0]">Input / 01</span><span className={passportFile ? "text-[#61e294]" : "text-[#8b8b8b]"}>{passportFile ? "Ready for checks" : "No file selected"}</span></div>
            </div>
          </section>

          <section aria-labelledby="selfie-title" className="border border-[#343434] bg-[#0b0b0b]">
            <PanelHeading number="03" title="Live selfie" status={selfie ? "CAPTURE SAVED" : cameraOn ? "CAMERA ACTIVE" : "CAMERA OFF"} />
            <div className="p-4 sm:p-5">
              <div className="relative flex h-[270px] items-center justify-center overflow-hidden border border-[#343434] bg-[#030303]">
                <video ref={videoRef} playsInline muted className={`h-full w-full -scale-x-100 object-cover ${cameraOn ? "" : "hidden"}`} />
                {!cameraOn && selfie && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selfie} alt="Captured selfie" className="h-full w-full -scale-x-100 object-cover" />
                )}
                {!cameraOn && !selfie && <div className="px-5 text-center"><div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center border border-[#484848] text-[20px] text-[#8b8b8b]">◉</div><p className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#d0d0d0]">Camera feed inactive</p><p className="mt-2 text-[12px] text-[#b0b0b0]">Start the camera to capture a selfie.</p></div>}
                <span className="absolute left-3 top-3 border border-[#484848] bg-[#050505]/90 px-2 py-1 text-[12px] uppercase tracking-[0.12em] text-[#c4c4c4]">{cameraOn ? "Live feed" : selfie ? "Captured frame" : "No signal"}</span>
                {cameraOn && <span className="absolute right-3 top-3 h-2 w-2 animate-pulse rounded-full bg-[#61e294]" />}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!cameraOn && !selfie && <button type="button" onClick={startCamera} disabled={running} className="border border-[#565656] bg-[#171717] px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#e8edf2] transition hover:border-[#61e294] hover:text-[#61e294] disabled:opacity-40">Start camera →</button>}
                {cameraOn && <><button type="button" onClick={captureSelfie} className="bg-[#61e294] px-4 py-2.5 text-[13px] font-black uppercase tracking-[0.14em] text-[#050505] transition hover:bg-[#8af0ad]">Capture frame ↵</button><button type="button" onClick={stopCamera} className="border border-[#484848] px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#c4c4c4] transition hover:border-[#8b8b8b] hover:text-[#e8edf2]">Cancel</button></>}
                {selfie && !cameraOn && <button type="button" onClick={startCamera} disabled={running} className="border border-[#565656] px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#d0d0d0] transition hover:border-[#61e294] hover:text-[#61e294] disabled:opacity-40">Retake selfie ↻</button>}
              </div>
              {cameraError && <p role="alert" className="mt-3 border-l-2 border-[#e6a45f] bg-[#1c1a18] px-3 py-2 text-[12px] leading-[1.7] text-[#ffd19c]">{cameraError}</p>}
              <div className="mt-4 flex items-center justify-between border-t border-[#292929] pt-3 text-[12px] uppercase tracking-[0.12em]"><span className="text-[#b0b0b0]">Input / 02</span><span className={selfie ? "text-[#61e294]" : "text-[#8b8b8b]"}>{selfie ? "Frame captured" : "Awaiting capture"}</span></div>
            </div>
          </section>
        </section>

        <section aria-labelledby="pipeline-title" className="border-2 border-[#61e294] bg-[#0a0c0a] shadow-[0_0_0_1px_rgba(97,226,148,0.08)]">
          <div className="flex flex-col justify-between gap-5 border-b-2 border-[#304b39] bg-[#101510] px-5 py-6 sm:flex-row sm:items-center sm:px-7">
            <div>
              <div className="mb-3 flex items-center gap-3 text-[12px] font-black uppercase tracking-[0.18em] text-[#61e294]"><span className="inline-flex h-8 w-8 items-center justify-center border border-[#61e294] text-[16px]">✓</span>04 / Verification system</div>
              <h2 id="pipeline-title" className="text-[clamp(1.8rem,4vw,3rem)] font-black uppercase leading-[0.95] tracking-[-0.06em] text-[#f5f7f8]">Verification checks</h2>
              <p className="mt-3 max-w-[620px] text-[13px] leading-6 text-[#c8d0ca]">Six checks. One clear result. Add both inputs, then start the verification run.</p>
            </div>
            <div className="min-w-[220px] border border-[#35513e] bg-[#080b08] p-4">
              <div className="mb-2 flex justify-between text-[12px] uppercase tracking-[0.12em]"><span className="text-[#b0b0b0]">Progress</span><span className="text-[#d0d0d0]">{completedCount} / {STEPS.length}</span></div>
              <div className="h-3 border border-[#35513e] bg-[#050505] p-[2px]"><div className="h-full bg-[#61e294] transition-all duration-300" style={{ width: `${(completedCount / STEPS.length) * 100}%` }} /></div>
            </div>
          </div>

          <ol className="grid sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
            {STEPS.map((step, index) => {
              const status = statuses[step.id];
              const statusText =
                status === "running"
                  ? "Running check..."
                  : status === "done"
                    ? "Complete"
                    : status === "suspicious"
                      ? "Review required — suspicious image indicators"
                      : status === "inconclusive"
                        ? "Analysis completed — result inconclusive"
                        : status === "unable"
                          ? "Unable to verify — check unavailable or unsuccessful"
                          : step.hint;

              return (
                <li key={step.id} className={`border-b border-[#304033] p-5 sm:p-6 ${index % 3 !== 2 ? "lg:border-r lg:border-[#304033]" : ""} ${status === "running" ? "bg-[#142018]" : status === "done" ? "bg-[#0d160f]" : "bg-[#090b09]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="mb-3 text-[12px] font-bold tracking-[0.16em] text-[#8b8b8b]">CHECK / 0{index + 1}</div><div className="text-[16px] font-black uppercase tracking-[0.04em] text-[#f5f7f8]">{step.label}</div></div>
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${status === "done" ? "bg-[#61e294]" : status === "running" ? "animate-pulse bg-[#b0b0b0]" : status === "unable" ? "bg-[#e6a45f]" : status === "suspicious" ? "bg-[#e6a45f]" : status === "inconclusive" ? "bg-[#e6a45f]" : "bg-[#484848]"}`} />
                  </div>
                  <p className={`mt-4 min-h-10 text-[13px] leading-6 ${status === "done" ? "font-bold text-[#61e294]" : status === "unable" || status === "suspicious" || status === "inconclusive" ? "text-[#ffd19c]" : "text-[#d0d8d1]"}`}>{statusText}</p>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-col gap-5 border-t border-[#304b39] bg-[#0c100d] px-5 py-6 sm:flex-row sm:items-center sm:px-7">
            <button type="button" onClick={runCheck} disabled={running || !ready} className="inline-flex min-h-[64px] items-center justify-center gap-5 border-2 border-[#8af0ad] bg-[#61e294] px-8 py-4 text-[14px] font-black uppercase tracking-[0.12em] text-[#050505] shadow-[0_0_28px_rgba(97,226,148,0.12)] transition hover:bg-[#8af0ad] disabled:cursor-not-allowed disabled:border-[#424a44] disabled:bg-[#252925] disabled:text-[#aab3ac] disabled:shadow-none">
              {running ? "Verification running..." : ready ? "Start verification" : "Add both inputs to begin"}<span aria-hidden="true" className="text-[20px]">→</span>
            </button>
            <div className="text-[12px] leading-[1.7] text-[#b8b8b8]">
              {!ready && !running
                ? !passportFile
                  ? "Upload the passport image to continue."
                  : !croppedPassportFace
                    ? "Confirm the passport portrait crop to continue."
                    : !selfie
                      ? "Capture a selfie to continue."
                      : "Complete the required inputs to continue."
                : running
                  ? "The verification sequence is in progress."
                  : "Both inputs and the portrait crop are ready."}
            </div>
            {formError && <p role="alert" className="text-[12px] leading-[1.7] text-[#ffd19c] sm:ml-auto">! {formError}</p>}
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-3 border-t border-[#292929] pt-5 text-[12px] uppercase tracking-[0.15em] text-[#b0b0b0] sm:flex-row sm:items-center sm:justify-between">
          <span>OkayDocs / Document integrity</span><span>Local-first interface / Verification preview</span><span className="text-[#61e294]">● Privacy boundary active</span>
        </footer>
      </main>

      {cropModalOpen && passportUrl && (
        <PassportCropModal
          image={passportUrl}
          onCancel={clearPassport}
          onConfirm={(croppedImage) => {
            setCroppedPassportFace(croppedImage);
            setCropModalOpen(false);
            setFormError(null);
          }}
        />
      )}
    </div>
  );
}

function PanelHeading({ number, title, status }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#343434] px-4 py-4 sm:px-5">
      <div className="flex items-center gap-3"><span className="text-[13px] font-bold tracking-[0.16em] text-[#8b8b8b]">{number}</span><h2 className="text-[13px] font-black uppercase tracking-[0.1em] text-[#e8edf2]">{title}</h2></div>
      <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#b8b8b8]"><span className={`h-1.5 w-1.5 rounded-full ${status === "FILE LOADED" || status === "CAPTURE SAVED" ? "bg-[#61e294]" : status === "CAMERA ACTIVE" ? "animate-pulse bg-[#61e294]" : "bg-[#484848]"}`} />{status}</span>
    </div>
  );
}

function Metric({ label, value, detail, right = false }) {
  return (
    <div className={`p-4 ${right ? "border-l border-[#343434]" : ""}`}>
      <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#b0b0b0]">{label}</div>
      <div className="mt-3 text-[25px] font-black leading-none tracking-[-0.06em] text-[#e8edf2]">{value}</div>
      <div className="mt-2 text-[12px] uppercase tracking-[0.1em] text-[#b8b8b8]">{detail}</div>
    </div>
  );
}