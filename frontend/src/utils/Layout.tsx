import {Box} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import type {ReactElement} from "react";

interface LayoutProps {
    header: ReactElement;
    footer: ReactElement;
    main: ReactElement;
}

const Layout = ({header, footer, main}: LayoutProps) => {
    const theme = useTheme();
    const matches = useMediaQuery(theme.breakpoints.up("md"));
    return (
        <Box
            sx={{
                display: "grid",
                width: "100vw",
                height: "100vh",
                gridTemplateAreas: matches
                    ? `"header header " 
                                        "main main "
                                        "footer footer"`
                    : `"header header " 
             "main main "
            "footer footer"`,
                gridTemplateColumns: matches ? "16.5rem 1fr" : "auto auto",
                gridTemplateRows: matches ? "3.2rem 1fr 5%" : "8% auto 6%",
            }}
        >
            <Box sx={{gridArea: "header"}}>{header}</Box>
            <Box sx={{gridArea: "main"}}>{main}</Box>
            <Box sx={{gridArea: "footer"}}>{footer}</Box>
        </Box>
    );
};

export default Layout;