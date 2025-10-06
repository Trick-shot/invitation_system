import {Box} from "@mui/material";
import {BlinkBlur} from "react-loading-indicators";

const LoadingIndicator = () => {
    return (
        <Box
            sx={{
                width: "100vw",
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#03142F",
            }}
        >
            <BlinkBlur color="#BA68C8" size="medium" text="" textColor="#BA68C8"/>
        </Box>
    );
};

export default LoadingIndicator;
