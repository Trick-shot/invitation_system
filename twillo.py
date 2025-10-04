from twilio.rest import Client

account_sid = 'ACb62222a524efc088397b7b8aefdcdeff'
auth_token = '05836f13dd091a50714194519e1ea9a5'
client = Client(account_sid, auth_token)

client.messages.create(
    from_="whatsapp:+255766719100",
    body="Hello, there!",
    to="whatsapp:+255684581734",
)
