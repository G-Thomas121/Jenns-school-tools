from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.sources import UploadError, import_files
from app.services.workspace import WorkspaceError, get_workspace

router = APIRouter()


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
def upload(
    files: list[UploadFile] = File(...),
    paths: list[str] = Form(default=[]),
    lesson: str | None = Form(default=None),
):
    """One file or a whole folder. `paths` carries each file's path inside the picked folder
    (browsers drop it from the filename), in the same order as `files`."""
    names = paths if len(paths) == len(files) else [f.filename or "" for f in files]
    ws = get_workspace()
    try:
        result = import_files(ws, [(n, f.file.read()) for n, f in zip(names, files)], lesson=lesson or None)
    except (UploadError, WorkspaceError) as e:
        raise HTTPException(400, str(e))
    saved = result["saved"]
    if len(saved) == 1:
        ws.commit(f"Upload {Path(saved[0]).name}")
    else:
        ws.commit(f"Upload {len(saved)} files to {result['indexes'][0].rsplit('/', 1)[0]}")
    return result
