"use client";

import { useMemo, useState } from "react";

const referenceItems = [
{
id: "REF-001",
category: "DOCUMENT",
title: "Document Integrity",
description:
"Checks for potential inconsistencies, alterations, and suspicious visual patterns in submitted documents.",
source: "INTERNAL RULESET",
status: "ACTIVE",
},
{
id: "REF-002",
category: "PASSPORT",
title: "Machine Readable Zone",
description:
"Reference rules for parsing passport MRZ lines and checking their structure and check digits.",
source: "ICAO DOC 9303",
status: "ACTIVE",
},
{
id: "REF-003",
category: "IDENTITY",
title: "Identity Consistency",
description:
"Compares available identity fields for inconsistencies between the submitted document and extracted data.",
source: "INTERNAL RULESET",
status: "ACTIVE",
},
{
id: "REF-004",
category: "IMAGE",
title: "Image Tampering",
description:
"Reference indicators for suspicious image edits, inconsistent regions, and possible document manipulation.",
source: "INTERNAL RULESET",
status: "ACTIVE",
},
{
id: "REF-005",
category: "RISK",
title: "Risk Assessment",
description:
"Defines how screening indicators can contribute to an overall risk assessment.",
source: "RISK ENGINE",
status: "ACTIVE",
},
{
id: "REF-006",
category: "AUDIT",
title: "Audit Trail",
description:
"Reference information for recording screening outcomes and maintaining traceable verification events.",
source: "AUDIT MODULE",
status: "ACTIVE",
},
];

const categories = ["ALL", ...new Set(referenceItems.map((item) => item.category))];

export default function ReferencePage() {
const [search, setSearch] = useState("");
const [category, setCategory] = useState("ALL");
const [selectedItem, setSelectedItem] = useState(null);

const filteredItems = useMemo(() => {
const query = search.trim().toLowerCase();

```
return referenceItems.filter((item) => {
  const matchesCategory =
    category === "ALL" || item.category === category;

  const matchesSearch =
    !query ||
    [
      item.id,
      item.category,
      item.title,
      item.description,
      item.source,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);

  return matchesCategory && matchesSearch;
});
```

}, [search, category]);

return (
\<main className="min-h-screen bg-[#050505] px-5 py-6 font-mono text-white md\:px-10">
{/\* Navigation \*/}
\<header className="flex flex-wrap items-center justify-between gap-5 border-b border-white/15 pb-5">
\<a href="/" className="text-sm font-black tracking-tight">
OKAYDOCS \<span className="text-gray-600">/\</span>{" "}
\<span className="text-gray-400">VERIFY\</span>
\<p className="mt-1 text-[9px] font-normal tracking-[0.18em] text-gray-500">
DOCUMENT INTEGRITY SYSTEM
\</p>
\</a>

```
    <nav className="flex flex-wrap gap-5 text-[10px] font-bold tracking-wider">
      <a href="/" className="text-gray-400 hover:text-white">
        CHECK
      </a>
      <a href="/history" className="text-gray-400 hover:text-white">
        HISTORY
      </a>
      <a
        href="/reference"
        className="border-b border-emerald-400 pb-2 text-white"
      >
        REFERENCE DATA
      </a>
    </nav>

    <div className="border border-white/20 px-3 py-2 text-[9px]">
      <span className="mr-2 text-emerald-400">●</span>
      SYSTEM ONLINE
    </div>
  </header>

  {/* Heading */}
  <section className="flex flex-col justify-between gap-8 border-b border-white/15 py-10 md:flex-row md:items-end">
    <div>
      <p className="mb-4 text-[10px] tracking-[0.25em] text-emerald-400">
        02 / KNOWLEDGE BASE
      </p>

      <h1 className="text-5xl font-black tracking-[-0.08em] md:text-7xl">
        REFERENCE<span className="text-emerald-400">.</span>
      </h1>

      <p className="mt-4 max-w-xl text-xs leading-6 text-gray-400">
        Explore reference rules and information used by the document
        verification system. Search entries and inspect their details.
      </p>
    </div>

    <div className="border border-white/15 p-5 md:min-w-44">
      <p className="text-[9px] tracking-widest text-gray-500">
        AVAILABLE ENTRIES
      </p>
      <p className="mt-3 text-3xl font-black">{referenceItems.length.toString().padStart(2, "0")}</p>
      <p className="mt-2 text-[9px] text-emerald-400">
        LOCAL REFERENCE SET
      </p>
    </div>
  </section>

  {/* Summary */}
  <section className="grid grid-cols-2 gap-px border-x border-b border-white/15 bg-white/15 md:grid-cols-4">
    <Metric label="DOCUMENT RULES" value="01" />
    <Metric label="IDENTITY CHECKS" value="01" />
    <Metric label="IMAGE CHECKS" value="01" />
    <Metric label="RISK / AUDIT" value="02" />
  </section>

  {/* Search and filter */}
  <section className="mt-10">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="text-sm font-bold tracking-wider">
          REFERENCE DIRECTORY
        </h2>
        <p className="mt-2 text-[10px] text-gray-500">
          RULES / SOURCES / VERIFICATION CONTEXT
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH REFERENCES..."
          className="min-w-0 border border-white/20 bg-transparent px-4 py-3 text-[10px] outline-none placeholder:text-gray-600 focus:border-emerald-400 sm:w-64"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border border-white/20 bg-[#050505] px-4 py-3 text-[10px] outline-none focus:border-emerald-400"
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item === "ALL" ? "ALL CATEGORIES" : item}
            </option>
          ))}
        </select>
      </div>
    </div>

    {/* Reference cards */}
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filteredItems.map((item) => (
        <article
          key={item.id}
          className="flex flex-col border border-white/15 bg-white/[0.015] p-6 transition hover:border-emerald-400/50"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="text-[9px] tracking-widest text-gray-500">
              {item.id}
            </span>

            <span className="border border-emerald-400/30 px-2 py-1 text-[8px] text-emerald-400">
              {item.status}
            </span>
          </div>

          <p className="mt-7 text-[9px] tracking-[0.2em] text-emerald-400">
            {item.category}
          </p>

          <h3 className="mt-3 text-lg font-bold tracking-tight">
            {item.title}
          </h3>

          <p className="mt-3 flex-1 text-[11px] leading-6 text-gray-400">
            {item.description}
          </p>

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="text-[8px] text-gray-600">SOURCE</p>
              <p className="mt-1 text-[9px] text-gray-300">
                {item.source}
              </p>
            </div>

            <button
              onClick={() => setSelectedItem(item)}
              className="border border-white/20 px-3 py-2 text-[9px] hover:border-emerald-400 hover:text-emerald-400"
            >
              INSPECT ↗
            </button>
          </div>
        </article>
      ))}
    </div>

    {filteredItems.length === 0 && (
      <div className="mt-6 border border-dashed border-white/20 px-5 py-16 text-center">
        <p className="text-sm font-bold">NO REFERENCES FOUND</p>
        <p className="mt-3 text-[10px] text-gray-500">
          Try another search term or select a different category.
        </p>
        <button
          onClick={() => {
            setSearch("");
            setCategory("ALL");
          }}
          className="mt-5 text-[10px] text-emerald-400 hover:underline"
        >
          RESET FILTERS →
        </button>
      </div>
    )}

    <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-white/10 py-5 text-[9px] text-gray-600">
      <span>OKAYDOCS / REFERENCE DIRECTORY</span>
      <span>{filteredItems.length} ENTRIES DISPLAYED</span>
    </footer>
  </section>

  {/* Details modal */}
  {selectedItem && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
      onClick={() => setSelectedItem(null)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg border border-white/20 bg-[#080808] p-6 md:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-[10px] tracking-widest text-emerald-400">
            {selectedItem.id} / REFERENCE DETAILS
          </p>
          <button
            onClick={() => setSelectedItem(null)}
            aria-label="Close reference details"
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <h2
          id="reference-title"
          className="mt-8 text-2xl font-black"
        >
          {selectedItem.title}
        </h2>

        <p className="mt-4 text-xs leading-7 text-gray-400">
          {selectedItem.description}
        </p>

        <div className="mt-7 space-y-4 border-t border-white/10 pt-5 text-[10px]">
          <Detail label="CATEGORY" value={selectedItem.category} />
          <Detail label="SOURCE" value={selectedItem.source} />
          <Detail label="STATUS" value={selectedItem.status} />
        </div>

        <button
          onClick={() => setSelectedItem(null)}
          className="mt-8 w-full bg-emerald-400 px-5 py-3 text-[10px] font-bold text-black hover:bg-emerald-300"
        >
          CLOSE DETAILS
        </button>
      </section>
    </div>
  )}
</main>
```

);
}

function Metric({ label, value }) {
return (
\<div className="bg-[#050505] p-5 md\:p-6">
\<p className="text-[8px] tracking-wider text-gray-500">{label}\</p>
\<p className="mt-3 text-2xl font-black">{value}\</p>
\</div>
);
}

function Detail({ label, value }) {
return (
\<div className="flex items-start justify-between gap-5">
\<span className="text-gray-500">{label}\</span>
\<span className="text-right text-gray-200">{value}\</span>
\</div>
);
}
