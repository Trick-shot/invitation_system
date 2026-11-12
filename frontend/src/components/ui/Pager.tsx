/**
 * One pager for every table. Shows where you are ("51 to 100 of 312 guests"),
 * Previous and Next, and page numbers with gaps on wide screens.
 * Shown under every table with rows, with a rows-per-page choice; the page
 * buttons switch off when everything fits on one page.
 *
 * Server lists pass the API's page, pages and count. Lists that are already
 * fully loaded use usePaged() to slice them in the browser.
 */
import { useEffect, useMemo, useState } from "react";

/** 1 … 4 5 6 … 12 : first, last, and the neighbours of the current page. 0 marks a gap. */
export function pageList(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => keep.add(n));
  const sorted = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: number[] = [];
  sorted.forEach((n, i) => { if (i && n - sorted[i - 1] > 1) out.push(0); out.push(n); });
  return out;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export const PAGE_SIZES = [25, 50, 100];

/**
 * Always shown under a table that has rows, so you can see how many there are and
 * how many are on screen. Page buttons switch off when everything fits on one page.
 */
export function Pager({ page, pages, count, pageSize, noun = "rows", onPage, onPageSize }: { page: number; pages: number; count: number; pageSize: number; noun?: string; onPage: (p: number) => void; onPageSize?: (n: number) => void }) {
  if (count <= 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-range">{fmt(from)} to {fmt(to)} of {fmt(count)} {noun}</span>
      <div className="pager-btns">
        {onPageSize && (
          <label className="pager-size">Rows per page
            <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
        )}
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="pager-of">Page {page} of {pages}</span>
        {pageList(page, pages).map((n, i) => n === 0
          ? <span key={`gap-${i}`} className="pager-gap" aria-hidden>…</span>
          : <button key={n} type="button" className={`pager-num ${n === page ? "on" : ""}`} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => onPage(n)}>{n}</button>)}
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </nav>
  );
}

/** Rows per page for one table, remembered in this browser. 25 unless the person picked otherwise. */
export function usePageSize(table: string, fallback = 25) {
  const [size, setSize] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(`rows:${table}`)); return PAGE_SIZES.includes(v) ? v : fallback; } catch { return fallback; }
  });
  const set = (n: number) => { setSize(n); try { localStorage.setItem(`rows:${table}`, String(n)); } catch { /* private mode: keep it for this visit */ } };
  return [size, set] as const;
}

/** Row number across pages: the 3rd row of page 2 at 25 a page is 28. */
export const rowNo = (page: number, pageSize: number, i: number) => (page - 1) * pageSize + i + 1;

/** Page a list that is already in memory. Goes back to page 1 when the list shrinks under the current page. */
export function usePaged<T>(rows: T[], pageSize = 25) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => { if (page > pages) setPage(1); }, [page, pages]);
  const slice = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  return { page: Math.min(page, pages), pages, slice, count: rows.length, pageSize, setPage };
}

/** When a new page loads below the fold, bring the top of its table back into view. */
export function scrollToTable(el: HTMLElement | null) {
  if (!el) return;
  const top = el.getBoundingClientRect().top;
  if (top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
}
