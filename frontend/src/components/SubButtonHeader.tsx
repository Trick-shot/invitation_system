import {Box, Breadcrumbs, Stack} from "@mui/material";
import {type ReactElement, type ReactNode} from "react";


interface SubButtonHeaderInterface {
    button?: ReactElement;
    children: ReactNode;
}

const SubButtonHeader = ({button, children}: SubButtonHeaderInterface) => {
    return (
        <Box sx={{marginTop: "20%", width: "86%"}}>


            <Stack width="100%" flexDirection="row" justifyContent="flex-end">
                {button}
            </Stack>

            <Breadcrumbs color="#fff" sx={{marginTop: 2}}>
                {children}
            </Breadcrumbs>
        </Box>
    );
};

export default SubButtonHeader;
