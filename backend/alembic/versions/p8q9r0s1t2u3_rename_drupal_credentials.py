"""rename drupal api_key_encrypted to credentials_encrypted

Revision ID: p8q9r0s1t2u3
Revises: n7o8p9q0r1s2
Create Date: 2026-02-16 20:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "p8q9r0s1t2u3"
down_revision: Union[str, None] = "n7o8p9q0r1s2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "drupal_sites",
        "api_key_encrypted",
        new_column_name="credentials_encrypted",
    )


def downgrade() -> None:
    op.alter_column(
        "drupal_sites",
        "credentials_encrypted",
        new_column_name="api_key_encrypted",
    )
