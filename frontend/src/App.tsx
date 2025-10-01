import {useState} from "react";
import {Route, Routes} from "react-router"
import AuthContext from "./context/authContext.tsx";
import Login from "./pages/Login.tsx";
import type {UserType} from "./types/UserType.ts";
import ProtectedRouter from "./utils/ProtectedRouter.tsx";

function App() {
    const [authUser, setAuthUser] = useState<UserType>({
        userId: 0,
        email: "",
        firstName: "",
        lastName: "",
    });
    return (
        <AuthContext value={{authUser, setAuthUser}}>
            <Routes>
                <Route index element={<Login/>} path="login"/>
                <Route element={<ProtectedRouter navigateTo="login" user={authUser}/>}>
                </Route>
            </Routes>
        </AuthContext>
    );
}

export default App
