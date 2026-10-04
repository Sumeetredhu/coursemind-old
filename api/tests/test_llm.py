import pytest
from google.genai import errors
from pydantic import BaseModel

from app import llm


class Reply(BaseModel):
    text: str


class FakeResponse:
    def __init__(self, text):
        self.parsed = Reply(text=text)
        self.text = None


def daily_limit_error(model):
    return errors.APIError(
        429,
        {
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": f"Quota exceeded, limit: 20, model: {model}",
                "details": [
                    {"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"},
                    {"retryDelay": "1635s"},
                ],
            }
        },
    )


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch):
    monkeypatch.setattr(llm, "_out_until", {})
    monkeypatch.setattr(llm.settings, "smart_models", "model-a,model-b")
    monkeypatch.setattr(llm.settings, "llm_rpm", 6000)


def test_switches_model_when_daily_limit_hits(monkeypatch):
    calls = []

    def generate(model, contents, config):
        calls.append(model)
        if model == "model-a":
            raise daily_limit_error(model)
        return FakeResponse(f"from {model}")

    monkeypatch.setattr(llm.client.models, "generate_content", generate)
    assert llm.ask("hi", Reply, smart=True).text == "from model-b"
    assert llm.ask("hi again", Reply, smart=True).text == "from model-b"
    assert calls == ["model-a", "model-b", "model-b"]


def test_out_of_quota_when_every_model_is_used_up(monkeypatch):
    def generate(model, contents, config):
        raise daily_limit_error(model)

    monkeypatch.setattr(llm.client.models, "generate_content", generate)
    with pytest.raises(llm.OutOfQuota) as caught:
        llm.ask("hi", Reply, smart=True)
    assert 1600 < caught.value.wait <= 1635


def test_busy_model_falls_back(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)
    calls = []

    def generate(model, contents, config):
        calls.append(model)
        if model == "model-a":
            raise errors.APIError(503, {"error": {"message": "high demand", "status": "UNAVAILABLE"}})
        return FakeResponse(f"from {model}")

    monkeypatch.setattr(llm.client.models, "generate_content", generate)
    assert llm.ask("hi", Reply, smart=True).text == "from model-b"
    assert calls == ["model-a", "model-a", "model-b"]


def test_used_up_reads_retry_delay():
    assert llm._used_up(daily_limit_error("x")) == 1635.0
    minute_limit = errors.APIError(429, {"error": {"message": "PerMinute quota", "status": "RESOURCE_EXHAUSTED"}})
    assert llm._used_up(minute_limit) is None
    no_free_tier = errors.APIError(429, {"error": {"message": "limit: 0, model: pro", "status": "RESOURCE_EXHAUSTED"}})
    assert llm._used_up(no_free_tier) == 24 * 3600
