import Axios from "axios";


const apiClient = Axios.create({
<<<<<<< HEAD
    baseURL: "http://127.0.0.1:8000/"
});
=======
    baseURL: "https://trickshot.tech/",
});          
>>>>>>> 2d0198db959d6641f88a0f26ffe94e4d306ca30c

apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem("access");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default apiClient;