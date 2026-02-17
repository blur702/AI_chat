"""Property-based tests for Pydantic schemas using Hypothesis."""

import uuid

import pytest
from hypothesis import given, assume, settings
from hypothesis import strategies as st
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Schemas under test
# ---------------------------------------------------------------------------
from app.schemas.context import (
    ChatCreateRequest,
    ContextSnippetCreateRequest,
    MessageSubmitRequest,
    ProjectCreateRequest,
    TokenUsageRequest,
    UserPreferencesUpdateRequest,
)
from app.schemas.image import ImageGenerationRequest
from app.schemas.auth import LoginRequest, UserCreateRequest, PasswordChangeRequest
from app.schemas.project_import import GitImportRequest

# ---------------------------------------------------------------------------
# Reusable strategies
# ---------------------------------------------------------------------------

# Non-empty printable text that doesn't collapse to whitespace-only
_nonempty_text = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "S", "Z")),
    min_size=1,
    max_size=100,
).filter(lambda s: s.strip())

_uuid_strategy = st.builds(uuid.uuid4)

VALID_CHAT_MODES = ["agent", "suggest", "plan", "ask", "chat"]
VALID_WORKFLOW_TYPES = [
    "text-to-image",
    "image-to-image",
    "inpainting",
    "face-morph",
    "upscale",
]


# ===================================================================
# LoginRequest
# ===================================================================


@pytest.mark.unit
class TestLoginRequest:
    """Property-based tests for LoginRequest."""

    @given(
        identifier=st.text(min_size=1, max_size=255),
        password=st.text(min_size=1, max_size=255),
    )
    def test_roundtrip(self, identifier: str, password: str):
        """Construct -> dump -> reconstruct produces identical data."""
        obj = LoginRequest(identifier=identifier, password=password)
        data = obj.model_dump()
        restored = LoginRequest(**data)
        assert restored == obj

    @given(identifier=st.text(min_size=1, max_size=255))
    def test_empty_password_rejected(self, identifier: str):
        """Password with min_length=1 rejects empty string."""
        with pytest.raises(ValidationError):
            LoginRequest(identifier=identifier, password="")

    def test_missing_identifier_rejected(self):
        """identifier is required."""
        with pytest.raises(ValidationError):
            LoginRequest(password="secret")  # type: ignore[call-arg]

    def test_missing_password_rejected(self):
        """password is required."""
        with pytest.raises(ValidationError):
            LoginRequest(identifier="user")  # type: ignore[call-arg]


# ===================================================================
# UserCreateRequest
# ===================================================================


@pytest.mark.unit
class TestUserCreateRequest:
    """Property-based tests for UserCreateRequest."""

    @given(
        username=st.text(min_size=1, max_size=255),
        password=st.text(min_size=8, max_size=128),
        role=st.sampled_from(["admin", "user"]),
    )
    def test_roundtrip(self, username: str, password: str, role: str):
        obj = UserCreateRequest(username=username, password=password, role=role)
        data = obj.model_dump()
        restored = UserCreateRequest(**data)
        assert restored == obj

    @given(password=st.text(min_size=8, max_size=128))
    def test_empty_username_rejected(self, password: str):
        with pytest.raises(ValidationError):
            UserCreateRequest(username="", password=password, role="user")

    @given(username=st.text(min_size=1, max_size=255))
    def test_short_password_rejected(self, username: str):
        """Passwords shorter than 8 chars must be rejected."""
        with pytest.raises(ValidationError):
            UserCreateRequest(username=username, password="short", role="user")

    @given(
        username=st.text(min_size=1, max_size=255),
        password=st.text(min_size=8, max_size=128),
        role=st.text(min_size=1, max_size=50).filter(
            lambda r: r not in ("admin", "user")
        ),
    )
    def test_invalid_role_rejected(self, username: str, password: str, role: str):
        with pytest.raises(ValidationError):
            UserCreateRequest(username=username, password=password, role=role)

    @given(
        username=st.text(min_size=256, max_size=300),
        password=st.text(min_size=8, max_size=128),
    )
    def test_username_too_long_rejected(self, username: str, password: str):
        with pytest.raises(ValidationError):
            UserCreateRequest(username=username, password=password, role="user")


# ===================================================================
# PasswordChangeRequest
# ===================================================================


@pytest.mark.unit
class TestPasswordChangeRequest:
    """Property-based tests for PasswordChangeRequest."""

    @given(
        current=st.text(min_size=1, max_size=128),
        new=st.text(min_size=8, max_size=128),
    )
    def test_roundtrip(self, current: str, new: str):
        obj = PasswordChangeRequest(current_password=current, new_password=new)
        data = obj.model_dump()
        restored = PasswordChangeRequest(**data)
        assert restored == obj

    @given(new=st.text(min_size=8, max_size=128))
    def test_empty_current_password_rejected(self, new: str):
        with pytest.raises(ValidationError):
            PasswordChangeRequest(current_password="", new_password=new)

    @given(current=st.text(min_size=1, max_size=128))
    def test_short_new_password_rejected(self, current: str):
        with pytest.raises(ValidationError):
            PasswordChangeRequest(current_password=current, new_password="short")


# ===================================================================
# ProjectCreateRequest
# ===================================================================


@pytest.mark.unit
class TestProjectCreateRequest:
    """Property-based tests for ProjectCreateRequest."""

    @given(
        name=st.text(min_size=1, max_size=255),
        path=st.text(min_size=1, max_size=500),
    )
    def test_roundtrip(self, name: str, path: str):
        obj = ProjectCreateRequest(name=name, path=path)
        data = obj.model_dump()
        restored = ProjectCreateRequest(**data)
        assert restored == obj

    @given(path=st.text(min_size=1, max_size=500))
    def test_name_too_long_rejected(self, path: str):
        with pytest.raises(ValidationError):
            ProjectCreateRequest(name="x" * 256, path=path)

    @given(name=st.text(min_size=1, max_size=255))
    def test_missing_path_rejected(self, name: str):
        with pytest.raises(ValidationError):
            ProjectCreateRequest(name=name)  # type: ignore[call-arg]


# ===================================================================
# ChatCreateRequest
# ===================================================================


@pytest.mark.unit
class TestChatCreateRequest:
    """Property-based tests for ChatCreateRequest."""

    @given(
        project_id=_uuid_strategy,
        title=st.text(min_size=1, max_size=500),
        chat_mode=st.sampled_from(VALID_CHAT_MODES + [None]),
    )
    def test_roundtrip(self, project_id: uuid.UUID, title: str, chat_mode):
        obj = ChatCreateRequest(
            project_id=project_id, title=title, chat_mode=chat_mode
        )
        data = obj.model_dump()
        # UUID comes back as UUID after model_dump(mode="python")
        restored = ChatCreateRequest(**data)
        assert restored == obj

    @given(project_id=_uuid_strategy)
    def test_title_too_long_rejected(self, project_id: uuid.UUID):
        with pytest.raises(ValidationError):
            ChatCreateRequest(project_id=project_id, title="t" * 501)

    @given(
        project_id=_uuid_strategy,
        title=st.text(min_size=1, max_size=500),
        bad_mode=st.text(min_size=1, max_size=50).filter(
            lambda m: m not in VALID_CHAT_MODES
        ),
    )
    def test_invalid_chat_mode_rejected(
        self, project_id: uuid.UUID, title: str, bad_mode: str
    ):
        with pytest.raises(ValidationError):
            ChatCreateRequest(
                project_id=project_id, title=title, chat_mode=bad_mode
            )


# ===================================================================
# MessageSubmitRequest
# ===================================================================


@pytest.mark.unit
class TestMessageSubmitRequest:
    """Property-based tests for MessageSubmitRequest."""

    @given(content=st.text(min_size=1, max_size=1000))
    def test_roundtrip(self, content: str):
        obj = MessageSubmitRequest(content=content)
        data = obj.model_dump()
        restored = MessageSubmitRequest(**data)
        assert restored == obj

    def test_empty_content_rejected(self):
        with pytest.raises(ValidationError):
            MessageSubmitRequest(content="")

    def test_content_too_long_rejected(self):
        with pytest.raises(ValidationError):
            MessageSubmitRequest(content="a" * 100_001)

    @given(
        content=st.text(min_size=1, max_size=500),
        model=st.text(min_size=1, max_size=100),
    )
    def test_optional_model_accepted(self, content: str, model: str):
        obj = MessageSubmitRequest(content=content, model=model)
        assert obj.model == model


# ===================================================================
# TokenUsageRequest
# ===================================================================


@pytest.mark.unit
class TestTokenUsageRequest:
    """Property-based tests for TokenUsageRequest."""

    @given(
        token_count=st.integers(min_value=1, max_value=10_000_000),
        max_tokens=st.integers(min_value=1, max_value=10_000_000),
    )
    def test_roundtrip(self, token_count: int, max_tokens: int):
        obj = TokenUsageRequest(token_count=token_count, max_tokens=max_tokens)
        data = obj.model_dump()
        restored = TokenUsageRequest(**data)
        assert restored == obj

    @given(max_tokens=st.integers(min_value=1, max_value=10_000_000))
    def test_zero_token_count_rejected(self, max_tokens: int):
        with pytest.raises(ValidationError):
            TokenUsageRequest(token_count=0, max_tokens=max_tokens)

    @given(token_count=st.integers(min_value=1, max_value=10_000_000))
    def test_zero_max_tokens_rejected(self, token_count: int):
        with pytest.raises(ValidationError):
            TokenUsageRequest(token_count=token_count, max_tokens=0)

    @given(
        token_count=st.integers(max_value=0),
        max_tokens=st.integers(max_value=0),
    )
    def test_negative_values_rejected(self, token_count: int, max_tokens: int):
        with pytest.raises(ValidationError):
            TokenUsageRequest(token_count=token_count, max_tokens=max_tokens)


# ===================================================================
# ContextSnippetCreateRequest
# ===================================================================


@pytest.mark.unit
class TestContextSnippetCreateRequest:
    """Property-based tests for ContextSnippetCreateRequest."""

    @given(
        name=_nonempty_text,
        content=st.text(min_size=1, max_size=1000),
        tags=st.lists(
            st.text(min_size=1, max_size=100).filter(lambda t: t.strip()),
            max_size=20,
        ),
    )
    def test_roundtrip(self, name: str, content: str, tags: list):
        obj = ContextSnippetCreateRequest(name=name, content=content, tags=tags)
        data = obj.model_dump()
        restored = ContextSnippetCreateRequest(**data)
        assert restored == obj

    @given(content=st.text(min_size=1, max_size=1000))
    def test_blank_name_rejected(self, content: str):
        """Name that is only whitespace should be rejected by the validator."""
        with pytest.raises(ValidationError):
            ContextSnippetCreateRequest(name="   ", content=content)

    @given(name=_nonempty_text)
    def test_empty_content_rejected(self, name: str):
        with pytest.raises(ValidationError):
            ContextSnippetCreateRequest(name=name, content="")

    @given(
        name=_nonempty_text,
        content=st.text(min_size=1, max_size=500),
    )
    def test_too_many_tags_rejected(self, name: str, content: str):
        tags = [f"tag{i}" for i in range(21)]
        with pytest.raises(ValidationError):
            ContextSnippetCreateRequest(name=name, content=content, tags=tags)

    @given(
        name=_nonempty_text,
        content=st.text(min_size=1, max_size=500),
    )
    def test_tag_too_long_rejected(self, name: str, content: str):
        tags = ["x" * 101]
        with pytest.raises(ValidationError):
            ContextSnippetCreateRequest(name=name, content=content, tags=tags)

    @given(name=_nonempty_text, content=st.text(min_size=1, max_size=500))
    def test_name_is_stripped(self, name: str, content: str):
        padded = f"  {name}  "
        obj = ContextSnippetCreateRequest(name=padded, content=content)
        assert obj.name == padded.strip()


# ===================================================================
# UserPreferencesUpdateRequest
# ===================================================================


@pytest.mark.unit
class TestUserPreferencesUpdateRequest:
    """Property-based tests for UserPreferencesUpdateRequest."""

    @given(
        temperature=st.floats(min_value=0.0, max_value=2.0, allow_nan=False),
        num_ctx=st.integers(min_value=512, max_value=131072),
    )
    def test_roundtrip_with_numerics(self, temperature: float, num_ctx: int):
        obj = UserPreferencesUpdateRequest(
            default_temperature=temperature, default_num_ctx=num_ctx
        )
        data = obj.model_dump()
        restored = UserPreferencesUpdateRequest(**data)
        assert restored.default_temperature == pytest.approx(
            obj.default_temperature, abs=1e-9
        )
        assert restored.default_num_ctx == obj.default_num_ctx

    @given(temperature=st.floats(min_value=2.01, max_value=100.0, allow_nan=False))
    def test_temperature_above_max_rejected(self, temperature: float):
        with pytest.raises(ValidationError):
            UserPreferencesUpdateRequest(default_temperature=temperature)

    @given(temperature=st.floats(max_value=-0.01, allow_nan=False))
    def test_temperature_below_min_rejected(self, temperature: float):
        with pytest.raises(ValidationError):
            UserPreferencesUpdateRequest(default_temperature=temperature)

    @given(num_ctx=st.integers(min_value=0, max_value=511))
    def test_num_ctx_below_min_rejected(self, num_ctx: int):
        with pytest.raises(ValidationError):
            UserPreferencesUpdateRequest(default_num_ctx=num_ctx)

    @given(
        steps=st.integers(min_value=1, max_value=150),
        cfg=st.floats(min_value=1.0, max_value=30.0, allow_nan=False),
        width=st.integers(min_value=64, max_value=4096),
        height=st.integers(min_value=64, max_value=4096),
    )
    def test_imggen_bounds_accepted(
        self, steps: int, cfg: float, width: int, height: int
    ):
        obj = UserPreferencesUpdateRequest(
            imggen_default_steps=steps,
            imggen_default_cfg_scale=cfg,
            imggen_default_width=width,
            imggen_default_height=height,
        )
        assert obj.imggen_default_steps == steps
        assert obj.imggen_default_width == width

    def test_all_none_is_valid(self):
        """Schema allows all-None payload (partial update)."""
        obj = UserPreferencesUpdateRequest()
        assert obj.default_temperature is None


# ===================================================================
# ImageGenerationRequest
# ===================================================================


@pytest.mark.unit
class TestImageGenerationRequest:
    """Property-based tests for ImageGenerationRequest."""

    @given(
        prompt=st.text(min_size=1, max_size=500),
        width=st.integers(min_value=64, max_value=2048),
        height=st.integers(min_value=64, max_value=2048),
        steps=st.integers(min_value=1, max_value=150),
        cfg_scale=st.floats(min_value=1.0, max_value=30.0, allow_nan=False),
    )
    def test_text_to_image_roundtrip(
        self, prompt: str, width: int, height: int, steps: int, cfg_scale: float
    ):
        obj = ImageGenerationRequest(
            workflow_type="text-to-image",
            prompt=prompt,
            width=width,
            height=height,
            steps=steps,
            cfg_scale=cfg_scale,
        )
        data = obj.model_dump()
        restored = ImageGenerationRequest(**data)
        assert restored.prompt == obj.prompt
        assert restored.width == obj.width
        assert restored.height == obj.height
        assert restored.steps == obj.steps
        assert restored.cfg_scale == pytest.approx(obj.cfg_scale, abs=1e-9)

    def test_empty_prompt_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="")

    def test_prompt_too_long_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="a" * 2001)

    @given(
        bad_type=st.text(min_size=1, max_size=50).filter(
            lambda t: t not in VALID_WORKFLOW_TYPES
        )
    )
    def test_invalid_workflow_type_rejected(self, bad_type: str):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(workflow_type=bad_type, prompt="test")

    def test_width_below_min_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", width=63)

    def test_width_above_max_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", width=2049)

    def test_height_below_min_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", height=63)

    def test_height_above_max_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", height=2049)

    def test_steps_below_min_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", steps=0)

    def test_steps_above_max_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", steps=151)

    def test_cfg_scale_below_min_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", cfg_scale=0.5)

    def test_cfg_scale_above_max_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", cfg_scale=31.0)

    def test_img2img_requires_input_image(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(
                workflow_type="image-to-image", prompt="test"
            )

    def test_inpainting_requires_mask(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(
                workflow_type="inpainting",
                prompt="test",
                input_image="data:image/png;base64,abc",
            )

    def test_face_morph_requires_target(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(
                workflow_type="face-morph",
                prompt="test",
                input_image="data:image/png;base64,abc",
            )

    def test_path_traversal_in_image_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(
                prompt="test", input_image="../../../etc/passwd"
            )

    @given(
        seed=st.integers(min_value=0, max_value=2**63),
        batch=st.integers(min_value=1, max_value=8),
    )
    def test_seed_and_batch_accepted(self, seed: int, batch: int):
        obj = ImageGenerationRequest(
            prompt="test", seed=seed, batch_size=batch
        )
        assert obj.seed == seed
        assert obj.batch_size == batch


# ===================================================================
# GitImportRequest
# ===================================================================


@pytest.mark.unit
class TestGitImportRequest:
    """Property-based tests for GitImportRequest."""

    @given(
        name=st.text(min_size=1, max_size=255),
        repo=st.sampled_from([
            "https://github.com/user/repo",
            "https://github.com/user/repo.git",
            "https://gitlab.com/org/project",
        ]),
        branch=st.one_of(st.none(), st.text(min_size=1, max_size=100)),
    )
    def test_roundtrip(self, name: str, repo: str, branch):
        obj = GitImportRequest(name=name, git_url=repo, branch=branch)
        data = obj.model_dump()
        restored = GitImportRequest(**data)
        assert restored == obj

    @given(name=st.text(min_size=1, max_size=255))
    def test_non_https_rejected(self, name: str):
        with pytest.raises(ValidationError):
            GitImportRequest(name=name, git_url="http://github.com/user/repo")

    @given(name=st.text(min_size=1, max_size=255))
    def test_ssh_url_rejected(self, name: str):
        with pytest.raises(ValidationError):
            GitImportRequest(name=name, git_url="git@github.com:user/repo.git")

    @given(name=st.text(min_size=1, max_size=255))
    def test_localhost_rejected(self, name: str):
        with pytest.raises(ValidationError):
            GitImportRequest(name=name, git_url="https://localhost/repo")

    @given(name=st.text(min_size=1, max_size=255))
    def test_loopback_ip_rejected(self, name: str):
        with pytest.raises(ValidationError):
            GitImportRequest(name=name, git_url="https://127.0.0.1/repo")

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            GitImportRequest(name="", git_url="https://github.com/user/repo")

    @given(name=st.text(min_size=256, max_size=300))
    def test_name_too_long_rejected(self, name: str):
        with pytest.raises(ValidationError):
            GitImportRequest(name=name, git_url="https://github.com/user/repo")
