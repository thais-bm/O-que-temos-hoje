"""Testes para o pipeline de engenharia de dados (src/data)."""

from __future__ import annotations

from src.data.pipeline import prepare_data


def test_prepare_data_keys():
    d = prepare_data()
    expected = {"games", "metadata", "users", "recommendations", "item_matrix", "app_ids", "features"}
    assert set(d.keys()) == expected
    assert d["item_matrix"] is not None
    assert len(d["app_ids"]) > 0
    assert len(d["features"]) > 0
