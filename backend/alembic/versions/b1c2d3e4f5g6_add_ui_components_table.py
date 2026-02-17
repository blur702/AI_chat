"""add ui_components table

Revision ID: b1c2d3e4f5g6
Revises: a95f2e39edc9
Create Date: 2026-02-16 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5g6'
down_revision: Union[str, Sequence[str], None] = 'a95f2e39edc9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ui_components',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('is_framework_specific', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('framework', sa.String(50), nullable=True),
        sa.Column('html_template', sa.Text(), nullable=False),
        sa.Column('framework_code', sa.Text(), nullable=True),
        sa.Column('props_schema', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('preview_image', sa.Text(), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('is_mobile_responsive', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_ui_components_category', 'ui_components', ['category'])
    op.create_index('idx_ui_components_framework', 'ui_components', ['framework'])

    # Add trigger to auto-update updated_at on row modification
    op.execute("""
        CREATE OR REPLACE FUNCTION update_ui_components_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_ui_components_updated_at
        BEFORE UPDATE ON ui_components
        FOR EACH ROW
        EXECUTE FUNCTION update_ui_components_updated_at();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_ui_components_updated_at ON ui_components")
    op.execute("DROP FUNCTION IF EXISTS update_ui_components_updated_at()")
    op.drop_index('idx_ui_components_framework', table_name='ui_components')
    op.drop_index('idx_ui_components_category', table_name='ui_components')
    op.drop_table('ui_components')
