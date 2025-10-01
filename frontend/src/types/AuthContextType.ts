import * as React from "react";
import type {UserType} from "./UserType";

export interface AuthContextType {
    authUser: UserType;
    setAuthUser: React.Dispatch<React.SetStateAction<UserType>>;
}