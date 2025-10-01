import {createContext} from "react";
import type {AuthContextType} from "../types/AuthContextType";


const authContext = createContext<AuthContextType>({
    authUser: {
        userId: 0,
        email: "",
        firstName: "",
        lastName: "",
    },
    setAuthUser: () => {
    },
})

export default authContext;