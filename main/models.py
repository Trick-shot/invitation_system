from django.db import models


class Invitation(models.Model):
    guest = models.OneToOneField("Guest", on_delete=models.CASCADE)
    qr_code = models.ImageField(upload_to='media/qr_cards', null=True, blank=True)
    invitation_card = models.ImageField(null=True, blank=True, upload_to='media')
    scanned = models.BooleanField(default=False)
    dated_invited = models.DateTimeField(auto_now_add=True)


class Guest(models.Model):
    name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=14)
