import {Box, Breadcrumbs, Button, Typography, Stack} from "@mui/material";

interface SubButtonHeaderInterface {
    onClick: () => void;
    buttonText: string
}

const SubButtonHeader = ({onClick, buttonText}: SubButtonHeaderInterface) => {
    return (
        <Box sx={{
            marginTop: "20%",
            width: "86%"
        }}>
            <Stack width="100%" flexDirection="row" justifyContent="flex-end">
                <Button variant="contained" onClick={onClick} sx={{
                    width: "40%"
                }}>{buttonText}</Button>
            </Stack>
            <Breadcrumbs color="#fff" sx={{
                marginTop: 2
            }}>
                <Typography sx={{color: '#fff', fontSize: 16}}>Home</Typography>
                <Typography sx={{color: '#fff', fontSize: 16}}>Breadcrumbs</Typography>
            </Breadcrumbs>
        </Box>
    )
}
export default SubButtonHeader;