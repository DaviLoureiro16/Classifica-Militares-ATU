from pathlib import Path
import re
import sys

import pymupdf as fitz


PDF_PATH = Path(sys.argv[1])
OUTPUT_DIR = Path(".agents/outputs")
REFERENCES = [
    "ADAM QUINTANILHA DA SILVA",
    "ADLA DE ANDRADE SALES",
    "ADRIAN CARVALHO DESVARS ARAUJO",
    "ADRIANO HENRIQUE DO NASCIMENTO CARVALHO",
]


def normalized(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def group_words_by_row(words):
    rows = []
    for word in sorted(words, key=lambda entry: (entry[1], entry[0])):
        x0, y0, x1, y1, text = word[:5]
        center_y = (y0 + y1) / 2
        row = next((entry for entry in rows if abs(entry["center_y"] - center_y) <= 2.5), None)
        if row is None:
            row = {"center_y": center_y, "words": []}
            rows.append(row)
        previous_count = len(row["words"])
        row["words"].append((x0, x1, text))
        row["center_y"] = (
            row["center_y"] * previous_count + center_y
        ) / (previous_count + 1)
    for row in rows:
        row["words"].sort(key=lambda entry: entry[0])
        row["text"] = " ".join(item[2] for item in row["words"])
    return sorted(rows, key=lambda entry: entry["center_y"])


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
document = fitz.open(PDF_PATH)
print(f"PDF: {PDF_PATH.name}")
print(f"Páginas: {document.page_count}")
print(f"Metadados: {document.metadata}")

found = set()
for page_index in range(document.page_count):
    page = document[page_index]
    rows = group_words_by_row(page.get_text("words"))
    page_references = []
    for reference in REFERENCES:
        reference_key = normalized(reference)
        for row_index, row in enumerate(rows):
            if reference_key in normalized(row["text"]):
                page_references.append((reference, row_index, row))
                found.add(reference)

    if not page_references:
        continue

    print(f"\nPÁGINA {page_index + 1} — dimensão {page.rect.width:.1f} x {page.rect.height:.1f} pt")
    all_text = page.get_text("text").splitlines()
    print("Texto inicial:")
    for line in all_text[:16]:
        print(f"  {line}")
    for reference, row_index, row in page_references:
        print(f"\nReferência: {reference}")
        for index in range(max(0, row_index - 1), min(len(rows), row_index + 2)):
            line = rows[index]
            coords = " | ".join(f"x={x0:.1f}..{x1:.1f}:{text}" for x0, x1, text in line["words"])
            print(f"  y={line['center_y']:.1f} {line['text']}")
            print(f"    {coords}")
    image_path = OUTPUT_DIR / f"cpcar-reference-page-{page_index + 1}.png"
    page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).save(image_path)
    print(f"Renderizada: {image_path}")

missing = [reference for reference in REFERENCES if reference not in found]
print(f"\nReferências encontradas: {len(found)}/{len(REFERENCES)}")
if missing:
    print("Não encontradas:", "; ".join(missing))
