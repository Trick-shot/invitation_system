import {Box, Stack, Typography} from "@mui/material"
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';

const Card = ({color}: { color: string }) => {
    return (
        <Box sx={{
            backgroundColor: "#fff",
            width: "80%",
            height: "13%",
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
                <Typography>Number of Guest arrived</Typography>
                <Stack flexDirection={"row"} width="100%" justifyContent={"space-between"}>
                    <Typography fontSize={40}>100</Typography>
                    <Typography fontSize={15} marginTop={4} marginRight={2}>Guests</Typography>
                </Stack>
            </Stack>
        </Box>
    )
}
export default Card