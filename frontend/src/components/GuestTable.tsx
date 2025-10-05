import {DataGrid, type GridColDef} from '@mui/x-data-grid';
import Paper from '@mui/material/Paper';

const columns: GridColDef[] = [
    {field: 'id', headerName: 'ID', width: 50},
    {field: 'name', headerName: 'Name', width: 180},
    {
        field: 'phoneNumber',
        headerName: 'Phone No.',
        type: 'string',
        width: 100,
    },
];

const rows = [
    {id: 1, name: 'Snow Lugoa sdrghasdrh', phoneNumber: 255754375852},
    {id: 2, name: 'Lannister', phoneNumber: 42},
    {id: 3, name: 'Lannister', phoneNumber: 45},
    {id: 4, name: 'Stark', phoneNumber: 16},
    {id: 5, name: 'Targaryen', phoneNumber: null},
    {id: 6, name: 'Melisandre', phoneNumber: 150},
    {id: 7, name: 'Clifford', phoneNumber: 44},
    {id: 8, name: 'Frances', phoneNumber: 36},
    {id: 9, name: 'Roxie', phoneNumber: 65},
];

const paginationModel = {page: 0, pageSize: 10};

const GuestTable = () => {
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