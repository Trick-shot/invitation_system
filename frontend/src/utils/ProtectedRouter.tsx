import {jwtDecode} from "jwt-decode";
import {useContext, useEffect} from "react";
import {Navigate, Outlet} from "react-router";
import AuthContext from "../context/authContext.tsx";


const ProtectedRouter = ({navigateTo}: { navigateTo: string }) => {
    const {authUser, setAuthUser} = useContext(AuthContext)
    useEffect(() => {
        const token = localStorage.getItem("accessToken");
        if (token) {
            try {
                const decoded: any = jwtDecode(token);
                setAuthUser({
                    userId: decoded.user_id,
                    email: decoded.email,
                    firstName: decoded.first_name,
                    lastName: decoded.last_name,
                });
                console.log(decoded)
            } catch (error) {
                console.error("Invalid token:", error);
                setAuthUser(null);
            }
        }
    }, []);

    if (authUser === null) {
        return <div>Loading...</div>;
    }

    return authUser.userId ? <Outlet/> : <Navigate replace to={navigateTo}/>;
}

export default ProtectedRouter;
