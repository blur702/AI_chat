"""
Unit tests for Drupal schema validation.

Validates schemas from both app.schemas.drupal (remote MCP site management)
and app.schemas.drupal_local (local development API).
"""

import pytest
from pydantic import ValidationError

from app.schemas.drupal import (
    CloneRequest,
    DrupalConnectRequest,
    DrupalConnectResponse,
    DrupalNodeCreateRequest,
    DrupalNodeUpdateRequest,
    DrushCommandRequest,
    DrushCommandResponse,
    PushRequest,
    SyncResponse,
)
from app.schemas.drupal_local import (
    DirectoryCreateRequest,
    DrushRequest,
    DrushResponse,
    FileCreateRequest,
    FileRenameRequest,
    FileTreeNode,
    FileUpdateRequest,
    ModuleScaffoldRequest,
    SiteStatusResponse,
)


# =========================================================================
# Remote Drupal (app.schemas.drupal)
# =========================================================================


@pytest.mark.unit
class TestDrupalConnectRequest:
    def test_valid_request(self):
        req = DrupalConnectRequest(
            site_url="https://example.com",
            username="admin",
            password="secret",
        )
        assert req.site_url == "https://example.com"
        assert req.username == "admin"

    def test_http_url_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            DrupalConnectRequest(
                site_url="http://example.com",
                username="admin",
                password="secret",
            )
        assert "https" in str(exc_info.value).lower()

    def test_missing_hostname_rejected(self):
        with pytest.raises(ValidationError):
            DrupalConnectRequest(
                site_url="https://",
                username="admin",
                password="secret",
            )

    def test_optional_site_name(self):
        req = DrupalConnectRequest(
            site_url="https://example.com",
            username="admin",
            password="secret",
        )
        assert req.site_name is None

        req_with = DrupalConnectRequest(
            site_url="https://example.com",
            username="admin",
            password="secret",
            site_name="My Site",
        )
        assert req_with.site_name == "My Site"

    def test_required_fields(self):
        with pytest.raises(ValidationError):
            DrupalConnectRequest(username="admin", password="secret")

        with pytest.raises(ValidationError):
            DrupalConnectRequest(site_url="https://example.com", password="secret")

        with pytest.raises(ValidationError):
            DrupalConnectRequest(site_url="https://example.com", username="admin")


@pytest.mark.unit
class TestDrupalConnectResponse:
    def test_defaults(self):
        resp = DrupalConnectResponse(
            id="d1", project_id="p1", site_url="https://example.com"
        )
        assert resp.connected is True
        assert resp.message == "Site connected successfully"


@pytest.mark.unit
class TestDrupalNodeCreateRequest:
    def test_valid_request(self):
        req = DrupalNodeCreateRequest(title="My Page")
        assert req.title == "My Page"
        assert req.body_format == "basic_html"
        assert req.status is True

    def test_title_min_length(self):
        with pytest.raises(ValidationError):
            DrupalNodeCreateRequest(title="")

    def test_title_max_length(self):
        with pytest.raises(ValidationError):
            DrupalNodeCreateRequest(title="A" * 513)


@pytest.mark.unit
class TestDrupalNodeUpdateRequest:
    def test_all_optional(self):
        req = DrupalNodeUpdateRequest()
        assert req.title is None
        assert req.body is None
        assert req.body_format is None
        assert req.status is None

    def test_partial_update(self):
        req = DrupalNodeUpdateRequest(title="Updated Title")
        assert req.title == "Updated Title"


@pytest.mark.unit
class TestDrushCommandRequest:
    def test_valid_command(self):
        req = DrushCommandRequest(command="cr")
        assert req.command == "cr"

    def test_empty_command_rejected(self):
        with pytest.raises(ValidationError):
            DrushCommandRequest(command="")


@pytest.mark.unit
class TestDrushCommandResponse:
    def test_construction(self):
        resp = DrushCommandResponse(command="cr", output="Cache cleared", exit_code=0)
        assert resp.exit_code == 0
        assert resp.error is None


@pytest.mark.unit
class TestCloneAndPushRequests:
    def test_clone_defaults(self):
        req = CloneRequest()
        assert req.include_files is True
        assert req.include_db is True

    def test_push_defaults(self):
        req = PushRequest()
        assert req.include_files is True
        assert req.include_db is False
        assert req.confirm is False

    def test_sync_response(self):
        resp = SyncResponse(success=True, message="Synced")
        assert resp.success is True
        assert resp.details is None


# =========================================================================
# Local Drupal Development (app.schemas.drupal_local)
# =========================================================================


@pytest.mark.unit
class TestFileCreateRequest:
    def test_valid_request(self):
        req = FileCreateRequest(path="/modules/my_module/my_module.info.yml")
        assert req.content == ""

    def test_path_required(self):
        with pytest.raises(ValidationError):
            FileCreateRequest(path="")


@pytest.mark.unit
class TestFileUpdateRequest:
    def test_valid_request(self):
        req = FileUpdateRequest(path="/test.php", content="<?php echo 'hi';")
        assert req.path == "/test.php"

    def test_path_min_length(self):
        with pytest.raises(ValidationError):
            FileUpdateRequest(path="", content="test")


@pytest.mark.unit
class TestFileRenameRequest:
    def test_valid_request(self):
        req = FileRenameRequest(old_path="/old.txt", new_path="/new.txt")
        assert req.old_path == "/old.txt"

    def test_paths_required(self):
        with pytest.raises(ValidationError):
            FileRenameRequest(old_path="", new_path="/new.txt")

        with pytest.raises(ValidationError):
            FileRenameRequest(old_path="/old.txt", new_path="")


@pytest.mark.unit
class TestDirectoryCreateRequest:
    def test_valid_request(self):
        req = DirectoryCreateRequest(path="/modules/custom")
        assert req.path == "/modules/custom"

    def test_path_min_length(self):
        with pytest.raises(ValidationError):
            DirectoryCreateRequest(path="")


@pytest.mark.unit
class TestDrushLocalRequest:
    def test_valid_command(self):
        req = DrushRequest(command="status")
        assert req.command == "status"

    def test_empty_command_rejected(self):
        with pytest.raises(ValidationError):
            DrushRequest(command="")


@pytest.mark.unit
class TestDrushLocalResponse:
    def test_construction(self):
        resp = DrushResponse(
            command="cr", exit_code=0, stdout="Cache rebuilt", stderr=""
        )
        assert resp.exit_code == 0


@pytest.mark.unit
class TestModuleScaffoldRequest:
    def test_valid_request(self):
        req = ModuleScaffoldRequest(
            machine_name="my_module",
            name="My Module",
        )
        assert req.machine_name == "my_module"
        assert req.package == "Custom"

    def test_machine_name_pattern(self):
        # Must start with lowercase letter, only lowercase + digits + underscores
        with pytest.raises(ValidationError):
            ModuleScaffoldRequest(machine_name="MyModule", name="Test")

        with pytest.raises(ValidationError):
            ModuleScaffoldRequest(machine_name="1module", name="Test")

        with pytest.raises(ValidationError):
            ModuleScaffoldRequest(machine_name="my-module", name="Test")

    def test_name_required(self):
        with pytest.raises(ValidationError):
            ModuleScaffoldRequest(machine_name="test_mod", name="")


@pytest.mark.unit
class TestFileTreeNode:
    def test_construction(self):
        node = FileTreeNode(name="test.php", type="file", path="/test.php")
        assert node.name == "test.php"
        assert node.children is None

    def test_directory_with_children(self):
        child = FileTreeNode(name="file.txt", type="file", path="/dir/file.txt")
        parent = FileTreeNode(
            name="dir", type="directory", path="/dir", children=[child]
        )
        assert len(parent.children) == 1


@pytest.mark.unit
class TestSiteStatusResponse:
    def test_defaults(self):
        resp = SiteStatusResponse()
        assert resp.drupal_version is None
        assert resp.php_version is None
        assert resp.raw == ""
