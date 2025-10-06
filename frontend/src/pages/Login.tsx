import {Box, Button, Stack, TextField, Typography} from "@mui/material";
import type {AxiosError} from "axios";
import {jwtDecode} from "jwt-decode";
import {useContext, useState} from "react";
import {useNavigate} from "react-router";
import authApi from "../api/auth.ts";
import CrossImage from "../assets/cross image.png";
import Pic1 from "../assets/pic1.jpeg";
import Pic2 from "../assets/pic2.jpeg";
import authContext from "../context/authContext.tsx";
import type {UserApiType} from "../types/UserType.ts";

const Login = () => {
    const [, setLoginFailed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({email: "", password: ""});


    const {setAuthUser} = useContext(authContext);
    const navigate = useNavigate();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({...formData, [e.target.name]: e.target.value});
    };

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await authApi.login(formData.email, formData.password);
            const user: UserApiType = await jwtDecode(response.data["access"]);
            const userObject = {
                userId: user.user_id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
            };

            localStorage.setItem("accessToken", response.data["access"]);
            localStorage.setItem("refreshToken", response.data["refresh"]);
            console.log(response.data);
            setLoginFailed(false);
            setAuthUser(userObject);
            setLoading(false);
            navigate("/dashboard");
        } catch (e) {
            const error = e as AxiosError;
            console.log(error.message);
            setLoading(false);
            setLoginFailed(true);
        }
    };

    return (
        <Box
            component="form"
            onSubmit={handleLogin}
            sx={{
                width: "100vw",
                height: "100vh",
                backgroundColor: "#03142F",
                display: "flex",
                justifyContent: "flex-start",
                alignItems: "center",
                flexDirection: "column",
            }}
        >
            <Box component="img" src={CrossImage} width={20.6} height={33} marginTop={2}/>
            <Typography
                sx={{
                    width: 315,
                    height: 73,
                    fontSize: 28,
                    textAlign: "center",
                    color: "#C69738",
                    fontFamily: "Cardo",
                }}
            >
                HOLY COMMUNION CELEBRATION
            </Typography>

            <Stack
                flexDirection="row"
                justifyContent="space-between"
                width={309}
                height={110}
                marginTop={10}
            >
                <Box
                    component="img"
                    src={Pic2}
                    sx={{
                        width: 110,
                        height: 110,
                        borderRadius: "50%",
                        objectFit: "cover",
                        mt: 1.5, // 👈 Moves the image slightly down
                    }}
                />

                <Typography
                    sx={{
                        marginTop: 5,
                        fontSize: 28,
                        textAlign: "center",
                        color: "#C69738",
                        fontFamily: "Cardo",
                    }}
                >
                    &
                </Typography>

                <Box
                    component="img"
                    src={Pic1}
                    sx={{
                        width: 110,
                        height: 110,
                        borderRadius: "50%",
                        objectFit: "cover",
                        mt: 1.5, // 👈 Moves the second image down too
                    }}
                />
            </Stack>

            <Stack width={"90%"} marginTop={7} height={150} justifyContent={"space-between"}>
                <TextField
                    label="Email"
                    variant="standard"
                    name="email"
                    type="email"
                    value={formData.email}
                    required
                    onChange={handleChange}
                    fullWidth
                    sx={{
                        "& .MuiInputBase-input": {
                            color: "white",
                        },
                        "& .MuiInputLabel-root": {
                            color: "white",
                        },
                        "& .MuiInput-underline:before": {
                            borderBottomColor: "white",
                        },
                        "& .MuiInput-underline:hover:before": {
                            borderBottomColor: "white",
                        },
                        "& .MuiInput-underline:after": {
                            borderBottomColor: "white",
                        },
                    }}
                />

                <TextField
                    id="standard-basic"
                    label="Password"
                    variant="standard"
                    fullWidth
                    name="password"
                    required
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    sx={{
                        "& .MuiInputBase-input": {
                            color: "white",
                        },
                        "& .MuiInputLabel-root": {
                            color: "white",
                        },
                        "& .MuiInput-underline:before": {
                            borderBottomColor: "white",
                        },
                        "& .MuiInput-underline:hover:before": {
                            borderBottomColor: "white",
                        },
                        "& .MuiInput-underline:after": {
                            borderBottomColor: "white",
                        },
                    }}
                />
            </Stack>

            <Button
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{
                    width: "90%",
                    height: "7%",
                    backgroundColor: "#BA68C8",
                    borderRadius: 7,
                    marginTop: 20,
                }}
            >
                Login
            </Button>
        </Box>

    );
};

export default Login;
