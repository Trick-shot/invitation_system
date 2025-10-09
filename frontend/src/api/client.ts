import Axios from "axios";


const apiClient = Axios.create({
    baseURL: "https://trickshot.tech/api/",
});

apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("access");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default apiClient;