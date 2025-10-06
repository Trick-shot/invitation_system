import {Box, Button, Link} from "@mui/material";
import {useEffect} from "react";
import {useNavigate} from "react-router";
// import apiClient from "../api/client.ts";
// import GuestTable from "../components/GuestTable.tsx";
import SubButtonHeader from "../components/SubButtonHeader.tsx";

interface Guest {
    id: number;
    name: string;
    phoneNumber: number;
}

import Header from "../components/Header.tsx";


const Guest = () => {
    // const [guests, setGuests] = useState<Guest[]>([]);
    // const [setLoading] = useState(true);
    const navigate = useNavigate();


    // const getGuests = async (): Promise<Guest[]> => {
    //     const response = await apiClient.get("/main/invitations/");
    //     // Map phoneNumber to number
    //     return response.data.map((guest: {
    //         id: number,
    //         guest_name: "string",
    //         phone_number: "string"
    //     }) => ({
    //         id: guest.id,
    //         name: guest.guest_name,
    //         phoneNumber: guest.phone_number,
    //     }));
    // };

    useEffect(() => {
        const fetchGuests = async () => {
            try {
                // const data = await getGuests();
                // setGuests(data);
            } catch (error) {
                console.error("Failed to fetch guests", error);
            } finally {
                // setLoading(false);
            }
        };

        fetchGuests();
    }, []);

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
                button={<Button variant="contained" onClick={() => navigate('/addGuests')} sx={{
                    width: "40%"
                }}>Add Guest</Button>}>
                <Link underline="hover" color="inherit" href="/dashboard" sx={{color: '#fff', fontSize: 16}}>
                    Home
                </Link>
                <Link underline="hover" color="inherit" href="/guests" sx={{color: '#fff', fontSize: 16}}>
                    guests
                </Link>
            </SubButtonHeader>
            {/*<GuestTable rows={guests}/>*/}
        </Box>
    );
}

export default Guest;