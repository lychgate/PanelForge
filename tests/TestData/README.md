# Test data — owner's novel (added 2026-11-06)

Twenty-five PDFs by the repository owner: a prologue, chapters 1–22,
and an epilogue (~2.6 MB total). These are the manuscripts used for
real-world testing from **Stage 6 (Storyboard Studio)** onward.

## Layouts

- **Chapters 4–15 (approximate):** journal-entry design — dated
  entries rather than prose paragraphs.
- **The rest (prologue, chapters 1–3, 16–22, epilogue):** normal
  novel layout.

Both layouts exercise the S3.3/S3.4 heading segmentation and the
S6.12 composition review with real, varied input.

## Known import status (S3.10 pdf-import, verified 2026-11-06)

- All 25 PDFs report `scanned` under the text-layer-only parser:
  they are image-based exports with no extractable text layer, so
  importing them today yields "Unknown" (no OCR in PanelForge per
  the S3.10 decision).
- `Epilogue.pdf` additionally fails FlateDecode inflation in the
  zero-dependency parser. Expect `INVALID_PDF`/parse failure there
  until the parser handles its encoding.

To test the full Stage 3 pipeline (import → extract → classify)
against these files, either add OCR, export text-layer PDFs from
the authoring tool, or pick chapters that export with embedded
text. Stage 6 fixture work (S6.13) should record which path it
takes here and in the register.
