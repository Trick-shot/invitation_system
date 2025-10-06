import {useContext, useEffect, useState} from "react";
import {Navigate, Outlet} from "react-router";
import LoadingIndicator from "../components/LoadingIndicator.tsx";
import AuthContext from "../context/authContext.tsx";

const ProtectedRouter = ({navigateTo}: { navigateTo: string }) => {
    const [loading, setLoading] = useState(true);
    const {authUser} = useContext(AuthContext);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            setLoading(false);
        }, 500);

        return () => clearTimeout(timer);
    }, []);
    if (loading) {
        return <LoadingIndicator/>;
    }

    return authUser?.userId ? <Outlet/> : <Navigate replace to={navigateTo}/>;
};

export default ProtectedRouter;
