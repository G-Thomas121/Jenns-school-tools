from app.services.document_parser import parse_document


def test_parse_txt(tmp_path):
    f = tmp_path / "notes.txt"
    f.write_text("Hello world")
    assert parse_document(str(f)) == "Hello world"


def test_parse_missing_file(tmp_path):
    result = parse_document(str(tmp_path / "ghost.txt"))
    assert "not found" in result


def test_parse_unsupported_extension(tmp_path):
    f = tmp_path / "data.xlsx"
    f.write_bytes(b"irrelevant")
    result = parse_document(str(f))
    assert "Unsupported" in result


def test_truncation(tmp_path):
    f = tmp_path / "big.txt"
    f.write_text("x" * 70_000)
    result = parse_document(str(f))
    assert "truncated" in result
    assert len(result) < 70_000
