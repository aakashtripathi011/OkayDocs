
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getVerificationResult } from "@/lib/verification/store";

const layerConfig = [
  {
    key: "mrz",
    number: "01",
    name: "MRZ extraction",
    description: "Reading document data",
    icon: "⌗",
  },
  {
    key: "rules",
    number: "02",
    name: "Document validation",
    description: "Checking field consistency",
    icon: "◈",
  },
  {
    key: "tampering",
    number: "03",
    name: "Tamper detection",
    description: "Inspecting image integrity",
    icon: "⟁",
  },
  {
    key: "face",
    number: "04",
    name: "Face comparison",
    description: "Comparing portrait images",
    icon: "◎",
  },
  {
    key: "record",
    number: "05",
    name: "Audit record",
    description: "Recording verification event",
    icon: "↗",
  },
];

function formatStatus(status) {
  const labels = {
    pending: "WAITING",
    idle: "NOT RUN",
    pass: "PASSED",
    done: "COMPLETE",
    flag: "FLAGGED",
    fail: "FAILED",
    suspicious: "SUSPICIOUS",
    inconclusive: "INCONCLUSIVE",
    unable: "UNAVAILABLE",
    not_written: "NOT RECORDED",
    not_checked: "NOT CHECKED",
    written: "RECORDED",
  };

  return labels[status] || "WAITING";
}

function statusStyle(status) {
  if (status === "pass" || status === "done") {
    return "border-lime-300/25 bg-lime-300/[0.07] text-lime-300";
  }

  if (
    ["flag", "fail", "suspicious"].includes(status)
  ) {
    return "border-red-400/25 bg-red-400/[0.07] text-red-300";
  }

  if (status === "unable" || status === "inconclusive") {
    return "border-orange-300/20 bg-orange-300/[0.05] text-orange-200";
  }

  return "border-white/10 bg-white/[0.03] text-zinc-500";
}

function formatDate(value) {
  if (!value) return "DATE UNAVAILABLE";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "DATE UNAVAILABLE";
  }

  return date.toLocaleString();
}

function getRiskLevel(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "UNRATED";
  }

  if (score >= 70) return "HIGH";
  if (score >= 35) return "MEDIUM";

  return "LOW";
}

function getAssessment(report) {
  if (!report) return "No report found";

  const layers = Object.values(report.layers || {});
  const statuses = layers.map((layer) => layer?.status);

  if (
    statuses.some((status) =>
      ["fail", "flag", "suspicious"].includes(status)
    )
  ) {
    return "Needs a closer look";
  }

  if (
    statuses.some((status) =>
      [
        "unable",
        "pending",
        "idle",
        "inconclusive",
        "not_checked",
      ].includes(status)
    )
  ) {
    return "Partially verified";
  }

  if (
    statuses.length > 0 &&
    statuses.every((status) => ["pass", "done"].includes(status))
  ) {
    return "Checks completed";
  }

  return "Partially verified";
}

function getRiskTheme(level) {
  if (level === "HIGH") {
    return {
      text: "text-red-300",
      border: "border-red-400/20",
      glow: "rgba(248,113,113,0.13)",
      stroke: "#f87171",
    };
  }

  if (level === "MEDIUM") {
    return {
      text: "text-amber-200",
      border: "border-amber-300/20",
      glow: "rgba(252,211,77,0.10)",
      stroke: "#fcd34d",
    };
  }

  if (level === "LOW") {
    return {
      text: "text-lime-300",
      border: "border-lime-300/20",
      glow: "rgba(190,242,100,0.12)",
      stroke: "#bef264",
    };
  }

  return {
    text: "text-zinc-400",
    border: "border-white/10",
    glow: "rgba(255,255,255,0.03)",
    stroke: "#71717a",
  };
}

export default function ResultPage() {
  const searchParams = useSearchParams();
  const recordId = searchParams.get("id");

  const [report, setReport] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [activeLayer, setActiveLayer] = useState(null);

  useEffect(() => {
    let savedReport = null;

    try {
      savedReport = getVerificationResult();
    } catch (error) {
      console.error("Unable to load verification report:", error);
    }

    if (
      savedReport &&
      (!recordId || String(savedReport.id) === String(recordId))
    ) {
      setReport(savedReport);
    } else {
      setReport(null);
    }

    setLoaded(true);
  }, [recordId]);

  const checks = useMemo(() => {
    return layerConfig.map((config) => {
      const layer = report?.layers?.[config.key];

      return {
        ...config,
        status: layer?.status || "pending",
        reasons: Array.isArray(layer?.reasons)
          ? layer.reasons
          : [],
        flags: Array.isArray(layer?.flags)
          ? layer.flags
          : [],
      };
    });
  }, [report]);

  const findings = useMemo(() => {
    if (!report) return [];

    return Object.entries(report.layers || {}).flatMap(
      ([key, layer]) => {
        if (!layer) return [];

        const reasons = Array.isArray(layer.reasons)
          ? layer.reasons
          : [];

        const flags = Array.isArray(layer.flags)
          ? layer.flags
          : [];

        return [
          ...reasons.map((description, index) => ({
            id: `${key}-reason-${index}`,
            title: layer.name || key,
            description,
            status: layer.status || "pending",
          })),
          ...flags.map((description, index) => ({
            id: `${key}-flag-${index}`,
            title: `${layer.name || key} / FLAG`,
            description,
            status: layer.status || "flag",
          })),
        ];
      }
    );
  }, [report]);

  const riskScore = report?.risk?.score;
  const riskLevel = getRiskLevel(riskScore);
  const riskTheme = getRiskTheme(riskLevel);
  const assessment = getAssessment(report);

  const passedCount = checks.filter(
    (check) => ["pass", "done"].includes(check.status)
  ).length;

  const flaggedCount = checks.filter((check) =>
    ["flag", "fail", "suspicious"].includes(check.status)
  ).length;

  const resolvedCount = checks.filter(
    (check) =>
      !["pending", "idle"].includes(check.status)
  ).length;

  const progress = Math.round(
    (resolvedCount / checks.length) * 100
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-4 py-5 font-mono text-zinc-100 sm:px-6 md:px-10">
      <style jsx global>{`
        @keyframes result-enter {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes scan-line {
          0% {
            transform: translateY(-120%);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          88% {
            opacity: 1;
          }
          100% {
            transform: translateY(420%);
            opacity: 0;
          }
        }

        @keyframes pulse-dot {
          0%, 100% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(190, 242, 100, 0.25);
          }
          50% {
            opacity: 0.65;
            box-shadow: 0 0 0 5px rgba(190, 242, 100, 0);
          }
        }

        @keyframes ring-in {
          from {
            stroke-dashoffset: 283;
          }
        }

        .result-enter {
          animation: result-enter 0.55s ease-out both;
        }

        .result-delay-1 {
          animation-delay: 0.08s;
        }

        .result-delay-2 {
          animation-delay: 0.16s;
        }

        .result-delay-3 {
          animation-delay: 0.24s;
        }

        .scan-line {
          animation: scan-line 3.5s ease-in-out infinite;
        }

        .pulse-dot {
          animation: pulse-dot 2s ease-in-out infinite;
        }

        .risk-ring {
          animation: ring-in 1.1s ease-out both;
        }

        ::selection {
          background: #bef264;
          color: #08090a;
        }

        /* PURE BLACK EDITORIAL UI — visual styling only */
        /* Remove all ambient glow/grid/line layers behind the page content. */
        main.relative.min-h-screen > .pointer-events-none.absolute.inset-0 { display: none !important; }
        main.relative.min-h-screen {
          background: #000 !important;
          background-image: none !important;
          color: #f5f0ec !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace !important;
        }
        main * { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace !important; }
        main .relative.mx-auto::before { content: none !important; display: none !important; }
        main [class*="text-zinc-"] { color: #a7a09b !important; }
        main [class*="text-white"], main [class*="text-zinc-100"],
        main [class*="text-zinc-200"], main [class*="text-zinc-300"] { color: #f5f0ec !important; }
        main [class*="text-lime-"] { color: #d4c5a5 !important; }
        main [class*="border-white/"], main [class*="border-white["] { border-color: transparent !important; }
        main [class*="bg-white/"] { background-color: #111 !important; }
        main [class*="bg-black"], main.relative.min-h-screen { background-color: #000 !important; }
        main [class*="bg-[#101211]"], main [class*="bg-[#121513]"] { background-color: #111 !important; }
        main [class*="bg-lime-300"] { background-color: #8d263b !important; }
        main [class*="text-black"] { color: #fff !important; }
        main [class*="border-lime-"] { border-color: rgba(212,197,165,.32) !important; }
        main [class*="border-red-"] { border-color: rgba(226,112,126,.38) !important; }
        main [class*="border-amber-"], main [class*="border-orange-"] { border-color: rgba(226,155,91,.38) !important; }
        main .rounded-3xl, main .rounded-2xl { border-radius: 5px !important; }
        main .rounded-xl { border-radius: 4px !important; }
        main .rounded-full { border-radius: 999px !important; }
        main .rounded-3xl, main .rounded-2xl, main .rounded-xl { box-shadow: none !important; }
        main header { border-color: transparent !important; }
        main header a > div:first-child { background: #8d263b !important; border: 0 !important; box-shadow: none !important; }
        main header nav a, main footer a { color: #a7a09b !important; }
        main header nav a:hover, main footer a:hover { color: #fff !important; }
        main .pulse-dot { background-color: #d4c5a5 !important; }
        main .scan-line { display: none !important; }
        main .risk-ring { filter: none !important; }
        main .bg-lime-300, main a.bg-lime-300, main button.bg-lime-300 {
          background-color: #8d263b !important; color: #fff !important;
          border: 0 !important; box-shadow: none !important;
        }
        main a.bg-lime-300:hover, main button.bg-lime-300:hover { background-color: #a33149 !important; }
        main button[class*="border-lime-300"] { background-color: #17120f !important; }
        main button[class*="border-white/"] { background-color: #101010 !important; }
        main button:focus-visible, main a:focus-visible { outline: 2px solid #d4a0a6 !important; outline-offset: 4px; }
        main [class*="text-red-"] { color: #ff9ca5 !important; }
        main [class*="bg-red-"] { background-color: #241014 !important; }
        main [class*="text-amber-"], main [class*="text-orange-"] { color: #f2b67e !important; }
        main [class*="bg-amber-"], main [class*="bg-orange-"] { background-color: #21150d !important; }
        main [class*="bg-lime-300/"] { background-color: #17180f !important; }
        main .text-5xl { font-size: clamp(2.75rem, 6vw, 5.5rem) !important; line-height: .98 !important; }
        main .text-7xl { font-size: clamp(3.5rem, 8vw, 6rem) !important; line-height: .95 !important; }
        main h1, main h2, main h3 { color: #fff !important; font-weight: 900 !important; }
        main h1 { letter-spacing: -.075em !important; }
        main h2 { font-size: clamp(1.65rem, 3vw, 2.4rem) !important; letter-spacing: -.06em !important; }
        main h3 { font-size: 1rem !important; letter-spacing: -.025em !important; }
        main section { position: relative; }
        main section > div[class*="rounded"] { transition: background-color .2s ease, transform .2s ease; }
        main section > div[class*="rounded"]:hover { box-shadow: none !important; }
        main footer { border-color: transparent !important; }
        /* Dark, distinct card colors; no scrapbook lines, grids, or decorative rules */
        main section.grid.grid-cols-1 > div:nth-child(1) { background-color: #171c2b !important; }
        main section.grid.grid-cols-1 > div:nth-child(2) { background-color: #241117 !important; }
        main section.grid.grid-cols-1 > div:nth-child(3) { background-color: #25190f !important; }
        main section.grid.gap-4 > div:first-child { background-color: #11170f !important; }
        main section.grid.gap-4 > div:last-child { background-color: #171013 !important; }
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+1) { background-color: #151b2a !important; }
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+2) { background-color: #241116 !important; }
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+3) { background-color: #21121a !important; }
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+4) { background-color: #24170e !important; }
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+5) { background-color: #151a11 !important; }
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n) { background-color: #211416 !important; }
        main section.space-y-3 > article:nth-child(4n+1) { background: #151b2a !important; }
        main section.space-y-3 > article:nth-child(4n+2) { background: #241116 !important; }
        main section.space-y-3 > article:nth-child(4n+3) { background: #24170e !important; }
        main section.space-y-3 > article:nth-child(4n) { background: #151a11 !important; }
        main button[aria-expanded="true"] { outline: 1px solid rgba(212,160,166,.6); outline-offset: 3px; }
        main section h2 { margin-top: .65rem; }
        main section > div.mb-6, main section > div.mb-6 > div { gap: .75rem; }
        main section p[class*="tracking-[0.2em]"] { color: #c7a2a4 !important; }

        /* FINAL OVERRIDES: true black canvas, no decorative lines, clear hierarchy */
        main.relative.min-h-screen { background: #000000 !important; background-image: none !important; }
        main > .pointer-events-none { display: none !important; }
        main * { border-color: transparent !important; }
        main header, main footer, main section,
        main section > div, main article, main button,
        main .rounded-3xl, main .rounded-2xl, main .rounded-xl {
          box-shadow: none !important;
          background-image: none !important;
        }
        main header, main footer { border: 0 !important; }
        main section.grid.gap-4 > div:first-child { background-color: #111a16 !important; }
        main section.grid.gap-4 > div:last-child { background-color: #17111a !important; }
        main section.grid.grid-cols-1 > div:nth-child(1) { background-color: #111827 !important; }
        main section.grid.grid-cols-1 > div:nth-child(2) { background-color: #251017 !important; }
        main section.grid.grid-cols-1 > div:nth-child(3) { background-color: #24170f !important; }
        main section.grid.gap-3.md\:grid-cols-2 > button { border: 0 !important; }
        main section.space-y-3 > article { border: 0 !important; }
        main h1 { color: #f8f4ef !important; font-size: clamp(3.2rem, 8vw, 7rem) !important; line-height: .92 !important; letter-spacing: -.075em !important; }
        main h2 { color: #f8f4ef !important; font-size: clamp(1.6rem, 3vw, 2.35rem) !important; line-height: 1.08 !important; letter-spacing: -.055em !important; }
        main h3 { color: #f8f4ef !important; font-size: 1rem !important; line-height: 1.35 !important; }
        main p { line-height: 1.65; }
        main p.text-\[9px\], main span.text-\[9px\], main p.text-\[10px\] { color: #aaa29d !important; }
        main p.text-\[11px\], main p.text-xs, main p.text-sm { color: #d1cbc5 !important; }
        main section.grid.gap-3.md\:grid-cols-2 > button:hover { transform: translateY(-2px); }
        main button[aria-expanded="true"] { outline: 2px solid #c18b93 !important; outline-offset: 3px; }
        main .scan-line, main .relative.mx-auto::before { display: none !important; content: none !important; }
        main .border-t, main .border-b, main [class*="border-t"], main [class*="border-b"] { border-top-color: transparent !important; border-bottom-color: transparent !important; }

        /* BIGGER, BOLDER CARDS */
        main > div.relative.mx-auto { max-width: 1600px !important; }
        main section.result-enter.result-delay-1.grid { gap: 18px !important; padding-top: 28px !important; padding-bottom: 28px !important; }
        main section.result-enter.result-delay-1.grid > div { min-height: 155px !important; padding: 30px !important; border-radius: 20px !important; }
        main section.result-enter.result-delay-2.mt-5 > div { min-height: 400px !important; padding: 40px !important; border-radius: 24px !important; }
        main .h-44.w-44 { width: 220px !important; height: 220px !important; }
        main section.result-enter.result-delay-3 { padding: 30px 34px !important; border-radius: 20px !important; }
        main .grid.gap-3.md\:grid-cols-2 { gap: 22px !important; }
        main button[aria-expanded] { min-height: 210px !important; padding: 32px !important; border-radius: 20px !important; }
        main button[aria-expanded="true"] { background-color: #211218 !important; outline: 2px solid #8d4654 !important; outline-offset: 2px; }
        main button[aria-expanded] .h-12.w-12 { width: 60px !important; height: 60px !important; font-size: 27px !important; }
        main button[aria-expanded] h3 { font-size: 16px !important; line-height: 1.6 !important; }
        main section.mt-14 { margin-top: 82px !important; }
        main article { padding: 32px !important; border-radius: 20px !important; }
        main section.mt-10.rounded-3xl { padding: 40px !important; border-radius: 24px !important; }

        /* Small grey labels and helper text: warm white */
        main [class*="text-zinc-"], main [class*="text-gray--"], main [class*="text-neutral-"], main [class*="text-stone-"], main [class*="text-slate-"] { color: #fff4e6 !important; }
        main [class*="text-lime-"] { color: #d4c5a5 !important; }
        main [class*="text-red-"] { color: #ff9ca5 !important; }
        main [class*="text-amber-"], main [class*="text-orange-"] { color: #f2b67e !important; }

        @media (max-width: 640px) {
          main section.result-enter.result-delay-1.grid > div,
          main section.result-enter.result-delay-2.mt-5 > div,
          main section.result-enter.result-delay-3,
          main button[aria-expanded], main article,
          main section.mt-10.rounded-3xl { min-height: auto !important; padding: 23px !important; }
          main .h-44.w-44 { width: 190px !important; height: 190px !important; }
          main section.mt-14 { margin-top: 54px !important; }
        }



        /* FINAL: plain cream canvas, no texture, stronger readable type */
        main.relative.min-h-screen {
          background: #f5eddd !important;
          background-image: none !important;
          color: #24211d !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace !important;
        }
        main, main * {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace !important;
          text-shadow: none !important;
        }
        main > .pointer-events-none,
        main .scan-line,
        main .relative.mx-auto::before { display: none !important; }
        main * { background-image: none !important; }
        main h1, main h2, main h3, main strong {
          color: #211e19 !important;
          font-weight: 900 !important;
        }
        main h1 { font-size: clamp(3.2rem, 8vw, 7rem) !important; line-height: .98 !important; letter-spacing: -.075em !important; }
        main h2 { font-size: clamp(1.7rem, 3vw, 2.5rem) !important; line-height: 1.12 !important; letter-spacing: -.055em !important; }
        main h3 { font-size: 1.05rem !important; line-height: 1.4 !important; }
        main p, main span, main a, main nav { color: #393229; }
        main p { line-height: 1.65; font-weight: 600; }
        main [class*="text-zinc-"], main [class*="text-gray-"], main [class*="text-neutral-"], main [class*="text-stone-"], main [class*="text-slate-"] { color: #51483d !important; }
        main [class*="text-white"], main [class*="text-zinc-100"], main [class*="text-zinc-200"], main [class*="text-zinc-300"] { color: #211e19 !important; }
        main [class*="text-lime-"] { color: #405239 !important; }
        main [class*="text-red-"] { color: #873d3e !important; }
        main [class*="text-amber-"], main [class*="text-orange-"] { color: #85471f !important; }
        main header, main footer { border: 0 !important; }
        main header a > div:first-child { background: #d5a6a0 !important; color: #211e19 !important; border: 0 !important; }
        main header nav a, main footer a { color: #393229 !important; font-weight: 800 !important; }
        main .pulse-dot { background-color: #526347 !important; }
        main .rounded-3xl, main .rounded-2xl, main .rounded-xl { border-radius: 12px !important; }
        main [class*="border-"] { border-color: transparent !important; }
        main .rounded-3xl, main .rounded-2xl, main .rounded-xl,
        main article, main button, main section > div { box-shadow: none !important; }
        main [class*="bg-white/"], main [class*="bg-[#101211]"], main [class*="bg-[#121513]"], main [class*="bg-[#171013]"], main [class*="bg-[#111]"] { background-color: #fff8e9 !important; }
        main [class*="bg-black"], main.relative.min-h-screen { background-color: #f5eddd !important; }
        main [class*="bg-lime-300"], main a.bg-lime-300, main button.bg-lime-300 { background-color: #d5a6a0 !important; color: #211e19 !important; border: 0 !important; }
        main [class*="bg-red-"] { background-color: #f0d8d2 !important; }
        main [class*="bg-amber-"], main [class*="bg-orange-"] { background-color: #f1dfc5 !important; }
        main [class*="bg-lime-300/"] { background-color: #e0e4d2 !important; }
        main section.grid.grid-cols-1 > div:nth-child(1) { background: #dce2d0 !important; }
        main section.grid.grid-cols-1 > div:nth-child(2) { background: #ead0cc !important; }
        main section.grid.grid-cols-1 > div:nth-child(3) { background: #f0d9b9 !important; }
        main section.result-enter.result-delay-2.mt-5 > div:first-child { background: #fff8e9 !important; }
        main section.result-enter.result-delay-2.mt-5 > div:last-child { background: #ead0cc !important; }
        main section.grid.gap-3.md\\:grid-cols-2 > button:nth-child(6n+1) { background: #e0e5d4 !important; }
        main section.grid.gap-3.md\\:grid-cols-2 > button:nth-child(6n+2) { background: #ead0cc !important; }
        main section.grid.gap-3.md\\:grid-cols-2 > button:nth-child(6n+3) { background: #f0d9b9 !important; }
        main section.grid.gap-3.md\\:grid-cols-2 > button:nth-child(6n+4) { background: #dce2d0 !important; }
        main section.grid.gap-3.md\\:grid-cols-2 > button:nth-child(6n+5) { background: #d9e0ef !important; }
        main section.grid.gap-3.md\\:grid-cols-2 > button:nth-child(6n) { background: #eadfc9 !important; }
        main section.space-y-3 > article:nth-child(4n+1) { background: #d9e0ef !important; }
        main section.space-y-3 > article:nth-child(4n+2) { background: #ead0cc !important; }
        main section.space-y-3 > article:nth-child(4n+3) { background: #f0d9b9 !important; }
        main section.space-y-3 > article:nth-child(4n) { background: #dce2d0 !important; }
        main section.mt-10.rounded-3xl { background: #e8dfc9 !important; }
        main section.result-enter.result-delay-1.grid > div { min-height: 155px !important; padding: 30px !important; }
        main section.result-enter.result-delay-2.mt-5 > div { min-height: 400px !important; padding: 40px !important; }
        main .h-44.w-44 { width: 220px !important; height: 220px !important; }
        main button[aria-expanded] { min-height: 210px !important; padding: 32px !important; }
        main button[aria-expanded="true"] { background: #ead0cc !important; outline: 3px solid #a96f70 !important; outline-offset: 2px; }
        main button[aria-expanded] h3 { font-size: 17px !important; font-weight: 900 !important; }
        main button[aria-expanded] .h-12.w-12 { width: 60px !important; height: 60px !important; font-size: 27px !important; }
        main article { padding: 32px !important; }
        main section.mt-14 { margin-top: 76px !important; }
        main .text-5xl { font-size: clamp(2.75rem, 6vw, 5.5rem) !important; }
        main .text-7xl { font-size: clamp(3.5rem, 8vw, 6rem) !important; }
        main p.text-\\[9px\\], main span.text-\\[9px\\], main p.text-\\[10px\\],
        main p.text-\\[11px\\], main p.text-xs, main p.text-sm,
        main span.text-\\[8px\\] { color: #51483d !important; font-weight: 700 !important; }
        main button:focus-visible, main a:focus-visible { outline: 3px solid #9b6a67 !important; outline-offset: 4px; }
        main section.grid.gap-3.md\\:grid-cols-2 > button:hover { filter: brightness(.98); transform: translateY(-2px); }
        @media (max-width: 640px) {
          main section.result-enter.result-delay-1.grid > div,
          main section.result-enter.result-delay-2.mt-5 > div,
          main button[aria-expanded], main article,
          main section.mt-10.rounded-3xl { min-height: auto !important; padding: 23px !important; }
          main .h-44.w-44 { width: 190px !important; height: 190px !important; }
          main section.mt-14 { margin-top: 54px !important; }
        }

        /* FINAL PALETTE: deep green / deep pink, with only black or white text */
        main.relative.min-h-screen { background: #f5eddd !important; color: #000000 !important; }
        main, main * { text-shadow: none !important; }
        main p, main span, main a, main label, main h1, main h2, main h3,
        main strong, main nav, main button, main article { color: #000000 !important; }
        main [class*="text-zinc-"], main [class*="text-gray-"],
        main [class*="text-neutral-"], main [class*="text-stone-"],
        main [class*="text-slate-"], main [class*="text-lime-"],
        main [class*="text-red-"], main [class*="text-amber-"],
        main [class*="text-orange-"] { color: #000000 !important; }

        /* Main feature panels */
        main section.result-enter.result-delay-1.grid > div:nth-child(1),
        main section.grid.grid-cols-1 > div:nth-child(1),
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+1),
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+4),
        main section.space-y-3 > article:nth-child(4n+1),
        main section.space-y-3 > article:nth-child(4n) { background: #164e3b !important; }
        main section.result-enter.result-delay-1.grid > div:nth-child(2),
        main section.grid.grid-cols-1 > div:nth-child(2),
        main section.result-enter.result-delay-2.mt-5 > div:last-child,
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+2),
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n),
        main section.space-y-3 > article:nth-child(4n+2) { background: #7f1d4a !important; }
        main section.result-enter.result-delay-1.grid > div:nth-child(3),
        main section.grid.grid-cols-1 > div:nth-child(3),
        main section.grid.gap-3.md\:grid-cols-2 > button:nth-child(6n+3),
        main section.space-y-3 > article:nth-child(4n+3) { background: #704214 !important; }
        main section.result-enter.result-delay-2.mt-5 > div:first-child,
        main section.mt-10.rounded-3xl,
        main section.result-enter.result-delay-3,
        main section > div.rounded-2xl,
        main section article { background: #164e3b !important; }
        main section.mt-10.rounded-3xl { background: #7f1d4a !important; }
        main button[aria-expanded="true"] { background: #7f1d4a !important; outline: 3px solid #164e3b !important; }
        main a.bg-lime-300, main button.bg-lime-300,
        main [class*="bg-lime-300"] { background: #164e3b !important; }
        main [class*="bg-red-"] { background: #7f1d4a !important; }
        main [class*="bg-amber-"], main [class*="bg-orange-"] { background: #704214 !important; }
        main [class*="bg-white/"], main [class*="bg-[#101211]"],
        main [class*="bg-[#121513]"], main [class*="bg-[#171013]"],
        main [class*="bg-[#111]"] { background: #164e3b !important; }

        /* Text inside dark panels is pure white; outside stays pure black */
        main section.result-enter.result-delay-1.grid > div *,
        main section.grid.grid-cols-1 > div *,
        main section.result-enter.result-delay-2.mt-5 > div *,
        main section.grid.gap-3.md\:grid-cols-2 > button *,
        main section.space-y-3 > article *,
        main section.mt-10.rounded-3xl *,
        main section.result-enter.result-delay-3 *,
        main section > div.rounded-2xl *,
        main a.bg-lime-300, main button.bg-lime-300,
        main [class*="bg-red-"], main [class*="bg-amber-"], main [class*="bg-orange-"] { color: #ffffff !important; }
        main header a > div:first-child { background: #7f1d4a !important; color: #ffffff !important; }
        main header nav a, main footer a { color: #000000 !important; font-weight: 900 !important; }
        main .pulse-dot { background-color: #164e3b !important; }
        main [class*="border-"] { border-color: transparent !important; }
        main button:focus-visible, main a:focus-visible { outline: 3px solid #7f1d4a !important; outline-offset: 4px; }
        main button[aria-expanded] h3 { color: #ffffff !important; font-weight: 900 !important; }
        main footer p, main footer span { color: #000000 !important; }


        /* READABILITY FIX: stop tiny labels and helper text */
        main { font-size: 17px !important; }
        main p, main li, main label { font-size: 16px !important; line-height: 1.65 !important; }
        main span, main a, main button { font-size: 15px !important; }
        main h1 { font-size: clamp(3.4rem, 8vw, 7.2rem) !important; line-height: 1 !important; }
        main h2 { font-size: clamp(2rem, 3.8vw, 3rem) !important; line-height: 1.15 !important; }
        main h3 { font-size: 1.25rem !important; line-height: 1.4 !important; }
        main [class*="text-\\[8px\\]"], main [class*="text-\\[9px\\]"],
        main [class*="text-\\[10px\\]"], main [class*="text-\\[11px\\]"],
        main [class*="text-xs"], main [class*="text-sm"] {
          font-size: 15px !important; line-height: 1.6 !important;
        }
        main [class*="tracking-"] { letter-spacing: 0.04em !important; }
        main button[aria-expanded] { min-height: 230px !important; padding: 30px !important; }
        main button[aria-expanded] h3 { font-size: 20px !important; }
        main button[aria-expanded] p { font-size: 16px !important; }
        main footer p, main footer a { font-size: 14px !important; }
        main .rounded-3xl, main .rounded-2xl, main .rounded-xl { border-radius: 14px !important; }
        @media (max-width: 640px) {
          main { font-size: 16px !important; }
          main p, main li, main label { font-size: 16px !important; }
          main span, main a, main button { font-size: 15px !important; }
          main h1 { font-size: clamp(2.8rem, 12vw, 4.2rem) !important; }
          main h2 { font-size: clamp(1.8rem, 8vw, 2.4rem) !important; }
          main button[aria-expanded] { min-height: 0 !important; padding: 22px !important; }
        }

      `}</style>

      <div className="relative mx-auto max-w-[1450px]">
        {/* Navigation */}
        <header className="result-enter flex flex-wrap items-center justify-between gap-5 border-b border-white/[0.09] pb-5">
          <a href="/" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300 text-lg font-black text-black transition group-hover:rotate-[-6deg]">
              O<span className="text-xs">/</span>
            </div>

            <div>
              <p className="text-sm font-black tracking-[-0.04em]">
                okaydocs<span className="text-lime-300">.</span>
              </p>
              <p className="mt-1 text-[9px] tracking-[0.16em] text-zinc-500">
                DOCUMENT INTELLIGENCE
              </p>
            </div>
          </a>

          <nav className="flex flex-wrap items-center gap-5 text-[10px] font-bold text-zinc-500 sm:gap-7">
            <a href="/" className="transition hover:text-white">
              SCAN
            </a>
            <a href="/history" className="transition hover:text-white">
              HISTORY
            </a>
            <a href="/reference" className="transition hover:text-white">
              KNOWLEDGE BASE
            </a>
          </nav>

          <div className="flex items-center gap-2 rounded-full border border-lime-300/15 bg-lime-300/[0.04] px-3 py-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime-300" />
            <span className="text-[9px] tracking-wider text-lime-200">
              ENGINE ONLINE
            </span>
          </div>
        </header>

        {!loaded ? (
          <div className="result-enter flex min-h-[55vh] flex-col items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-lime-300" />
            <p className="mt-5 text-[10px] tracking-[0.2em] text-zinc-500">
              RETRIEVING REPORT...
            </p>
          </div>
        ) : !report ? (
          <section className="result-enter relative my-16 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-8 text-center sm:p-16">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-lime-300/20 bg-lime-300/[0.06] text-3xl text-lime-300">
              ↗
            </div>

            <p className="mt-7 text-[10px] tracking-[0.25em] text-lime-300">
              NOTHING HERE YET
            </p>

            <h1 className="mt-4 text-3xl font-black tracking-[-0.06em] sm:text-5xl">
              Your next check
              <br />
              <span className="text-zinc-500">starts here.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-md text-xs leading-6 text-zinc-500">
              There is no saved report matching this session. Run a document
              check to generate your verification results.
            </p>

            <a
              href="/"
              className="mt-8 inline-flex items-center gap-3 rounded-xl bg-lime-300 px-6 py-4 text-[10px] font-black text-black transition hover:bg-lime-200"
            >
              START A NEW SCAN <span className="text-base">↗</span>
            </a>
          </section>
        ) : (
          <>
            {/* Hero */}
            <section className="result-enter relative grid gap-10 border-b border-white/[0.08] py-10 md:grid-cols-[1fr_auto] md:items-end md:py-14">
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3 py-2">
                  <span className="text-[9px] text-lime-300">✳</span>
                  <span className="text-[9px] tracking-[0.18em] text-zinc-400">
                    VERIFICATION COMPLETE / REPORT GENERATED
                  </span>
                </div>

                <h1 className="max-w-[900px] text-[clamp(3rem,8vw,7.5rem)] font-black uppercase leading-[0.78] tracking-[-0.085em]">
                  TRUST,
                  <br />
                  BUT VERIFY.
                  
                </h1>

                <p className="mt-6 max-w-lg text-xs leading-7 text-black-400 sm:text-sm">
                  Every document leaves clues. Here is what OkayDocs found
                  during this verification run.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 md:justify-end">
                <a
                  href="/"
                  className="inline-flex items-center gap-3 rounded-xl bg-lime-300 px-5 py-4 text-[10px] font-black text-black transition hover:bg-lime-200"
                >
                  + NEW SCAN
                </a>

                <a
                  href="/history"
                  className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-5 py-4 text-[10px] font-bold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.05]"
                >
                  VIEW HISTORY ↗
                </a>
              </div>
            </section>

            {/* Metadata strip */}
            <section className="result-enter result-delay-1 grid grid-cols-1 gap-3 py-5 sm:grid-cols-3">
              <MetaCard
                label="VERIFICATION ID"
                value={report.id || "UNASSIGNED"}
                icon="#"
              />
              <MetaCard
                label="DOCUMENT TYPE"
                value={report.document?.documentType || "Not identified"}
                icon="◈"
              />
              <MetaCard
                label="SCANNED ON"
                value={formatDate(report.createdAt)}
                icon="◷"
              />
            </section>

            {/* Main feature cards */}
            <section className="result-enter result-delay-2 mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              {/* Risk card */}
              <div
                className="relative overflow-hidden rounded-3xl border border-white/[0.09] p-6 sm:p-9"
                style={{
                  background: `radial-gradient(ellipse at 80% 35%, ${riskTheme.glow}, transparent 55%), linear-gradient(135deg, #121513, #0b0c0c 65%)`,
                }}
              >
                <div className="scan-line pointer-events-none absolute left-0 right-0 top-0 h-24 bg-gradient-to-b from-transparent via-lime-300/[0.035] to-transparent" />

                <div className="relative flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <p className="text-[9px] tracking-[0.22em] text-zinc-500">
                      YOUR VERIFICATION SNAPSHOT
                    </p>

                    <h2 className="mt-5 text-2xl font-black tracking-[-0.05em] sm:text-3xl">
                      {assessment}
                    </h2>

                    <p className="mt-3 max-w-sm text-[11px] leading-6 text-zinc-400">
                      {flaggedCount > 0
                        ? "Some indicators need attention. Review the findings below before making a decision."
                        : resolvedCount < checks.length
                          ? "The available checks are shown below. Remaining modules have not completed this run."
                          : "Review the individual checks and evidence to understand this result."}
                    </p>
                  </div>

                  <div className={`rounded-full border px-3 py-2 text-[9px] font-bold tracking-wider ${riskTheme.border} ${riskTheme.text}`}>
                    {riskLevel} RISK
                  </div>
                </div>

                <div className="relative mt-10 grid grid-cols-3 gap-3 border-t border-white/[0.08] pt-6">
                  <MiniStat label="PASSED" value={passedCount} />
                  <MiniStat label="NEEDS REVIEW" value={flaggedCount} />
                  <MiniStat label="NOT RUN" value={checks.length - resolvedCount} />
                </div>
              </div>

              {/* Risk score ring */}
              <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/[0.09] bg-[#101211] p-7 sm:p-9">
                <div className="absolute right-5 top-5 text-[9px] tracking-[0.18em] text-zinc-600">
                  RISK INDEX
                </div>

                <div className="relative mt-5 h-44 w-44">
                  <svg
                    viewBox="0 0 100 100"
                    className="h-full w-full -rotate-90"
                    aria-label={
                      typeof riskScore === "number"
                        ? `Risk score ${riskScore} out of 100`
                        : "Risk score unavailable"
                    }
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="rgba(255,255,255,0.07)"
                      strokeWidth="2.5"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke={riskTheme.stroke}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray="283"
                      strokeDashoffset={
                        283 -
                        283 *
                          (typeof riskScore === "number"
                            ? Math.max(0, Math.min(100, riskScore)) / 100
                            : 0)
                      }
                      className="risk-ring"
                    />
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-5xl font-black tracking-[-0.08em] ${riskTheme.text}`}>
                      {typeof riskScore === "number" ? riskScore : "—"}
                    </span>
                    <span className="mt-1 text-[9px] tracking-[0.18em] text-zinc-500">
                      {typeof riskScore === "number" ? "OUT OF 100" : "NO SCORE"}
                    </span>
                  </div>
                </div>

                <p className={`mt-5 text-xs font-bold ${riskTheme.text}`}>
                  {riskLevel === "UNRATED"
                    ? "Awaiting assessment"
                    : `${riskLevel} risk level`}
                </p>

                <p className="mt-2 max-w-xs text-center text-[10px] leading-5 text-zinc-500">
                  {typeof riskScore === "number"
                    ? "Based on the score recorded in this report."
                    : "The risk-scoring module has not run yet."}
                </p>
              </div>
            </section>

            {/* Progress */}
            <section className="result-enter result-delay-3 mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold">Verification progress</p>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Completed checks versus all available modules
                  </p>
                </div>

                <p className="text-sm font-black text-lime-300">
                  {progress}%
                </p>
              </div>

              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-lime-300 transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="mt-3 flex justify-between text-[9px] text-zinc-600">
                <span>{resolvedCount} MODULES RESOLVED</span>
                <span>{checks.length} TOTAL MODULES</span>
              </div>
            </section>

            {/* Check cards */}
            <section className="mt-14">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[9px] tracking-[0.2em] text-lime-300">
                    UNDER THE HOOD
                  </p>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.06em] sm:text-3xl">
                    The checkpoints<span className="text-lime-300">.</span>
                  </h2>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Select any module to inspect its available details.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 px-3 py-2 text-[9px] text-zinc-500">
                  {checks.length} MODULES
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {checks.map((check, index) => {
                  const isOpen = activeLayer === check.key;
                  const complete = ["pass", "done"].includes(check.status);
                  const problem = [
                    "flag",
                    "fail",
                    "suspicious",
                  ].includes(check.status);

                  return (
                    <button
                      key={check.key}
                      type="button"
                      onClick={() =>
                        setActiveLayer(isOpen ? null : check.key)
                      }
                      aria-expanded={isOpen}
                      className={`result-enter group w-full rounded-2xl border p-5 text-left transition duration-200 sm:p-6 ${
                        isOpen
                          ? "border-lime-300/30 bg-lime-300/[0.045]"
                          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.035]"
                      }`}
                      style={{ animationDelay: `${index * 65}ms` }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xl transition ${
                              complete
                                ? "border-lime-300/20 bg-lime-300/[0.07] text-lime-300"
                                : problem
                                  ? "border-red-300/20 bg-red-300/[0.06] text-red-300"
                                  : "border-white/[0.08] bg-white/[0.025] text-zinc-400"
                            }`}
                          >
                            {check.icon}
                          </div>

                          <div>
                            <p className="text-[9px] tracking-[0.15em] text-zinc-600">
                              MODULE {check.number}
                            </p>

                            <h3 className="mt-2 text-sm font-bold tracking-tight">
                              {check.name}
                            </h3>

                            <p className="mt-2 text-[10px] leading-5 text-zinc-500">
                              {check.description}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[8px] font-bold ${statusStyle(check.status)}`}
                        >
                          {formatStatus(check.status)}
                        </span>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4">
                        <span className="text-[9px] text-zinc-600">
                          {isOpen ? "HIDE DETAILS" : "INSPECT MODULE"}
                        </span>

                        <span className={`text-sm text-zinc-500 transition-transform ${isOpen ? "rotate-180" : "group-hover:translate-x-1"}`}>
                          {isOpen ? "↑" : "↗"}
                        </span>
                      </div>

                      {isOpen && (
                        <div className="mt-4 space-y-3 border-t border-white/[0.07] pt-4">
                          {check.reasons.length === 0 &&
                          check.flags.length === 0 ? (
                            <p className="text-[10px] leading-6 text-zinc-500">
                              {complete
                                ? "This module completed without recording any additional notes."
                                : "No additional evidence has been recorded for this module."}
                            </p>
                          ) : (
                            <>
                              {check.reasons.map((reason, reasonIndex) => (
                                <p
                                  key={`reason-${reasonIndex}`}
                                  className="text-[10px] leading-6 text-zinc-300"
                                >
                                  <span className="mr-2 text-lime-300">↳</span>
                                  {reason}
                                </p>
                              ))}

                              {check.flags.map((flag, flagIndex) => (
                                <p
                                  key={`flag-${flagIndex}`}
                                  className="text-[10px] leading-6 text-red-300"
                                >
                                  <span className="mr-2">!</span>
                                  {flag}
                                </p>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Findings */}
            <section className="mt-14">
              <div className="mb-6">
                <p className="text-[9px] tracking-[0.2em] text-lime-300">
                  SIGNALS & EVIDENCE
                </p>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.06em] sm:text-3xl">
                  What stood out<span className="text-lime-300">.</span>
                </h2>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Findings explicitly recorded by the verification modules.
                </p>
              </div>

              {findings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/[0.12] p-8 sm:p-10">
                  <div className="flex items-start gap-4">
                    <span className="text-xl text-zinc-500">◇</span>
                    <div>
                      <h3 className="text-xs font-bold">
                        No findings recorded
                      </h3>
                      <p className="mt-2 max-w-xl text-[11px] leading-6 text-zinc-500">
                        The available modules did not record additional
                        findings. This alone does not establish that a
                        document is authentic.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {findings.map((finding) => (
                    <article
                      key={finding.id}
                      className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-white/15 sm:p-6"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-xs font-bold">
                          {finding.title}
                        </h3>

                        <span
                          className={`rounded-full border px-2.5 py-1.5 text-[8px] font-bold ${statusStyle(finding.status)}`}
                        >
                          {formatStatus(finding.status)}
                        </span>
                      </div>

                      <p className="mt-3 text-[11px] leading-6 text-zinc-400">
                        {finding.description}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Audit footer card */}
            <section className="mt-10 rounded-3xl border border-white/[0.08] bg-[#101211] p-6 sm:p-8">
              <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-xl text-zinc-400">
                    ↗
                  </div>

                  <div>
                    <p className="text-[9px] tracking-[0.2em] text-zinc-500">
                      TRACEABILITY
                    </p>

                    <h2 className="mt-2 text-sm font-bold">
                      Audit trail
                    </h2>

                    <p className="mt-2 max-w-lg text-[10px] leading-6 text-zinc-500">
                      {report.audit?.status === "written"
                        ? "An audit entry has been recorded for this report."
                        : "A completed, hash-chained audit entry has not been recorded for this report."}
                    </p>

                    {report.audit?.entryHash && (
                      <p className="mt-3 break-all text-[9px] text-zinc-400">
                        HASH: {report.audit.entryHash}
                      </p>
                    )}
                  </div>
                </div>

                <span
                  className={`w-fit rounded-full border px-3 py-2 text-[9px] font-bold ${
                    report.audit?.status === "written"
                      ? "border-lime-300/20 bg-lime-300/[0.05] text-lime-300"
                      : "border-white/10 text-zinc-500"
                  }`}
                >
                  {report.audit?.status === "written"
                    ? "● RECORDED"
                    : "○ NOT RECORDED"}
                </span>
              </div>
            </section>

            {/* Bottom CTA */}
            <section className="relative mt-10 overflow-hidden rounded-3xl border border-lime-300/15 bg-lime-300/[0.035] p-7 sm:p-10">
              <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full bg-lime-300/[0.06] blur-[70px]" />

              <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                <div>
                  <p className="text-[9px] tracking-[0.2em] text-lime-300">
                    THAT'S THE BREAKDOWN
                  </p>

                  <h2 className="mt-3 text-2xl font-black tracking-[-0.06em] sm:text-3xl">
                    Ready for another?
                  </h2>

                  <p className="mt-3 max-w-lg text-[11px] leading-6 text-zinc-400">
                    Start a fresh verification whenever you are ready.
                  </p>
                </div>

                <a
                  href="/"
                  className="inline-flex shrink-0 items-center justify-center gap-4 rounded-xl bg-lime-300 px-6 py-4 text-[10px] font-black text-black transition hover:translate-y-[-2px] hover:bg-lime-200"
                >
                  RUN ANOTHER SCAN <span className="text-base">↗</span>
                </a>
              </div>
            </section>
          </>
        )}

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] py-6">
          <p className="text-[9px] tracking-[0.12em] text-zinc-600">
            OKAYDOCS © {new Date().getFullYear()} — BUILT TO LOOK CLOSER.
          </p>

          <div className="flex gap-5 text-[9px] text-zinc-500">
            <a href="/history" className="transition hover:text-white">
              HISTORY
            </a>
            <a href="/reference" className="transition hover:text-white">
              REFERENCES
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

function MetaCard({ label, value, icon }) {
  return (
    <div className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-white/[0.15]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] tracking-[0.16em] text-zinc-500">
          {label}
        </p>
        <span className="text-sm text-zinc-600 transition group-hover:text-lime-300">
          {icon}
        </span>
      </div>

      <p className="mt-4 break-words text-xs font-bold text-zinc-200">
        {value}
      </p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <p className="text-2xl font-black tracking-[-0.06em] sm:text-3xl">
        {String(value).padStart(2, "0")}
      </p>
      <p className="mt-2 text-[8px] tracking-[0.12em] text-zinc-500 sm:text-[9px]">
        {label}
      </p>
    </div>
  );
}
