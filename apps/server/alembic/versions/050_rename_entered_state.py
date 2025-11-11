"""Rename ticker state 'entered' to 'ordered'.

Revision ID: 050_rename_entered_state
Revises: 049_add_trade_order_price
Create Date: 2025-11-11 00:30:00
"""

from __future__ import annotations

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "050_rename_entered_state"
down_revision: Union[str, None] = "049_add_trade_order_price"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize_state_transitions(transitions: list) -> tuple[list, bool]:
    """Convert any 'entered' transitions to 'ordered'."""
    changed = False
    normalized: list = []
    for item in transitions or []:
        updated = dict(item)
        if updated.get("to_state") == "entered":
            updated["to_state"] = "ordered"
            changed = True
        if updated.get("from_state") == "entered":
            updated["from_state"] = "ordered"
            changed = True
        normalized.append(updated)
    return normalized, changed


def upgrade() -> None:
    conn = op.get_bind()

    # Fetch ticker states that still reference the legacy 'entered' state
    result = conn.execute(
        sa.text(
            """
            SELECT id, current_state, state_transitions
            FROM ticker_states
            WHERE current_state = 'entered'
               OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(coalesce(state_transitions::jsonb, '[]'::jsonb)) elem
                    WHERE elem->>'to_state' = 'entered'
                       OR elem->>'from_state' = 'entered'
               )
            """
        )
    )

    rows = result.mappings().all()

    for row in rows:
        current_state = row["current_state"]
        transitions_raw = row["state_transitions"] or []
        transitions, changed = _normalize_state_transitions(transitions_raw)

        if current_state == "entered":
            current_state = "ordered"
            changed = True

        if changed:
            conn.execute(
                sa.text(
                    """
                    UPDATE ticker_states
                    SET current_state = :current_state,
                        state_transitions = :transitions
                    WHERE id = :id
                    """
                ),
                {
                    "current_state": current_state,
                    "transitions": json.dumps(transitions),
                    "id": row["id"],
                },
            )


def downgrade() -> None:
    conn = op.get_bind()

    # Revert states back to 'entered'
    result = conn.execute(
        sa.text(
            """
            SELECT id, current_state, state_transitions
            FROM ticker_states
            WHERE current_state = 'ordered'
               OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(coalesce(state_transitions::jsonb, '[]'::jsonb)) elem
                    WHERE elem->>'to_state' = 'ordered'
                       OR elem->>'from_state' = 'ordered'
               )
            """
        )
    )

    rows = result.mappings().all()

    for row in rows:
        current_state = row["current_state"]
        transitions_raw = row["state_transitions"] or []
        transitions = []
        changed = False
        for item in transitions_raw:
            updated = dict(item)
            if updated.get("to_state") == "ordered":
                updated["to_state"] = "entered"
                changed = True
            if updated.get("from_state") == "ordered":
                updated["from_state"] = "entered"
                changed = True
            transitions.append(updated)

        if current_state == "ordered":
            current_state = "entered"
            changed = True

        if changed:
            conn.execute(
                sa.text(
                    """
                    UPDATE ticker_states
                    SET current_state = :current_state,
                        state_transitions = :transitions
                    WHERE id = :id
                    """
                ),
                {
                    "current_state": current_state,
                    "transitions": json.dumps(transitions),
                    "id": row["id"],
                },
            )

