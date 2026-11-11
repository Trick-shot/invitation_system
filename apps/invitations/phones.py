"""
Phone normalisation. Uses the workspace's default country, never a
hardcoded +255: a Kenyan client's 07xx numbers must become +254.
"""

import phonenumbers
from phonenumbers import NumberParseException


class PhoneError(ValueError):
    pass


def normalise(raw: str, default_country: str = "TZ") -> str:
    text = (raw or "").strip()
    if not text:
        raise PhoneError("Number is empty")
    digits = "".join(ch for ch in text if ch.isdigit() or ch == "+")
    if len(digits.lstrip("+")) < 7:
        raise PhoneError("Number too short")
    try:
        number = phonenumbers.parse(digits, default_country)
    except NumberParseException as exc:
        raise PhoneError("Not a phone number") from exc
    if not phonenumbers.is_valid_number(number):
        raise PhoneError("Not a valid number for its country")
    return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)


def pretty(e164: str) -> str:
    try:
        return phonenumbers.format_number(phonenumbers.parse(e164, None), phonenumbers.PhoneNumberFormat.INTERNATIONAL)
    except NumberParseException:
        return e164
