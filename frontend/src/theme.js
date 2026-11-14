import { createTheme } from '@mui/material/styles'

export const steamDarkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#66c0f4',
      light: '#8fd2f7',
      dark: '#1a9fff',
      contrastText: '#0e141b',
    },
    secondary: {
      main: '#a4d007',
      light: '#beee11',
      dark: '#6aa621',
      contrastText: '#0e141b',
    },
    warning: {
      main: '#f0b429',
    },
    error: {
      main: '#e05252',
    },
    background: {
      default: '#0f151d',
      paper: '#16202d',
    },
    text: {
      primary: '#dce4ec',
      secondary: '#8f98a0',
    },
    divider: 'rgba(102, 192, 244, 0.12)',
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.05rem',
      letterSpacing: '-0.01em',
    },
    subtitle1: {
      fontWeight: 600,
    },
    subtitle2: {
      fontWeight: 600,
      color: '#8f98a0',
      textTransform: 'uppercase',
      fontSize: '0.72rem',
      letterSpacing: '0.06em',
    },
    body2: {
      fontSize: '0.84rem',
      lineHeight: 1.55,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(102, 192, 244, 0.14)',
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#16202d',
          border: '1px solid rgba(102, 192, 244, 0.14)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 6,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.88rem',
          minHeight: 48,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(102, 192, 244, 0.1)',
          padding: '12px 16px',
        },
        head: {
          color: '#8f98a0',
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          backgroundColor: '#121a24',
        },
      },
    },
  },
})
