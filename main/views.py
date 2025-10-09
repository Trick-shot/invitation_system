# -*- coding: utf-8 -*-
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.utils.representation import serializer_repr
from rest_framework.viewsets import ModelViewSet
from django.conf import settings
from django.urls import reverse
from PIL import Image
import os.path
import africastalking
import segno
from .serializers import InvitationSerializer, GuestCountSerializer
from .models import Invitation


class InvitationViewSet(ModelViewSet):
    serializer_class = InvitationSerializer
    queryset = Invitation.objects.all()

    @action(detail=True, methods=['post'])
    def scan(self, request, pk=None):
        try:
            invitation = self.get_object()
            if invitation.scanned:
                return Response(
                    {"error": "This invitation has already been scanned."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            invitation.scanned = True
            invitation.save()
            return Response(
                {"message": f"Invitation for {invitation.guest.name} scanned successfully!"},
                status=status.HTTP_200_OK
            )
        except Invitation.DoesNotExist:
            return Response({"error": "Invitation not found"}, status=status.HTTP_404_NOT_FOUND)

    def generate_card(self, invitation):
        scan_url = f"{settings.SITE_URL}{reverse('invitation-scan', args=[invitation.id])}"

        download_url = f"{settings.SITE_URL}{settings.MEDIA_URL}cards/invitation_card_{invitation.id}.png"
        print("SITE_URL used:", settings.SITE_URL)

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

        invitation.qr_code = f"cards/invitation_card_{invitation.id}.png"
        invitation.save()

        card.paste(qr_img, (x_px, y_px))
        card.save(final_card_path)
        return card, download_url

    def send_invitation(self, recipients, card_link):
        africastalking.initialize(settings.AFRICASTALKING_USERNAME, settings.AFRICASTALKING_API_KEY)
        message = (
            "Kwa mioyo iliyojaa furaha na shukrani, familia ya Bw & Bibi Moses Nyoni inakualika katika tafrija ya adhimisho la Sakramenti ya komunio ya kwanza ya watoto wao wapendwa, Edin Kanduta na Edinson Kahangulila.Zingatia: Watoto hawaruhusiwi. Bofya hapa kupata kadi ya mwaliko \n"
            + card_link
        )

        # Sending on SMS
        sms = africastalking.SMS
        whatsapp = africastalking.Whatsapp
        wa_number = "+255684581734"

        # Send SMS to all recipients
        response_sms = sms.send(message, recipients)

        # # Send WhatsApp individually
        # for recipient in recipients:
        #     body = {"message": "Hello! This is a test WhatsApp message from Africa's Talking."}
        #     response_whatsapp = whatsapp.send(body=body, wa_number=wa_number, phone_number=recipient)
        #     print("WhatsApp response:", response_whatsapp)

        print("SMS response:", response_sms)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)

        invitation_id = response.data["id"]
        invitation = Invitation.objects.get(id=invitation_id)

        card, download_url = self.generate_card(invitation)

        if invitation.guest and invitation.guest.phone_number:
            self.send_invitation([invitation.guest.phone_number], download_url)
        return response


class GuestAPIVIEW(ListAPIView):
    queryset = Invitation.objects.all()
    serializer_class = GuestCountSerializer

    def get(self, request, *args, **kwargs):
        guest_arrived = Invitation.objects.filter(scanned=True).count()
        guest_invited = Invitation.objects.all().count()

        data = {
            "number_of_guest_arrived": guest_arrived,
            "number_of_guest_invited": guest_invited,
        }

        serializer = self.get_serializer(data)
        return Response(serializer.data)
