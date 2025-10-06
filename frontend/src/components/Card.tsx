import {Box, Stack, Typography} from "@mui/material"
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';

const Card = ({color, number, text}: { color: string, number: number, text: string }) => {
    return (
        <Box sx={{
            backgroundColor: "#fff",
            width: "80%",
            height: "12%",
            marginTop: 3,
            borderRadius: 1,
            display: 'flex',
            flexDirection: 'row', justifyContent: "flex-start",
            alignItems: "center",
            paddingX: 2
        }}>
            <Box sx={{
                width: 80,
                height: 80,
                borderRadius: 40,
                display: 'flex',
                flexDirection: 'row',
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: color,
            }}>
                <SupervisorAccountIcon sx={{
                    color: '#fff',
                    width: 300
                }}/>
            </Box>
            <Stack width="100%" height="100%" paddingLeft={4} paddingTop={4}>
                <Typography fontSize={15}>{text}</Typography>
                <Stack flexDirection={"row"} width="100%" justifyContent={"space-between"}>
                    <Typography fontSize={35}>{number}</Typography>
                    <Typography fontSize={12} marginTop={4} marginRight={2}>Guests</Typography>
                </Stack>
            </Stack>
        </Box>
    )
}
export default Card