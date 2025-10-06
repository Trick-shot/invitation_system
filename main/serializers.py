from rest_framework.serializers import ModelSerializer
from rest_framework import serializers, status
from .models import Invitation, Guest


class InvitationSerializer(ModelSerializer):
    guest_name = serializers.CharField(max_length=255, source='guest.name')
    phone_number = serializers.CharField(max_length=255, source='guest.phone_number')

    class Meta:
        model = Invitation
        fields = ["id", "guest_name", "phone_number", "qr_code", "scanned", "dated_invited"]

    def create(self, validated_data):
        guest_data = validated_data.pop("guest")

        # Normalize phone number
        phone_number = guest_data["phone_number"]
        phone_number = str(phone_number).strip()  # remove spaces

        # If it starts with 0, replace with +255
        if phone_number.startswith("0"):
            phone_number = "+255" + phone_number[1:]
        elif not phone_number.startswith("+"):
            phone_number = "+" + phone_number  # fallback, ensure it starts with +

        # Check for existing guest
        existing_guest = Guest.objects.filter(phone_number=phone_number).first()
        if existing_guest:
            raise serializers.ValidationError({"phone": "Guest with this phone number already invited"})

        # Create guest
        guest = Guest.objects.create(
            name=guest_data["name"],
            phone_number=phone_number
        )

        invitation = Invitation.objects.create(guest=guest, **validated_data)
        return invitation

    def update(self, instance, validated_data):
        guest_data = validated_data.pop("guest", None)

        if guest_data:
            guest = instance.guest
            guest.name = guest_data.get("name", guest.name)
            guest.phone_number = guest_data.get("phone_number", guest.phone_number)
            guest.save()

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance


class GuestSerializer(ModelSerializer):
    class Meta:
        model = Guest
        fields = ["id", "name", "phone_number"]


class GuestCountSerializer(serializers.Serializer):
    number_of_guest_arrived = serializers.IntegerField()
    number_of_guest_invited = serializers.IntegerField()
