"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { id: "extract", label: "Extract", hint: "Read MRZ and printed text" },
  { id: "validate", label: "Validate", hint: "Check digits, dates, reference data" },
  { id: "tamper", label: "Tampering", hint: "ELA, regions, metadata" },
  { id: "face", label: "Face", hint: "Document photo vs selfie" },
  { id: "score", label: "Score", hint: "Combine flags and reasons" },
  { id: "log", label: "Log", hint: "Write to audit chain" },
];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_MB = 10;

const idleStatuses = () => Object.fromEntries(STEPS.map((s) => [s.id, "idle"]));

/*
  TODO: replace each stub with the real module.
  Each runner should resolve to "done" or "unable".
  Return "unable" when a check could not run (OCR failed, no face found,
  reference data missing). Never treat a missing check as a pass.
*/
async function runStep(id) {
  await new Promise((r) => setTimeout(r, 600));
  void id;
  return "done";
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
      streamRef.current.getTracks().forEach((t) => t.stop());
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
  }

  function clearPassport() {
    setPassportFile(null);
    setPassportUrl(null);
    setPassportError(null);
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
    } catch {
      setCameraError("Camera is blocked or unavailable. Allow camera access in your browser and try again.");
    }
  }

  function captureSelfie() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(video, 0, 0);
    setSelfie(canvas.toDataURL("image/jpeg", 0.92));
    setFormError(null);
    stopCamera();
  }

  async function runCheck() {
    if (!passportFile || !selfie) {
      setFormError("Add a passport image and a selfie before running the check.");
      return;
    }
    setFormError(null);
    setRunning(true);
    setStatuses(idleStatuses());

    for (const step of STEPS) {
      setStatuses((prev) => ({ ...prev, [step.id]: "running" }));
      const result = await runStep(step.id);
      setStatuses((prev) => ({ ...prev, [step.id]: result }));
    }

    /*
      TODO: hand the images and module results to the Result page through an
      in-memory store (React context or Zustand), not sessionStorage.
      Passport images can exceed storage limits and should not be persisted.
    */
    router.push("/result");
  }

  const ready = Boolean(passportFile && selfie);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <span className="text-base font-semibold text-[#0F2A4A]">OkayDocs</span>
          <nav aria-label="Main" className="flex gap-5 text-sm">
            <a href="/" aria-current="page" className="font-medium text-[#0F2A4A]">
              Check
            </a>
            <a href="/history" className="text-slate-500 hover:text-[#0F2A4A]">
              History
            </a>
            <a href="/reference" className="text-slate-500 hover:text-[#0F2A4A]">
              Reference data
            </a>
          </nav>
          <span
            className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
              online ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"
            }`}
          >
            {online ? "Online" : "Offline, using saved reference data"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-[#0F2A4A]">Check a document</h1>
        <p className="mt-1 max-w-xl text-sm text-slate-600">
          Add the passport and a live selfie. Everything is processed in this browser, and images never leave this
          device.
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="passport-title">
            <div className="flex items-center justify-between">
              <h2 id="passport-title" className="text-sm font-medium text-[#0F2A4A]">
                Passport
              </h2>
              {passportFile && (
                <button
                  type="button"
                  onClick={clearPassport}
                  disabled={running}
                  className="text-xs text-slate-500 hover:text-[#0F2A4A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F2A4A]"
                >
                  Remove
                </button>
              )}
            </div>

            {passportUrl ? (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={passportUrl}
                  alt="Uploaded passport preview"
                  className="h-56 w-full rounded-md border border-slate-200 bg-slate-100 object-contain"
                />
                <p className="mt-2 truncate text-xs text-slate-500">{passportFile ? passportFile.name : ""}</p>
              </div>
            ) : (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  acceptPassport(e.dataTransfer.files && e.dataTransfer.files[0]);
                }}
                className={`mt-3 flex h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 text-center text-sm focus-within:outline focus-within:outline-2 focus-within:outline-[#0F2A4A] ${
                  dragging ? "border-[#0F2A4A] bg-slate-100" : "border-slate-300 bg-slate-50"
                }`}
              >
                <span className="font-medium text-slate-700">Drop a passport image here</span>
                <span className="mt-1 text-slate-500">or click to choose a file. JPG, PNG, or WebP up to {MAX_FILE_MB} MB.</span>
                <input
                  type="file"
                  accept={ACCEPTED_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => acceptPassport(e.target.files && e.target.files[0])}
                />
              </label>
            )}
            {passportError && (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {passportError}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="selfie-title">
            <div className="flex items-center justify-between">
              <h2 id="selfie-title" className="text-sm font-medium text-[#0F2A4A]">
                Live selfie
              </h2>
              {selfie && (
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={running}
                  className="text-xs text-slate-500 hover:text-[#0F2A4A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F2A4A]"
                >
                  Retake
                </button>
              )}
            </div>

            <div className="mt-3 flex h-56 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`h-full w-full -scale-x-100 object-cover ${cameraOn ? "" : "hidden"}`}
              />
              {!cameraOn && selfie && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selfie} alt="Captured selfie" className="h-full w-full -scale-x-100 object-cover" />
              )}
              {!cameraOn && !selfie && (
                <p className="px-4 text-center text-sm text-slate-500">Camera is off. Start it to take the selfie.</p>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              {!cameraOn && !selfie && (
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={running}
                  className="rounded-md border border-[#0F2A4A] px-3 py-1.5 text-sm font-medium text-[#0F2A4A] hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2A4A]"
                >
                  Start camera
                </button>
              )}
              {cameraOn && (
                <>
                  <button
                    type="button"
                    onClick={captureSelfie}
                    className="rounded-md bg-[#0F2A4A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#16396a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2A4A]"
                  >
                    Capture
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2A4A]"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
            {cameraError && (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {cameraError}
              </p>
            )}
          </section>
        </div>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="pipeline-title">
          <h2 id="pipeline-title" className="text-sm font-medium text-[#0F2A4A]">
            Checks
          </h2>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-live="polite">
            {STEPS.map((step) => {
              const status = statuses[step.id];
              return (
                <li key={step.id} className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`h-2.5 w-2.5 rounded-full ${
                        status === "done"
                          ? "bg-emerald-600"
                          : status === "running"
                          ? "animate-pulse bg-[#0F2A4A]"
                          : status === "unable"
                          ? "bg-amber-500"
                          : "bg-slate-300"
                      }`}
                    />
                    <span className="text-sm font-medium text-slate-800">{step.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {status === "unable"
                      ? "Unable to verify"
                      : status === "running"
                      ? "Running"
                      : status === "done"
                      ? "Done"
                      : step.hint}
                  </p>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runCheck}
              disabled={running}
              className="rounded-md bg-[#0F2A4A] px-5 py-2 text-sm font-medium text-white hover:bg-[#16396a] disabled:cursor-wait disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2A4A]"
            >
              {running ? "Checking" : "Run check"}
            </button>
            {!ready && !running && (
              <span className="text-xs text-slate-500">
                {!passportFile && !selfie
                  ? "Add a passport image and a selfie to start."
                  : !passportFile
                  ? "Add a passport image to start."
                  : "Take a selfie to start."}
              </span>
            )}
            {formError && (
              <span role="alert" className="text-xs text-red-700">
                {formError}
              </span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}