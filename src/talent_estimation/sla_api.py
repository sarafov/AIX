"""Stateless endpoints for SLA import, drafting, and download."""

from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from talent_estimation.catalog import load_default_catalog
from talent_estimation.io import extract_text
from talent_estimation.sla import (
    SlaDraft,
    SlaDraftRequest,
    export_sla_pdf,
    export_sla_word,
    make_sla,
    read_assignment_plan,
)

router = APIRouter(prefix="/api/py/sla")
LIMIT = 4 * 1024 * 1024


@router.post("/plan")
async def import_plan(file: Annotated[UploadFile, File()]) -> dict:
    """Import human assignments from an exported workbook."""
    content = await file.read(LIMIT + 1)
    if len(content) > LIMIT:
        raise HTTPException(413, "Ukuran file maksimum 4 MB.")
    try:
        return read_assignment_plan(content).model_dump(mode="json")
    except Exception as exc:
        raise HTTPException(400, f"Tidak dapat membaca assignment plan: {exc}") from exc


@router.post("/draft")
async def draft_sla(
    settings: Annotated[str, Form()],
    documents: Annotated[list[UploadFile] | None, File()] = None,
) -> dict:
    """Reuse uploaded project documents; no document is sent to a model or stored."""
    if len(settings.encode()) > LIMIT or len(documents or []) > 5:
        raise HTTPException(413, "Maksimum 5 dokumen dan total 4 MB per permintaan.")
    try:
        body = SlaDraftRequest.model_validate_json(settings)
        extracted = []
        total = len(settings.encode())
        for file in documents or []:
            data = await file.read(LIMIT + 1)
            total += len(data)
            if total > LIMIT:
                raise HTTPException(413, "Total dokumen dan data maksimum 4 MB.")
            name = file.filename or "document"
            text = extract_text(name, data)
            if len(text.strip()) < 40:
                raise ValueError(
                    f"{name}: teks tidak terbaca. Gunakan PDF dengan teks/OCR, Word, atau teks."
                )
            extracted.append((name, text))
        return make_sla(body, extracted, body.catalog or load_default_catalog()).model_dump(
            mode="json"
        )
    except HTTPException:
        raise
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/export/{kind}")
def export_sla(kind: Literal["pdf", "docx"], draft: SlaDraft) -> Response:
    """Export the edited content, never regenerate over human changes."""
    content = export_sla_pdf(draft) if kind == "pdf" else export_sla_word(draft)
    return Response(
        content,
        media_type="application/pdf"
        if kind == "pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="Deliverable_Based_Resource_SLA.{kind}"'
        },
    )


@router.post("/validate")
def validate_draft(draft: SlaDraft) -> dict:
    """Validate a restored session without regenerating edited content."""
    return draft.model_dump(mode="json")
