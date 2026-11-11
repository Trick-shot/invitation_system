"""Beem provider: request shape and response handling, against a mocked HTTP endpoint."""

import json

import pytest
import responses

from apps.messaging.providers import BeemProvider, ProviderError, ProviderTransientError

URL = "https://beem.test/v1/send"


def provider():
    return BeemProvider("key", "secret", "INFO", send_url=URL)


@responses.activate
def test_beem_payload_uses_numeric_recipient_id_and_bare_msisdn():
    responses.post(URL, json={"successful": True, "request_id": 4242, "code": 100, "message": "ok"})
    result = provider().send(to="+255766719100", body="Hello {name}", reference="d17")
    sent = json.loads(responses.calls[0].request.body)
    assert sent["source_addr"] == "INFO"
    assert sent["recipients"] == [{"recipient_id": 17, "dest_addr": "255766719100"}]
    assert responses.calls[0].request.headers["Authorization"].startswith("Basic ")
    assert result.accepted and result.provider_message_id == "4242"


def test_recipient_id_from_any_reference():
    assert BeemProvider.recipient_id("d17") == 17
    assert BeemProvider.recipient_id("3f9a1c") == 391  # uuid hex: digits only
    assert BeemProvider.recipient_id("abc") == 1
    assert BeemProvider.recipient_id("d12345678901234") == 678901234  # capped at 9 digits


@responses.activate
def test_beem_rejection_is_a_provider_error_with_their_message():
    responses.post(URL, json={"successful": False, "message": "Missing or invalid reference ID."}, status=200)
    with pytest.raises(ProviderError, match="reference ID"):
        provider().send(to="+255766719100", body="x", reference="d1")


@responses.activate
def test_beem_5xx_is_transient():
    responses.post(URL, body="gateway down", status=502)
    with pytest.raises(ProviderTransientError):
        provider().send(to="+255766719100", body="x", reference="d1")
