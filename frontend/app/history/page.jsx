"use client";

import { useMemo, useState } from "react";

const initialRecords = [];

export default function HistoryPage() {
  const [records] = useState(initialRecords);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesSearch =
        record.documentName.toLowerCase().includes(search.toLowerCase()) ||
        record.id.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        status === "ALL" || record.status === status;

      return matchesSearch && matchesStatus;
    });
  }, [records, search, status]);

  return (
    <main className="min-h-screen bg-[#050505] px-5 py-6 font-mono text-white md:px-10">
      {/* Navigation */}
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-white/15 pb-5">
        <a href="/" className="text-sm font-black tracking-tight">
          OKAYDOCS <span className="text-gray-600">/</span>{" "}
          <span className="text-gray-400">VERIFY</span>
          <p className="mt-1 text-[9px] font-normal tracking-[0.18em] text-gray-500">
            DOCUMENT INTEGRITY SYSTEM
          </p>
        </a>

        <nav className="flex gap-6 text-[10px] font-bold tracking-wider">
          <a href="/" className="text-gray-400 hover:text-white">
            CHECK
          </a>
          <a href="/history" className="border-b border-emerald-400 pb-2 text-white">
            HISTORY
          </a>
          <a href="/reference" className="text-gray-400 hover:text-white">
            REFERENCE DATA
          </a>
        </nav>

        <div className="border border-white/20 px-3 py-2 text-[9px]">
          <span className="mr-2 text-emerald-400">●</span>
          SYSTEM ONLINE
        </div>
      </header>

      {/* Page heading */}
      <section className="flex flex-col justify-between gap-8 border-b border-white/15 py-10 md:flex-row md:items-end">
        <div>
          <p className="mb-4 text-[10px] tracking-[0.25em] text-emerald-400">
            01 / AUDIT TRAIL
          </p>

          <h1 className="text-5xl font-black tracking-[-0.08em] md:text-7xl">
            HISTORY<span className="text-emerald-400">.</span>
          </h1>

          <p className="mt-4 max-w-lg text-xs leading-6 text-gray-400">
            Review previous document verification runs, inspect their
            outcomes, and maintain a traceable screening history.
          </p>
        </div>

        <a
          href="/"
          className="inline-flex w-fit items-center border border-emerald-400 bg-emerald-400 px-5 py-3 text-[10px] font-bold text-black transition hover:bg-transparent hover:text-emerald-400"
        >
          + NEW VERIFICATION
        </a>
      </section>

      {/* Summary cards */}
      <section className="grid grid-cols-1 gap-px border border-white/15 bg-white/15 sm:grid-cols-3">
        <SummaryCard label="TOTAL RUNS" value={records.length} />
        <SummaryCard
          label="VERIFIED"
          value={records.filter((r) => r.status === "VERIFIED").length}
        />
        <SummaryCard
          label="FLAGGED"
          value={records.filter((r) => r.status === "FLAGGED").length}
        />
      </section>

      {/* Search and filters */}
      <section className="mt-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-bold tracking-wider">
              VERIFICATION LOG
            </h2>
            <p className="mt-2 text-[10px] text-gray-500">
              SCREENING RECORDS / LOCAL VIEW
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              placeholder="SEARCH DOCUMENT OR ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-w-0 border border-white/20 bg-transparent px-4 py-3 text-[10px] outline-none placeholder:text-gray-600 focus:border-emerald-400 sm:w-64"
            />

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border border-white/20 bg-[#050505] px-4 py-3 text-[10px] outline-none focus:border-emerald-400"
            >
              <option value="ALL">ALL STATUSES</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="FLAGGED">FLAGGED</option>
              <option value="PENDING">PENDING</option>
            </select>
          </div>
        </div>

        {/* Records table */}
        <div className="mt-6 overflow-x-auto border border-white/15">
          <table className="w-full min-w-[750px] text-left">
            <thead className="border-b border-white/15 bg-white/[0.03]">
              <tr className="text-[9px] tracking-wider text-gray-500">
                <th className="px-5 py-4">RECORD ID</th>
                <th className="px-5 py-4">DOCUMENT</th>
                <th className="px-5 py-4">DATE / TIME</th>
                <th className="px-5 py-4">STATUS</th>
                <th className="px-5 py-4">RISK</th>
                <th className="px-5 py-4">ACTION</th>
              </tr>
            </thead>

            <tbody>
              {filteredRecords.length > 0 ? (
                filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-white/[0.08] text-[10px] transition hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-5 text-gray-500">
                      {record.id}
                    </td>
                    <td className="px-5 py-5">{record.documentName}</td>
                    <td className="px-5 py-5 text-gray-400">
                      {record.date}
                    </td>
                    <td className="px-5 py-5">
                      <StatusBadge status={record.status} />
                    </td>
                    <td className="px-5 py-5">
                      {record.risk ?? "—"}
                    </td>
                    <td className="px-5 py-5">
                      <a
                        href={`/result?id=${encodeURIComponent(record.id)}`}
                        className="text-emerald-400 hover:underline"
                      >
                        INSPECT ↗
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="mx-auto max-w-sm">
                      <p className="text-3xl font-black text-white/20">
                        00
                      </p>
                      <p className="mt-4 text-xs font-bold tracking-wider">
                        NO RECORDS FOUND
                      </p>
                      <p className="mt-3 text-[10px] leading-6 text-gray-500">
                        {search || status !== "ALL"
                          ? "No records match your current search or filter."
                          : "Verification history will appear here when screening records are connected."}
                      </p>
                      {(search || status !== "ALL") && (
                        <button
                          onClick={() => {
                            setSearch("");
                            setStatus("ALL");
                          }}
                          className="mt-5 text-[10px] text-emerald-400 hover:underline"
                        >
                          CLEAR FILTERS →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-between gap-3 py-5 text-[9px] text-gray-600">
          <span>OKAYDOCS / AUDIT INTERFACE</span>
          <span>{filteredRecords.length} RECORD(S) DISPLAYED</span>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-[#050505] p-6">
      <p className="text-[9px] tracking-[0.2em] text-gray-500">
        {label}
      </p>
      <p className="mt-4 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    VERIFIED: "border-emerald-400/30 text-emerald-400",
    FLAGGED: "border-red-400/30 text-red-400",
    PENDING: "border-yellow-400/30 text-yellow-400",
  };

  return (
    <span
      className={`inline-block border px-2 py-1 text-[9px] ${
        styles[status] || "border-white/20 text-gray-400"
      }`}
    >
      {status}
    </span>
  );
}