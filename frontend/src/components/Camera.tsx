import {Box, Button, Typography} from "@mui/material";
import {useEffect, useState} from "react";
import {Html5QrcodeScanner} from "html5-qrcode";
import DoneGif from "../components/DoneGif.tsx";
import apiClient from "../api/client.ts";

interface CameraProps {
    scanner: boolean;
    stopScanner: () => void;
    scannerRef: React.MutableRefObject<Html5QrcodeScanner | null>;
    setLoading: () => void;
}

const Camera: React.FC<CameraProps> = ({scanner, stopScanner, scannerRef, setLoading}) => {
    const [success, setSuccess] = useState(false);
    const [scanFailed, setScanFailed] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (scanner) {
            const onScanSuccess = async (decodedText: string) => {
                try {
                    const match = decodedText.match(/invitations\/(\d+)\//);
                    const id = match ? match[1] : decodedText;

                    const res = await apiClient.post(
                        `main/invitations/${id}/scan/`
                    );

                    if (res.data.message) {
                        setMessage(res.data.message);
                        setSuccess(true);
                        setTimeout(() => {
                            setSuccess(false);
                            stopScanner();
                            setLoading();
                        }, 3000);
                    } else if (res.status === 400) {
                        setScanFailed(true);
                        setTimeout(() => {
                            setScanFailed(false);
                            stopScanner();
                            setLoading();
                        }, 3000);
                    }

                } catch (error: unknown) {
                    console.error("Scan update failed:", error);
                    setScanFailed(true);
                    stopScanner();
                }
            };

            const onScanFailure = (error: unknown) => {
                console.warn(`Scan error: ${error}`);
            };

            scannerRef.current = new Html5QrcodeScanner(
                "reader",
                {fps: 10, qrbox: {width: 250, height: 250}},
                false
            );

            scannerRef.current.render(onScanSuccess, onScanFailure);
        }

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(() => {
                });
                scannerRef.current = null;
            }
        };
    }, [scanner]);

    return (
        <>
            {(success || scanFailed) ? <DoneGif statusText={success ? 'success' : 'failed'}/> : (
                <Box
                    sx={{
                        width: "100vw",
                        height: "100vh",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                        backgroundColor: "#03142F",
                    }}
                >
                    {!success && (
                        <>
                            <Box id="reader" sx={{width: 600, height: 600}}/>
                            <Button
                                variant="outlined"
                                color="error"
                                onClick={stopScanner}
                                sx={{marginTop: 2}}
                            >
                                Close Scanner
                            </Button>
                        </>
                    )}

                    {success && (
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#00FF7F",
                                animation: "fadeIn 0.5s ease-in",
                            }}
                        >
                            <Typography variant="h4" sx={{marginBottom: 2}}>
                                ✅ Scanned Successfully!
                            </Typography>
                            <Typography variant="body1">{message}</Typography>
                        </Box>
                    )}
                </Box>
            )}
        </>
    );
};

export default Camera;
