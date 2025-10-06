import Axios from "axios";


const apiClient = Axios.create({
    baseURL: "http://127.0.0.1:8000/api/",
});

apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("access");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default apiClient;