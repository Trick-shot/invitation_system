import {Box} from "@mui/material";
import {useEffect, useState} from "react";
import doneGif from '../assets/Done.mp4'
import Failed from '../assets/Failed.mp4'

const DoneGif = ({statusText}: { statusText: string }) => {
    const [status, setStatus] = useState<string | null>(null);
    useEffect(() => {
        setStatus(statusText)
    }, []);
    return (
        <Box sx={{
            backgroundColor: '#fff',
            width: "100vw",
            height: '100vh',
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "column",
            display: 'flex'
        }}>
            <> {status === "success" ?
                <video
                    src={doneGif}
                    autoPlay
                    loop
                    muted
                    style={{width: 400, height: 400}}
                /> : status === "failed" ? <video
                    src={Failed}
                    autoPlay
                    loop
                    muted
                    style={{width: 400, height: 400}}
                /> : null
            }

            </>


        </Box>
    )
}

export default DoneGif;