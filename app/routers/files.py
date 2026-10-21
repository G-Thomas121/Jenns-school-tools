from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.workspace import WorkspaceError, get_workspace

router = APIRouter()

SUPPORTED_UPLOADS = {".pdf", ".docx", ".txt", ".md"}


@router.get("")
def list_files():
    return get_workspace().list_files()


@router.get("/content")
def read_file(path: str):
    ws = get_workspace()
    try:
        return {"path": path, "content": ws.read(path)}
    except WorkspaceError as e:
        raise HTTPException(404 if "not found" in str(e) else 400, str(e))


class FileContent(BaseModel):
    path: str
    content: str


@router.put("/content")
def write_file(body: FileContent):
    ws = get_workspace()
    try:
        ws.write(body.path, body.content)
    except WorkspaceError as e:
        raise HTTPException(400, str(e))
    ws.commit(f"Jenn edited {body.path}")
    return {"path": body.path, "content": body.content}


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    name = Path(file.filename or "").name
    if Path(name).suffix.lower() not in SUPPORTED_UPLOADS:
        raise HTTPException(400, f"Unsupported file type. Accepted: {', '.join(sorted(SUPPORTED_UPLOADS))}")
    ws = get_workspace()
    (ws.root / "curriculum" / name).write_bytes(await file.read())
    ws.commit(f"Upload {name}")
    return {"path": f"curriculum/{name}"}
