import * as React from "react";
import type {UserType} from "./UserType";

export interface AuthContextType {
    authUser: UserType | null;
    setAuthUser: React.Dispatch<React.SetStateAction<UserType | null>>;
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}