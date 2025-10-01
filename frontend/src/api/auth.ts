import apiClient from "./client";

const login = (email: string, password: string) =>
    apiClient.post("auth/api/token/", {email, password});

export default {login}