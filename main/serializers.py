import os.path
from zipapp import create_archive

import segno
from PIL.ImageOps import scale
from rest_framework.serializers import ModelSerializer
from django.conf import settings
from django.urls import reverse
from rest_framework import serializers
from .models import Invitation, Guest
from PIL import Image
import qr_code


class InvitationSerializer(ModelSerializer):
    guest_name = serializers.CharField(max_length=255, source='guest.name')
    phone_number = serializers.CharField(max_length=255, source='guest.phone_number')

    class Meta:
        model = Invitation
        fields = ["id", "guest_name", "phone_number", "qr_code", "scanned", "dated_invited"]

    # TODO : Implement error handling for duplicate entry
    def create(self, validated_data):
        guest_data = validated_data.pop("guest")
        guest = Guest.objects.create(
            name=guest_data["name"],
            phone_number=guest_data["phone_number"]
        )

        invitation = Invitation.objects.create(guest=guest, **validated_data)

        # Scan URL
        scan_url = f"{settings.SITE_URL}{reverse('invitation-scan', args=[invitation.id])}"

        # Paths
        card_template_path = os.path.join(settings.MEDIA_ROOT, "card_template.png")
        final_card_path = os.path.join(settings.MEDIA_ROOT, f"cards/invitation_card_{invitation.id}.png")
        qr_path = os.path.join(settings.MEDIA_ROOT, f"qr_codes/qr_{invitation.id}.png")
        os.makedirs(os.path.dirname(final_card_path), exist_ok=True)
        os.makedirs(os.path.dirname(qr_path), exist_ok=True)

        # Generate QR
        qr = segno.make(scan_url)
        dpi = 300
        slot_width_mm = 18.78
        slot_width_px = int((slot_width_mm / 25.4) * dpi)
        scale = slot_width_px // qr.symbol_size()[0]

        qr.save(qr_path, scale=scale)

        # Open template and paste QR
        card = Image.open(card_template_path)
        qr_img = Image.open(qr_path)

        dpi = 300
        x_mm, y_mm = 46, 109.8
        x_px = int((x_mm / 25.4) * dpi)
        y_px = int((y_mm / 25.4) * dpi)

        card.paste(qr_img, (x_px, y_px))  # adjust position to your slot
        card.save(final_card_path)

        # Save path to model
        invitation.qr_code = f"cards/invitation_card_{invitation.id}.png"
        invitation.save()

        return invitation


class GuestSerializer(ModelSerializer):
    class Meta:
        model = Guest
        fields = ["id", "name", "phone_number"]
