"""
The spreadsheet a coordinator downloads, fills and uploads. Three columns,
the phone column forced to text so Excel cannot strip leading zeros, and
the Admits column limited to 1 to MAX_CAPACITY.
"""

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

from .models import MAX_CAPACITY

HEADERS = ["Name", "Phone", "Admits"]
EXAMPLES = [["Amina Hassan", "0712 345 678", 1], ["Joseph Mwita", "+255 755 111 222", 2]]


def build_template(country: str = "TZ") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Guests"
    ws.append(HEADERS)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="6341A8")
        cell.alignment = Alignment(vertical="center")
    for row in EXAMPLES:
        ws.append(row)
    for r in range(2, 4):
        for c in range(1, 4):
            ws.cell(r, c).font = Font(color="9A938D", italic=True)
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 22
    ws.column_dimensions["C"].width = 10
    # Phone as text for the whole column so 0712... keeps its zero.
    for r in range(2, 1002):
        ws.cell(r, 2).number_format = "@"
    dv = DataValidation(
        type="whole",
        operator="between",
        formula1="1",
        formula2=str(MAX_CAPACITY),
        allow_blank=True,
        showErrorMessage=True,
        errorTitle="Admits",
        error=f"Between 1 and {MAX_CAPACITY} people per card.",
    )
    ws.add_data_validation(dv)
    dv.add("C2:C1001")
    ws.freeze_panes = "A2"

    notes = wb.create_sheet("How to fill this in")
    lines = [
        "One guest per row. Delete the two grey example rows before uploading.",
        f"Phone: any format. 0712 345 678 or +255 712 345 678 both work; numbers without a country code are read as {country}.",
        f"Admits: how many people this one card lets in, 1 to {MAX_CAPACITY}. Leave blank for 1.",
        "Extra columns are ignored. Column order does not matter as long as the headings stay.",
        "Upload the file on the Guests page: Import, then Upload a spreadsheet. Nothing is sent until you confirm the preview.",
    ]
    for i, line in enumerate(lines, start=1):
        notes.cell(i, 1, line)
    notes.column_dimensions["A"].width = 110
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
