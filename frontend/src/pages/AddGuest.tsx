import {Box, TextField, Button, Alert, Link} from "@mui/material";
import type {AxiosError} from "axios";
import * as React from "react";
import {useState, useEffect} from "react";
import guestApi from "../api/guest.ts";
import SubButtonHeader from "../components/SubButtonHeader.tsx";
import Header from "../components/Header.tsx";


const AddGuest = () => {
    const [loginFailed, setLoginFailed] = useState(false);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({name: "", phoneNumber: ""});


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({...formData, [e.target.name]: e.target.value});
    };
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        // ✅ Basic validation
        if (!formData.name.trim() || !formData.phoneNumber.trim()) {
            setLoginFailed(true);
            setSuccess(false);
            console.log("Please fill in all fields.");
            return; // ⛔ stop here — don’t send to backend
        }

        // Optional: Add simple phone number validation
        const phoneRegex = /^[0-9]{10,15}$/; // adjust as needed
        if (!phoneRegex.test(formData.phoneNumber)) {
            setLoginFailed(true);
            setSuccess(false);
            console.log("Invalid phone number format.");
            return; // ⛔ stop here too
        }

        setLoading(true);

        try {
            const response = await guestApi.addGuest(formData.name, formData.phoneNumber);
            console.log(response.data);

            if (response.status === 200 || response.status === 201) {
                setSuccess(true);
                setFormData({name: "", phoneNumber: ""});
            } else {
                setLoginFailed(true);
                setSuccess(false);
            }
        } catch (e) {
            const error = e as AxiosError;
            console.log(error.message);
            setLoginFailed(true);
            setSuccess(false);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(false), 3000);
            return () => clearTimeout(timer);
        }
        if (loginFailed) {
            const timer = setTimeout(() => setLoginFailed(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [success, loginFailed]);

    return (
        <Box sx={{
            width: "100vw",
            height: "100vh",
            backgroundColor: "#03142F",
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            flexDirection: "column",

        }}> {(loginFailed || success) && (
            <Alert
                sx={{marginTop: 10, width: "85%"}}
                severity={loginFailed ? "error" : "success"}
            >
                {loginFailed ? "Add user failed" : "Add user succeeded"}
            </Alert>
        )}
            <Header/>
            <SubButtonHeader>
                <Link underline="hover" color="inherit" href="/dashboard" sx={{color: '#fff', fontSize: 16}}>
                    Home
                </Link>
                <Link underline="hover" color="inherit" href="/guests" sx={{color: '#fff', fontSize: 16}}>
                    guests
                </Link>
                <Link underline="hover" color="inherit" href="/guests" sx={{color: '#fff', fontSize: 16}}>
                    Add Guests
                </Link>
            </SubButtonHeader>
            <Box component="form" onSubmit={handleSubmit} sx={{
                display: "flex",
                flexDirection: 'column',
                width: "90%",
                height: "70%",
                marginTop: 5
            }}>
                <TextField
                    id="standard-basic"
                    label="Name"
                    variant="standard"
                    name="name"
                    type="text"
                    value={formData.name}
                    required
                    onChange={handleChange}
                    fullWidth
                    sx={{
                        marginTop: 5,
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
                    label="Phone Number"
                    variant="standard"
                    fullWidth
                    name="phoneNumber"
                    required
                    type="text"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    sx={{
                        marginTop: 5,
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
                            borderBottomColor: "white"
                        },
                    }}
                />

                <Button variant="contained" type={"submit"} loading={loading} sx={{
                    marginTop: 10,
                    height: "10%",
                    backgroundColor: '#6F00FF'
                }}>submit</Button>
            </Box>
        </Box>
    );
}

export default AddGuest;