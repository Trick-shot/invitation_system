import {useEffect, useState} from "react";
import {Route, Routes} from "react-router";
import LoadingIndicator from "./components/LoadingIndicator.tsx";
import AuthContext from "./context/authContext.tsx";
import Login from "./pages/Login.tsx";
import type {UserType} from "./types/UserType.ts";
import ProtectedRouter from "./utils/ProtectedRouter.tsx";

import Dashboard from "./pages/Dashboard.tsx";
import Guest from "./pages/Guest.tsx";
import AddGuest from "./pages/AddGuest.tsx";

function App() {
    const [authUser, setAuthUser] = useState<UserType | null>(null);
    const [loading, setLoading] = useState(true); // Start as true

    useEffect(() => {

        const token = localStorage.getItem("accessToken");
        if (token) {
            // You can also decode and validate token here if needed
            setAuthUser({email: "", firstName: "", lastName: "", userId: 1}); // Dummy, replace with decoded
        }
        setLoading(false);
    }, []);


    return (
        <>
            {
                loading ? <LoadingIndicator/> :
                    <AuthContext.Provider value={{authUser, setAuthUser, loading, setLoading}}>
                        <Routes>
                            <Route index element={<Login/>} path="login"/>
                            <Route path="/" element={<ProtectedRouter navigateTo="login"/>}>
                                <Route element={<Dashboard/>} path="dashboard"/>
                                <Route element={<Guest/>} path="guests"/>
                                <Route element={<AddGuest/>} path="addGuests"/>
                            </Route>
                        </Routes>
                    </AuthContext.Provider>
            }
        </>

    );
}

export default App;
