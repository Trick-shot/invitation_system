import {Box, Button, Link} from "@mui/material";
import type {AxiosResponse} from "axios";
import {Html5QrcodeScanner} from "html5-qrcode";
import {useNavigate} from "react-router";
import apiClient from "../api/client.ts";
import SubButtonHeader from "../components/SubButtonHeader.tsx";
import Header from "../components/Header.tsx";
import {useEffect, useRef, useState} from "react";
import Card from "../components/Card.tsx";
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import Camera from "../components/Camera.tsx"

const Dashboard = () => {
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate();
    const [scannerOpen, setScannerOpen] = useState(false)
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const [guestCounts, setGuestCounts] = useState<{
        numberOfGuestArrived: number,
        numberOfGuestInvited: number
    }>({
        "numberOfGuestArrived": 0,
        "numberOfGuestInvited": 0
    })


    const stopScanner = async () => {
        if (scannerRef.current) {
            await scannerRef.current.clear().catch((err) => console.warn(err));
            scannerRef.current = null;
        }
        setScannerOpen(false);
    };

    useEffect(() => {
        apiClient.get("guest-count/").then((response: AxiosResponse<{
            number_of_guest_arrived: number,
            number_of_guest_invited: number
        }>) => {
            setGuestCounts({
                "numberOfGuestArrived": response.data.number_of_guest_arrived,
                "numberOfGuestInvited": response.data.number_of_guest_invited
            })
        })
        setLoading(false)
    }, [loading]);

    return (
        <>
            {scannerOpen ?
                <Camera setLoading={() => setLoading(true)} scanner={scannerOpen} scannerRef={scannerRef}
                        stopScanner={() => stopScanner()}/> :
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
                    <Card color={"#6AB473"} number={guestCounts.numberOfGuestArrived} text="Number of Guest Arrived"/>
                    <Card color={"#8B6AB4"} number={guestCounts.numberOfGuestInvited} text="Number of Guest Invited"/>
                    <Button
                        startIcon={<QrCodeScannerIcon/>}
                        variant="contained"
                        sx={{width: "86%", height: "7%", marginTop: "50%", fontSize: 17, backgroundColor: "#6F00FF"}}
                        onClick={() => setScannerOpen((prev) => !prev)}
                    >
                        SCAN QR
                    </Button>
                </Box>
            }</>

    );
}

export default Dashboard;