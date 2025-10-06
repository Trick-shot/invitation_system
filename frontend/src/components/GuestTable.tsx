import {DataGrid, type GridColDef} from '@mui/x-data-grid';
import Paper from '@mui/material/Paper';


interface Guest {
    id: number;
    name: string;
    phoneNumber: string;
}

interface GuestTableProps {
    rows: Guest[];
}

const columns: GridColDef[] = [
    {field: 'id', headerName: 'ID', width: 50},
    {field: 'name', headerName: 'Name', width: 180},
    {
        field: 'phoneNumber',
        headerName: 'Phone No.',
        type: 'number',
        width: 150,
    },
];

const paginationModel = {page: 0, pageSize: 10};

const GuestTable = ({rows}: GuestTableProps) => {
    return (
        <Paper sx={{height: 400, width: '90%', marginTop: 5}}>
            <DataGrid
                rows={rows}
                columns={columns}
                disableColumnMenu
                initialState={{pagination: {paginationModel}}}
                pageSizeOptions={[5, 10]}
                // checkboxSelection
                sx={{border: 0}}
            />
        </Paper>
    );
}

export default GuestTable;