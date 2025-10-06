import apiClient from "./client";

const addGuest = (name: string, phoneNumber: string) =>
    apiClient.post("api/invitations/", {
        "guest_name": name, "phone_number": phoneNumber, "qr_code": null,
        "scanned": false
    });

export default {addGuest}