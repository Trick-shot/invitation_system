import {Box, TextField, Button} from "@mui/material";
import type {AxiosError} from "axios";
import {useState} from "react";
import {useNavigate} from "react-router";
import guestApi from "../api/guest.ts";
import SubButtonHeader from "../components/SubButtonHeader.tsx";
import Header from "../components/Header.tsx";

const AddGuest = () => {
    const [loginFailed, setLoginFailed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({name: "", phoneNumber: ""});
    const navigate = useNavigate();


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({...formData, [e.target.name]: e.target.value});
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await guestApi.addGuest(formData.name, formData.phoneNumber);
            console.log(response.data)
            setLoginFailed(false);
            setLoading(false);
        } catch (e) {
            const error = e as AxiosError;
            console.log(error.message);
            setLoading(false);
            setLoginFailed(true);
        }
    };

    return (
        <Box sx={{
            width: "100vw",
            height: "100vh",
            backgroundColor: "#03142F",
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            flexDirection: "column",

        }}>
            <Header/>
            <SubButtonHeader buttonText='Guest' onClick={() => navigate('/guests')}/>
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
                    backgroundColor: 'green'
                }}>submit</Button>
            </Box>
        </Box>
    );
}

export default AddGuest;