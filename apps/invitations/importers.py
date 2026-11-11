"""
Four ways in, one preview table out. Each parser yields (name, phone, capacity)
triples as the user wrote them; `build_preview` normalises and flags them.
"""

import csv
import io
import re

import vobject

from .phones import PhoneError, normalise, pretty


def parse_pasted(text: str):
    """One guest per line: 'Name, phone' or 'Name phone' or 'phone Name'. Optional trailing capacity."""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in re.split(r"[,\t;]+", line) if p.strip()]
        if len(parts) == 1:
            # Try "Name 0712 345 678" with whitespace only.
            m = re.match(r"^(.*?)\s*(\+?\d[\d\s\-]{6,}?\d)(?:\s+([123]))?$", line)
            if m:
                parts = [m.group(1).strip(), m.group(2).strip()] + ([m.group(3)] if m.group(3) else [])
            else:
                yield "", line, 1
                continue
        phone_idx = next((i for i, p in enumerate(parts) if re.search(r"\d{6,}", p.replace(" ", ""))), None)
        if phone_idx is None:
            yield parts[0], "", 1
            continue
        phone = parts[phone_idx]
        rest = [p for i, p in enumerate(parts) if i != phone_idx]
        capacity = 1
        if rest and rest[-1].isdigit() and 1 <= int(rest[-1]) <= 3:
            capacity = int(rest.pop())
        name = " ".join(rest).strip()
        yield name, phone, capacity


def parse_csv(data: bytes):
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return
    header = [h.strip().lower() for h in rows[0]]
    has_header = any(h in ("name", "phone", "number", "mobile", "capacity", "admits", "people") for h in header)
    if has_header:
        name_i = next((i for i, h in enumerate(header) if h in ("name", "guest", "full name")), 0)
        phone_i = next((i for i, h in enumerate(header) if h in ("phone", "number", "mobile", "phone number", "tel")), 1)
        cap_i = next((i for i, h in enumerate(header) if h in ("capacity", "admits", "people", "guests")), None)
        body = rows[1:]
    else:
        name_i, phone_i, cap_i, body = 0, 1, (2 if len(rows[0]) > 2 else None), rows
    for r in body:
        if not any(c.strip() for c in r):
            continue
        name = r[name_i].strip() if len(r) > name_i else ""
        phone = r[phone_i].strip() if len(r) > phone_i else ""
        cap = 1
        if cap_i is not None and len(r) > cap_i and r[cap_i].strip().isdigit():
            cap = max(1, min(3, int(r[cap_i])))
        yield name, phone, cap


def parse_vcard(data: bytes):
    """iPhone's way out: Contacts → select → Share → .vcf. One file, many people."""
    text = data.decode("utf-8", errors="replace")
    for card in vobject.readComponents(text):
        name = ""
        if hasattr(card, "fn"):
            name = card.fn.value.strip()
        elif hasattr(card, "n"):
            n = card.n.value
            name = " ".join(p for p in (n.given, n.family) if p).strip()
        tels = [t.value for t in card.contents.get("tel", [])]
        if not tels:
            yield name, "", 1
            continue
        # Prefer a mobile number if the contact has several.
        mobile = next((t.value for t in card.contents.get("tel", []) if "CELL" in str(t.params.get("TYPE", [])).upper()), None)
        yield name, mobile or tels[0], 1


def build_preview(rows, *, default_country: str, existing_phones: set[str]) -> dict:
    """Normalise, dedupe and classify every row so the admin fixes problems before anything is saved."""
    out, seen = [], set()
    counts = {"ready": 0, "duplicate": 0, "needs_attention": 0}
    for name, phone_raw, capacity in rows:
        row = {"name": name.strip(), "phone_raw": phone_raw, "phone": "", "capacity": capacity, "status": "ready", "reason": ""}
        try:
            e164 = normalise(phone_raw, default_country)
        except PhoneError as exc:
            row.update(status="needs_attention", reason=str(exc))
        else:
            row["phone"] = e164
            row["phone_display"] = pretty(e164)
            if e164 in existing_phones:
                row.update(status="duplicate", reason="Already on the guest list")
            elif e164 in seen:
                row.update(status="duplicate", reason="Appears twice in this import")
            seen.add(e164)
        if row["status"] == "ready" and not row["name"]:
            row.update(status="needs_attention", reason="No name")
        counts[row["status"]] += 1
        out.append(row)
    return {"rows": out, "counts": counts, "found": len(out)}
