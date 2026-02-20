"""
Unit tests for knowledge base schema validation.

Validates KB request/response schemas including source upload,
search, chunk preview, and bulk ingestion models.
"""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.kb import (
    KBBulkIngestRequest,
    KBBulkIngestResponse,
    KBChunkPreviewRequest,
    KBChunkPreviewResponse,
    KBChunkResponse,
    KBSearchRequest,
    KBSearchResponse,
    KBSearchResult,
    KBSourceListResponse,
    KBSourceResponse,
    KBSourceUploadRequest,
)


@pytest.mark.unit
class TestKBSourceUploadRequest:
    def test_valid_request(self):
        req = KBSourceUploadRequest(
            project_id=uuid4(),
            source_type="pdf",
            source_path="/path/to/file.pdf",
        )
        assert req.source_type == "pdf"

    def test_source_type_must_be_valid(self):
        with pytest.raises(ValidationError):
            KBSourceUploadRequest(
                project_id=uuid4(),
                source_type="invalid",
                source_path="/path/to/file",
            )

    @pytest.mark.parametrize("st", ["pdf", "text", "markdown"])
    def test_allowed_source_types(self, st):
        req = KBSourceUploadRequest(
            project_id=uuid4(),
            source_type=st,
            source_path="/path",
        )
        assert req.source_type == st

    def test_missing_project_id_raises(self):
        with pytest.raises(ValidationError):
            KBSourceUploadRequest(source_type="pdf", source_path="/path")


@pytest.mark.unit
class TestKBSearchRequest:
    def test_valid_search(self):
        req = KBSearchRequest(project_id=uuid4(), query="test query")
        assert req.query == "test query"
        assert req.top_k == 5  # default

    def test_query_min_length_1(self):
        with pytest.raises(ValidationError):
            KBSearchRequest(project_id=uuid4(), query="")

    def test_query_max_length_1000(self):
        with pytest.raises(ValidationError):
            KBSearchRequest(project_id=uuid4(), query="A" * 1001)

    def test_top_k_range(self):
        with pytest.raises(ValidationError):
            KBSearchRequest(project_id=uuid4(), query="test", top_k=0)
        with pytest.raises(ValidationError):
            KBSearchRequest(project_id=uuid4(), query="test", top_k=21)

        req = KBSearchRequest(project_id=uuid4(), query="test", top_k=1)
        assert req.top_k == 1


@pytest.mark.unit
class TestKBChunkPreviewRequest:
    def test_valid_request(self):
        req = KBChunkPreviewRequest(text="Some text to chunk")
        assert req.chunk_size == 500  # default
        assert req.chunk_overlap == 50  # default

    def test_text_min_length_1(self):
        with pytest.raises(ValidationError):
            KBChunkPreviewRequest(text="")

    def test_overlap_must_be_less_than_chunk_size(self):
        with pytest.raises(ValidationError):
            KBChunkPreviewRequest(text="test", chunk_size=100, chunk_overlap=100)

        with pytest.raises(ValidationError):
            KBChunkPreviewRequest(text="test", chunk_size=100, chunk_overlap=200)


@pytest.mark.unit
class TestKBBulkIngestRequest:
    def test_valid_request(self):
        req = KBBulkIngestRequest(file_ids=["f1", "f2"])
        assert req.chunk_size == 500
        assert req.embedding_model == "nomic-embed-text"
        assert req.scope == "project"

    def test_file_ids_required(self):
        with pytest.raises(ValidationError):
            KBBulkIngestRequest(file_ids=[])

    def test_overlap_less_than_chunk_size(self):
        with pytest.raises(ValidationError):
            KBBulkIngestRequest(
                file_ids=["f1"], chunk_size=100, chunk_overlap=100
            )

    def test_scope_validation(self):
        req = KBBulkIngestRequest(file_ids=["f1"], scope="global")
        assert req.scope == "global"

        with pytest.raises(ValidationError):
            KBBulkIngestRequest(file_ids=["f1"], scope="invalid")


@pytest.mark.unit
class TestKBResponseSchemas:
    def test_source_response(self):
        resp = KBSourceResponse(
            id="src-1",
            project_id="proj-1",
            source_type="pdf",
            source_path="/path/to/file.pdf",
            status="completed",
            chunk_count=10,
        )
        assert resp.chunk_count == 10

    def test_source_list_response_empty(self):
        resp = KBSourceListResponse()
        assert resp.sources == []
        assert resp.count == 0

    def test_search_result(self):
        result = KBSearchResult(
            chunk_id="c1",
            source_id="s1",
            content="test content",
            similarity=0.95,
        )
        assert result.similarity == 0.95

    def test_search_response(self):
        resp = KBSearchResponse(
            results=[],
            query="test",
            count=0,
        )
        assert resp.query == "test"

    def test_chunk_response(self):
        resp = KBChunkResponse(
            id="ch-1",
            source_id="src-1",
            content="chunk content",
            chunk_index=0,
            has_embedding=True,
        )
        assert resp.has_embedding is True

    def test_bulk_ingest_response(self):
        resp = KBBulkIngestResponse(
            batch_id="batch-1",
            total_files=3,
            status="processing",
        )
        assert resp.total_files == 3
