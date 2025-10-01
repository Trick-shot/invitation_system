import {Navigate, Outlet} from "react-router";
import type {UserType} from "../types/UserType.ts";

const ProtectedRouter = ({navigateTo, user}: { navigateTo: string, user: UserType }) => {
    return user != null ? <Outlet/> : <Navigate replace to={navigateTo}/>;
}
export default ProtectedRouter;