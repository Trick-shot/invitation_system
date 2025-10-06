import {Box, Button, Link} from "@mui/material";

import {useNavigate} from "react-router";
import SubButtonHeader from "../components/SubButtonHeader.tsx";
import Header from "../components/Header.tsx";
import {Camera} from "react-camera-pro";
import {useState} from "react";
import Card from "../components/Card.tsx";
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';

const Dashboard = () => {
    const navigate = useNavigate();
    // const camera = useRef<Camera>(null);
    // const [image, setImage] = useState<string | null>(null);
    const [cameraOn, setCameraOn] = useState(false);

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
            <SubButtonHeader
                button={<Button variant="contained" onClick={() => navigate('/guests')} sx={{
                    width: "50%"
                }}>Guest</Button>}>
                <Link underline="hover" color="inherit" href="/" sx={{color: '#fff', fontSize: 16}}>
                    Home
                </Link>
            </SubButtonHeader>
            {cameraOn && (
                <Camera
                    // ref={camera}
                    errorMessages={{
                        noCameraAccessible: undefined,
                        permissionDenied: undefined,
                        switchCamera: undefined,
                        canvas: undefined,
                    }}
                />
            )}
            <Card color={"#6AB473"}/>
            <Card color={"#8B6AB4"}/>
            <Button
                startIcon={<QrCodeScannerIcon/>}
                variant="contained"
                sx={{width: "86%", height: "7%", marginTop: "50%", fontSize: 15}}
                onClick={() => setCameraOn((prev) => !prev)}
            >
                {cameraOn ? "Close Camera" : "SCAN QR"}
            </Button>
        </Box>
    );
}

export default Dashboard;