import type { PropsWithChildren } from 'react';
import { CssBaseline, GlobalStyles, ThemeProvider, createTheme } from '@mui/material';

const adminMrtTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2ebd85',
    },
    secondary: {
      main: '#8ea4b8',
    },
    error: {
      main: '#ff6b6b',
    },
    warning: {
      main: '#ffc107',
    },
    background: {
      default: '#0b1118',
      paper: '#121923',
    },
    text: {
      primary: '#f4f7fb',
      secondary: '#98a8b8',
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 700,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#0b1118',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#121923',
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#f4f7fb',
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          backgroundColor: '#121923',
          color: '#f4f7fb',
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: '#121923',
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          backgroundColor: '#121923',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: '#17212d',
        },
      },
    },
    MuiTableBody: {
      styleOverrides: {
        root: {
          backgroundColor: '#121923',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          backgroundColor: '#121923',
          '&:hover': {
            backgroundColor: 'rgba(255,255,255,0.03)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage:
            'linear-gradient(180deg, rgba(18,25,35,0.98) 0%, rgba(11,17,24,0.98) 100%)',
          border: '1px solid rgba(46,189,133,0.2)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          backgroundColor: '#121923',
          color: '#f4f7fb',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        },
        head: {
          backgroundColor: '#17212d',
          color: '#f4f7fb',
          fontWeight: 700,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: '#c5d0dc',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#17212d',
          color: '#f4f7fb',
          border: '1px solid rgba(255,255,255,0.08)',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(255,255,255,0.06)',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.03)',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#98a8b8',
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          backgroundColor: 'rgba(255,255,255,0.03)',
        },
        icon: {
          color: '#98a8b8',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(255,255,255,0.08)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
        contained: {
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
  },
});

export function AdminMrtProvider({ children }: PropsWithChildren) {
  return (
    <ThemeProvider theme={adminMrtTheme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          '.admin-bots .MuiTablePagination-root, .admin-admins .MuiTablePagination-root, .admin-logs-mrt .MuiTablePagination-root': {
            backgroundColor: '#121923',
            color: '#f4f7fb',
          },
          '.admin-bots .MuiTableSortLabel-root, .admin-admins .MuiTableSortLabel-root, .admin-logs-mrt .MuiTableSortLabel-root': {
            color: '#c5d0dc',
          },
          '.admin-bots .MuiTableSortLabel-icon, .admin-admins .MuiTableSortLabel-icon, .admin-logs-mrt .MuiTableSortLabel-icon': {
            color: '#98a8b8 !important',
          },
          '.admin-bots .MuiCheckbox-root, .admin-admins .MuiCheckbox-root, .admin-logs-mrt .MuiCheckbox-root': {
            color: '#98a8b8',
          },
          '.admin-bots .Mui-TableHeadCell-Content-Labels, .admin-admins .Mui-TableHeadCell-Content-Labels, .admin-logs-mrt .Mui-TableHeadCell-Content-Labels': {
            color: '#f4f7fb',
          },
          '.admin-bots .MuiInputBase-input, .admin-admins .MuiInputBase-input, .admin-logs-mrt .MuiInputBase-input': {
            color: '#f4f7fb',
          },
        }}
      />
      {children}
    </ThemeProvider>
  );
}