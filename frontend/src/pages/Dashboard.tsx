import {Box} from "@mui/material";
import {useNavigate} from "react-router";
import SubButtonHeader from "../components/SubButtonHeader.tsx";
import Header from "../components/Header.tsx";

const Dashboard = () => {
    const navigate = useNavigate();
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
        </Box>
    );
}

export default Dashboard;